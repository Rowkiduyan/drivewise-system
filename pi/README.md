# DriveWise Raspberry Pi monitor

Rewrite of the repo-root prototypes (`drowsines.py`, `renz_test.py`) against the
current backend â€” see `drowsiness_monitor.py`'s module docstring for the full
list of what changed and why.

## Setup

Newer Raspberry Pi OS blocks system-wide `pip install` (PEP 668) â€” use a
virtual environment with `--system-site-packages` so it can still see
`picamera2`/GPIO if those are installed via `apt` instead of pip:

```
python3 -m venv --system-site-packages venv
source venv/bin/activate
pip install -r requirements.txt
```

**Heads up on `dlib`:** it doesn't ship a plain PyPI wheel for most ARM
setups â€” pip will either pull a piwheels.org prebuilt wheel (fast) or fall
back to compiling from source (slow, 20+ min on a Pi, and needs `cmake` +
a C++ compiler: `sudo apt install cmake build-essential` first if it tries
to compile). If `pip install -r requirements.txt` hangs or fails on `dlib`
specifically, that's what's happening â€” let me know what it prints.

The 68-point facial landmark predictor file isn't bundled with dlib or this
repo; `drowsiness_monitor.py` downloads it automatically on first run.

Set these environment variables before running (do not hardcode `DEVICE_SECRET`
anywhere â€” it's a real per-device credential, shown once by Admin's
"Register Device" action):

```
export DRIVEWISE_DEVICE_ID=DV-XXXX
export DRIVEWISE_DEVICE_SECRET=<the plaintext secret from register-device>
```

If your motor isn't wired to GPIO 4 (the default, confirmed against the
`renz_test.py`-wired test unit â€” `drowsines.py` used GPIO 17 instead, so
the two prototypes disagree; check yours physically before assuming
either), override it:

```
export DRIVEWISE_VIBE_MOTOR_PIN=17
```

**GPS module wired to the GPIO UART pins (not a USB dongle) needs two checks
before it'll work at all**, confirmed the hard way on real hardware
2026-08-13:

1. **`/dev/serial0` must resolve to `ttyAMA0`, not `ttyS0`.** By default,
   Bluetooth holds the Pi's one full hardware UART (`ttyAMA0`), leaving
   `/dev/serial0` aliased to the mini-UART (`ttyS0`) instead — clock-coupled
   to the GPU/core clock, unreliable for continuous serial reads (symptom:
   `gps_reader_thread` either throws `could not open serial port` or opens
   fine but never receives a single byte). Check with `readlink -f
   /dev/serial0`; if it prints `/dev/ttyS0`, add this to
   `/boot/firmware/config.txt` under the `[all]` section:
   ```
   dtoverlay=disable-bt
   ```
   then `sudo reboot` and re-check. (`hciuart.service`, the older mechanism
   for this, doesn't exist on Debian 13/trixie-based Pi OS images — the
   `dtoverlay` alone is sufficient there, nothing else to disable.)
2. **Baud rate and NMEA sentence prefix vary by module.** This script
   defaults to `DRIVEWISE_GPS_BAUD_RATE=38400` and matches both `$GPRMC`
   (GPS-only) and `$GNRMC` (combined-constellation) sentences — confirmed
   against one real module on 2026-08-13 after the stock `9600`/`$GPRMC`-only
   assumption silently received nothing even with the UART fixed. If a
   different unit's module uses a different rate, override it:
   ```
   export DRIVEWISE_GPS_BAUD_RATE=9600
   ```
   To sanity-check what your specific module actually needs before trusting
   this script, a quick standalone test (open `/dev/serial0` directly, print
   raw lines, try common rates like `9600`/`38400`) is faster to iterate on
   than debugging through the full script's threads.

Then:

```
python3 drowsiness_monitor.py
```

Expect these console lines on a healthy run: `[INFO] DriveWise Pi monitor
running as DV-XXXX.`, then within ~10s no `[HEARTBEAT] failed:` line, and
(if a GPS module is attached and has sky visibility) `[GPS] receiving NMEA
data from module` followed eventually by `[GPS] satellite fix acquired:
...` and `[GPS] upload confirmed working (...)`.

## Confirmed working on real hardware (2026-08-11)

Camera + dlib detection, `device-heartbeat`, `alert-upload`
(`prolonged_eye_closure`/`face_not_detected` both verified landing in the
`alerts` table), and the vibration motor (GPIO 4) were all tested end-to-end
against a real Raspberry Pi 4 and the live deployed backend. `gps-upload`
was being verified when this note was last updated â€” see `STATUS.md` for
the current state of that specific test before assuming it's done.

## GSM/cellular connectivity (SIM800C, confirmed working 2026-08-12)

For units without WiFi, a USB-to-serial SIM800C (quad-band 2G/GPRS, not
3G/4G) module can supply the Pi's internet connection instead. Confirmed
end-to-end on this same Debian 13 (trixie) based Raspberry Pi OS image, SIM
carrier Smart (APN `internet`, no username/password).

**Note on `minicom`/`screen`/`picocom`:** all three are currently absent
from trixie's `main` archive (not a repo-config issue â€” confirmed via
`apt-cache policy` after verifying `main`/`contrib`/`non-free` were all
enabled and `apt update` succeeded cleanly). To send AT commands without any
of them:
```
stty -F /dev/ttyUSB0 115200 raw -echo
sudo cat /dev/ttyUSB0 &      # reader, backgrounded
sudo sh -c 'echo -e "AT\r" > /dev/ttyUSB0'
# ... AT+CPIN?, AT+CSQ, AT+CREG?, AT+CGATT? the same way
kill %1                      # stop the reader when done
```

**PPP setup** (`ppp` itself is present in trixie, unlike the terminal
tools above):
```
sudo apt install ppp
```
`/etc/chatscripts/gprs`:
```
ABORT "BUSY"
ABORT "NO CARRIER"
ABORT "NO DIALTONE"
ABORT "ERROR"
TIMEOUT 30
"" "ATZ"
OK "AT+CGDCONT=1,\"IP\",\"internet\""
OK "ATD*99#"
CONNECT ""
```
`/etc/ppp/peers/gprs`:
```
/dev/ttyUSB0
115200
connect "/usr/sbin/chat -v -f /etc/chatscripts/gprs"
noipdefault
defaultroute
usepeerdns
persist
noauth
```

**DNS gotcha:** the carrier hands out its own (often private-range)
nameservers via `usepeerdns`, but pppd only adds a route for its own
peer address â€” not for those DNS servers. If they're not reachable via
whatever's currently the default route (e.g. WiFi, or nothing), name
resolution fails (`Errno -3`/`Could not resolve host`) even though the
link itself is up (plain `ping -I ppp0 8.8.8.8` by IP still works). Fixed
by adding a script that (re-)applies routes to the DNS servers pppd itself
just assigned, every time the link comes up â€” handles the fact that the
carrier can hand out different DNS IPs on each connection:
`/etc/ppp/ip-up.d/0001-add-dns-routes` (executable):
```sh
#!/bin/sh
[ -n "$DNS1" ] && ip route replace "$DNS1/32" dev "$1"
[ -n "$DNS2" ] && ip route replace "$DNS2/32" dev "$1"
```

**Persistence across reboots** â€” `/etc/systemd/system/gprs-ppp.service`:
```ini
[Unit]
Description=GPRS PPP connection via SIM800C
After=network.target

[Service]
ExecStart=/usr/sbin/pppd call gprs nodetach
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
`sudo systemctl daemon-reload && sudo systemctl enable --now gprs-ppp.service`.

**Confirmed working end-to-end 2026-08-12** with WiFi fully disabled
(`ppp0` as the only/default route): DNS resolution, TLS handshake, and a
real HTTPS round-trip to the deployed Supabase project all succeeded over
the cellular link alone. `device-heartbeat` confirmed reaching the backend
under real GSM conditions (`devices.last_ping` observed advancing on
schedule).

**Two application-level fixes needed once real traffic (not just curl)
ran over this link**, both in `drowsiness_monitor.py`:
- `HTTP_TIMEOUT_SEC` raised from `3.0` to `8.0` â€” GPRS round-trip latency
  alone measured 340-826ms in testing; 3s wasn't enough headroom for a
  full DNS+TCP+TLS+response cycle on top of that, causing intermittent
  heartbeat `ReadTimeout`s.
- Heartbeat/GPS/alert calls now share one `requests.Session()` instead of
  each opening a fresh one (`requests.post(...)`'s default behavior) â€”
  reuses one TCP+TLS connection instead of renegotiating on every call,
  which matters given GPS uploads fire every 1s per
  `05_GPS_PIPELINE.md` and were previously competing with the heartbeat
  for the link's limited GPRS throughput.

**Not yet tested over this link:** `gps-upload` itself â€” no satellite fix
was available during this test (indoors, no sky visibility). The fixes
above should apply equally once that's tested, but that combination
(sustained 1/s uploads + heartbeat, both over real GPRS bandwidth, not
just a single curl request) hasn't actually been observed yet.

## Boot automation (confirmed working 2026-08-12)

`04_DEVICE_BOOT_AND_HEARTBEAT.md`'s "Raspberry Pi Startup" section calls for
this script to auto-launch on boot with no manual login. Two systemd units,
both `enable`d so they persist across reboots:

- `gprs-ppp.service` (already covered above) â€” brings up the GSM/PPP link.
- `drivewise-monitor.service` â€” runs this script itself, credentials supplied
  via `EnvironmentFile=/etc/drivewise/monitor.env` (mode `600`, not committed
  to this repo) instead of `export`ing them by hand every SSH session:
  ```ini
  [Unit]
  Description=DriveWise Pi drowsiness monitor
  After=gprs-ppp.service
  Wants=gprs-ppp.service

  [Service]
  Type=simple
  User=drivewise
  WorkingDirectory=/home/drivewise/pi
  EnvironmentFile=/etc/drivewise/monitor.env
  ExecStart=/home/drivewise/pi/venv/bin/python3 -u /home/drivewise/pi/drowsiness_monitor.py
  Restart=always
  RestartSec=5

  [Install]
  WantedBy=multi-user.target
  ```
  The `-u` flag matters: under systemd, `stdout` is a pipe (not a TTY), so
  Python fully-buffers `print()` output by default â€” without `-u`, log lines
  can sit invisible in a buffer for a long time even though the script is
  running fine. `journalctl -u drivewise-monitor.service -f` showed nothing
  past the camera-init lines until this was added.

  Enable with `sudo systemctl daemon-reload && sudo systemctl enable --now
  drivewise-monitor.service`.

Two things this surfaced worth knowing about if you're setting this up again:
- **Stop any manually-running copy of the script first** (`Ctrl+C` your SSH
  session) before starting the service â€” two processes fighting over the
  camera fails with `RuntimeError: Failed to acquire camera: Device or
  resource busy`, not an error in the service config itself.
- **`nano`'s file-lock prompt can corrupt the file if mishandled** â€” if nano
  warns a file is "being edited," pressing `y` to continue can end up typing
  that `y` directly into the document instead of just answering the prompt
  (happened here: `y[Unit]` on line 1 broke the whole file, causing systemd's
  `Assignment outside of section. Ignoring.` warnings for every line under
  it). Symptom to watch for; fix is just deleting the stray character.

**Confirmed via a real cold-boot test** (`sudo reboot`, then reconnecting):
both services came up `active (running)` entirely on their own â€” GSM link
negotiated, camera initialized, monitor reached its normal running state,
and heartbeats succeeded â€” with zero manual steps. WiFi is intentionally
left enabled alongside GSM (not disabled) so the Pi stays reachable over SSH
for maintenance; GSM still wins the default route on its own (pppd's route
has no explicit metric, beating WiFi's DHCP-assigned `metric 600`), so app
traffic goes over the cellular link either way. DNS is pinned to public
resolvers (`8.8.8.8`/`1.1.1.1`) via an immutable `/etc/resolv.conf`
(`chattr +i`) so NetworkManager (WiFi) and pppd (GSM) stop fighting over
which nameserver wins â€” the original version of this conflict caused
DNS queries to route out over whichever link's nameserver they were
pointed at, even if that link couldn't actually reach it.

## Not done here

- **Threshold recalibration is not expected to be needed** â€” `EYE_AR_THRESH`/
  `MAR_THRESH`/etc. and the eye/mouth landmark math are an exact port of
  `drowsines.py`'s dlib-based formulas, confirmed firing correctly on real
  hardware (see above), so no retuning is expected.
