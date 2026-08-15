"""
DriveWise Raspberry Pi drowsiness monitor.

Rewritten from the repo-root prototypes (drowsines.py / renz_test.py) to
match the current backend architecture:
  - 00_IMPLEMENTATION_RULES.md ("Raspberry Pi Responsibilities" / one narrow
    exception for `session_active`)
  - 04_DEVICE_BOOT_AND_HEARTBEAT.md
  - 05_GPS_PIPELINE.md
  - 06_DROWSINESS_ALERT_PIPELINE.md

Key differences from the prototypes:
  - Authenticates as a device (device_id/device_secret) against the deployed
    Edge Functions instead of writing directly to Postgres with a hardcoded
    anon key. Never learns session_id/trip_id/driver_id/truck_id -- the
    backend resolves all Session/Trip attribution.
  - Calls device-heartbeat every 10s and reads back `session_active`, which
    locally gates detection, the vibration motor, and alert uploads (the one
    documented exception to "the Pi never learns backend state").
  - Calls gps-upload every 1s UNCONDITIONALLY, never gated on
    session_active -- GPS must keep flowing through a Pause (anti-theft);
    the backend alone decides whether to accept/attribute each reading.
  - Calls alert-upload immediately when a detection threshold is reached,
    only while session_active is true.
  - Uses dlib for eye/mouth landmark tracking -- same library both original
    prototypes used, and the EAR/MAR formulas/thresholds below are an exact
    port of drowsines.py's, not a reimplementation. (MediaPipe was tried
    first per an earlier decision, see STATUS.md, but hit two real
    deployment blockers on actual Pi 4 hardware while testing this script
    live: the official mediapipe>=1.0 wheel SIGILLs on this Pi 4's CPU
    (compiled assuming AES extensions it doesn't have), and the only
    fallback community build (mediapipe-rpi4) predates this Pi's Python
    3.13 by years with no compatible wheel available. Reverted to dlib to
    unblock hardware testing rather than chase a Python-version detour.)

Config via environment variables -- device_secret is a real per-device
credential shown once at registration and must never be hardcoded:
  DRIVEWISE_DEVICE_ID
  DRIVEWISE_DEVICE_SECRET
  DRIVEWISE_SUPABASE_URL       (optional, defaults to the deployed project)
  DRIVEWISE_SHAPE_PREDICTOR    (optional, path to a pre-downloaded
                                 shape_predictor_68_face_landmarks.dat)

Detection thresholds/state-machine logic are ported unchanged from
drowsines.py, so the same real-world alert cadence that script already
produced should carry over directly -- no recalibration expected, unlike
the MediaPipe attempt.
"""

import bz2
import collections
import datetime
import os
import sys
import threading
import time

import cv2
import dlib
import requests
import serial
import RPi.GPIO as GPIO
from picamera2 import Picamera2
from imutils import face_utils
from scipy.spatial import distance as dist

# --- CONFIG ---
SUPABASE_URL = os.environ.get("DRIVEWISE_SUPABASE_URL", "https://tcoschnsmttpnzuhmdko.supabase.co")
# The publishable/anon key -- not a secret (same one embedded in the web
# app's client bundle). Supabase's platform gateway requires a valid
# Authorization header on every Edge Function call before the function's
# own code runs at all; this is separate from, and in addition to, the
# device_id/device_secret check inside device-heartbeat/gps-upload/
# alert-upload themselves.
SUPABASE_ANON_KEY = os.environ.get(
    "DRIVEWISE_SUPABASE_ANON_KEY", "sb_publishable_Dc5LzgRTh80Rzik12MUMcg_V_Y5mpWF"
)
DEVICE_ID = os.environ.get("DRIVEWISE_DEVICE_ID")
DEVICE_SECRET = os.environ.get("DRIVEWISE_DEVICE_SECRET")

if not DEVICE_ID or not DEVICE_SECRET:
    sys.exit("[FATAL] Set DRIVEWISE_DEVICE_ID and DRIVEWISE_DEVICE_SECRET environment variables.")

HEARTBEAT_URL = f"{SUPABASE_URL}/functions/v1/device-heartbeat"
GPS_UPLOAD_URL = f"{SUPABASE_URL}/functions/v1/gps-upload"
ALERT_UPLOAD_URL = f"{SUPABASE_URL}/functions/v1/alert-upload"
SUPABASE_AUTH_HEADERS = {"Authorization": f"Bearer {SUPABASE_ANON_KEY}", "apikey": SUPABASE_ANON_KEY}

HEARTBEAT_INTERVAL_SEC = 10.0
GPS_UPLOAD_INTERVAL_SEC = 1.0
HTTP_TIMEOUT_SEC = 8.0

# drowsines.py used GPIO 17; renz_test.py used GPIO 4 -- these prototypes
# disagreed with each other on the wiring. Confirmed via live hardware
# testing 2026-08-11: pin 17 (drowsines.py) toggled correctly (verified with
# a headless diagnostic copy of drowsines.py itself) but the motor never
# actually vibrated; pin 4 (renz_test.py) does vibrate on this same Pi. The
# real wiring is pin 4. Override via env var if a different unit's wiring
# differs from this one.
VIBE_MOTOR_PIN = int(os.environ.get("DRIVEWISE_VIBE_MOTOR_PIN", "4"))

# GPS module baud rate -- confirmed via live hardware testing 2026-08-13 that
# this unit's module talks at 38400, not the more common NMEA default of
# 9600 (gps_test.py, a separate diagnostic script, confirmed this by
# actually locking a fix at 38400 while this script's hardcoded 9600 read
# nothing but noise off the same wiring). Override via env var if a
# different unit's module uses a different rate.
GPS_BAUD_RATE = int(os.environ.get("DRIVEWISE_GPS_BAUD_RATE", "38400"))

# --- AI & KPI THRESHOLDS (carried over from the dlib prototypes as a
# starting point -- see the recalibration note above) ---
EYE_AR_THRESH = 0.25
MAR_THRESH = 0.6
YAWN_GRACE_SEC = 0.25
CLOSURE_1_5S_THRESH = 1.5
CLOSURE_2S_THRESH = 2.0
CLOSURE_3S_THRESH = 3.0
NO_EYES_PULSE_START_SEC = 3.0
NO_EYES_PULSE_STOP_SEC = 2.0
PULSE_INTERVAL_SEC = 0.5
PATTERN_WINDOW_SEC = 10.0
OPEN_EYES_RESET_SEC = 3.0

# --- GPIO ---
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
GPIO.setup(VIBE_MOTOR_PIN, GPIO.IN)  # off (high-impedance) by default


def set_vibration(on):
    if on:
        GPIO.setup(VIBE_MOTOR_PIN, GPIO.OUT)
        GPIO.output(VIBE_MOTOR_PIN, GPIO.LOW)
    else:
        GPIO.setup(VIBE_MOTOR_PIN, GPIO.IN)


# --- STATE SHARED ACROSS THREADS ---
session_active = False
session_active_lock = threading.Lock()

current_lat = 0.0
current_lon = 0.0
gps_lock = threading.Lock()

running = True


# --- BACKEND CALLS ---
# Shared across calls so repeated requests to the same host reuse one
# TCP+TLS connection instead of renegotiating on every call -- matters a
# lot on high-latency links (e.g. GPRS) given GPS uploads fire every 1s.
_http_session = requests.Session()


def call_heartbeat():
    global session_active
    try:
        r = _http_session.post(
            HEARTBEAT_URL,
            json={"device_id": DEVICE_ID, "device_secret": DEVICE_SECRET},
            headers=SUPABASE_AUTH_HEADERS,
            timeout=HTTP_TIMEOUT_SEC,
        )
        if r.status_code == 200:
            new_active = bool(r.json().get("session_active"))
            with session_active_lock:
                changed = new_active != session_active
                session_active = new_active
            if changed:
                print(f"[HEARTBEAT] session_active -> {new_active}")
        else:
            print(f"[HEARTBEAT] failed: {r.status_code} {r.text[:200]}")
    except Exception as e:
        print(f"[HEARTBEAT] exception: {type(e).__name__}: {e}")


_gps_upload_confirmed = False


def call_gps_upload(lat, lon):
    global _gps_upload_confirmed
    try:
        r = _http_session.post(
            GPS_UPLOAD_URL,
            json={
                "device_id": DEVICE_ID,
                "device_secret": DEVICE_SECRET,
                "latitude": lat,
                "longitude": lon,
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            },
            headers=SUPABASE_AUTH_HEADERS,
            timeout=HTTP_TIMEOUT_SEC,
        )
        if r.status_code == 200 and not _gps_upload_confirmed:
            _gps_upload_confirmed = True
            print(f"[GPS] upload confirmed working ({lat}, {lon})")
        elif r.status_code != 200:
            # Expected/frequent whenever no Trip is in progress for this
            # device -- not worth logging every second.
            pass
    except Exception as e:
        print(f"[GPS] exception: {type(e).__name__}: {e}")


def call_alert_upload(event_type, duration):
    try:
        r = _http_session.post(
            ALERT_UPLOAD_URL,
            json={
                "device_id": DEVICE_ID,
                "device_secret": DEVICE_SECRET,
                "event_type": event_type,
                "duration": float(duration),
            },
            headers=SUPABASE_AUTH_HEADERS,
            timeout=HTTP_TIMEOUT_SEC,
        )
        if r.status_code == 200:
            print(f"[ALERT] uploaded: {event_type} ({duration:.1f}s)")
        else:
            print(f"[ALERT] upload failed: {r.status_code} {r.text[:200]}")
    except Exception as e:
        print(f"[ALERT] exception: {type(e).__name__}: {e}")


# --- GPS SERIAL READER (unchanged from renz_test.py) ---
# The original prototypes only ever showed GPS status on the cv2 debug
# window (removed here, headless); without that there was no way to tell
# "module not talking at all" from "talking but no satellite fix yet" from
# the console alone, so both are logged once each below.
_gps_saw_any_sentence = False
_gps_saw_fix = False


def parse_gps_nmea(line):
    global current_lat, current_lon, _gps_saw_any_sentence, _gps_saw_fix
    try:
        # $GNRMC (combined-constellation GNSS) alongside $GPRMC (GPS-only) --
        # confirmed 2026-08-13 this unit's module prefixes with GN, not GP.
        if line.startswith("$GPRMC") or line.startswith("$GNRMC"):
            if not _gps_saw_any_sentence:
                _gps_saw_any_sentence = True
                print("[GPS] receiving NMEA data from module")
            parts = line.split(",")
            if len(parts) >= 7 and parts[2] == "A":
                lat_raw, lat_dir, lon_raw, lon_dir = parts[3], parts[4], parts[5], parts[6]

                def to_decimal_degrees(raw, is_lon=False):
                    if not raw:
                        return 0.0
                    deg_len = 3 if is_lon else 2
                    degrees = float(raw[:deg_len])
                    minutes = float(raw[deg_len:])
                    return degrees + (minutes / 60.0)

                lat = to_decimal_degrees(lat_raw, False)
                if lat_dir == "S":
                    lat = -lat
                lon = to_decimal_degrees(lon_raw, True)
                if lon_dir == "W":
                    lon = -lon
                with gps_lock:
                    current_lat = round(lat, 6)
                    current_lon = round(lon, 6)
                if not _gps_saw_fix:
                    _gps_saw_fix = True
                    print(f"[GPS] satellite fix acquired: {current_lat}, {current_lon}")
    except Exception:
        pass  # malformed NMEA line -- skip


GPS_RECONNECT_DELAY_SEC = 5.0


def gps_reader_thread():
    # Was previously a single try/except around the whole open+read loop --
    # any exception (initial open failure, or a transient read error mid-
    # stream from e.g. a loose/disconnected serial cable) fell through to the
    # except below and ended this thread for good, silently: no more NMEA
    # parsing, current_lat/current_lon frozen at whatever they last were
    # (possibly still 0.0,0.0 if it died before ever getting a fix), and
    # nothing printed again after the one-time failure message. gps_upload_
    # thread would then either upload a stale frozen position forever or
    # never upload at all, with no further indication anything was wrong.
    # Now retries indefinitely: a failure (open or mid-read) is caught,
    # logged, and the port is reopened after a short delay instead of
    # ending the thread.
    while running:
        try:
            ser = serial.Serial("/dev/serial0", baudrate=GPS_BAUD_RATE, timeout=1)
            print("[GPS] serial port opened")
            while running:
                if ser.in_waiting > 0:
                    line = ser.readline().decode("ascii", errors="replace").strip()
                    parse_gps_nmea(line)
                time.sleep(0.1)
        except Exception as e:
            print(f"[GPS] serial error, reconnecting in {GPS_RECONNECT_DELAY_SEC:.0f}s: {type(e).__name__}: {e}")
            time.sleep(GPS_RECONNECT_DELAY_SEC)


def gps_upload_thread():
    # Deliberately unconditional -- GPS-during-Pause (05_GPS_PIPELINE.md):
    # the Pi never checks session_active here, the backend alone decides
    # whether to accept/attribute each reading.
    while running:
        with gps_lock:
            lat, lon = current_lat, current_lon
        if lat != 0.0 or lon != 0.0:
            call_gps_upload(lat, lon)
        time.sleep(GPS_UPLOAD_INTERVAL_SEC)


def heartbeat_thread():
    while running:
        call_heartbeat()
        time.sleep(HEARTBEAT_INTERVAL_SEC)


# --- DLIB FACE LANDMARK SETUP ---
# Exact port of drowsines.py's setup -- the 68-point predictor file isn't
# bundled with dlib and wasn't included in this repo either, so it's
# auto-downloaded (compressed) on first run if not already present.
SHAPE_PREDICTOR_PATH = os.environ.get(
    "DRIVEWISE_SHAPE_PREDICTOR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "shape_predictor_68_face_landmarks.dat"),
)
SHAPE_PREDICTOR_URL = "http://dlib.net/files/shape_predictor_68_face_landmarks.dat.bz2"


def _ensure_shape_predictor():
    if os.path.exists(SHAPE_PREDICTOR_PATH):
        return
    print(f"[INFO] Downloading facial landmark predictor to {SHAPE_PREDICTOR_PATH}...")
    r = requests.get(SHAPE_PREDICTOR_URL, timeout=120)
    r.raise_for_status()
    with open(SHAPE_PREDICTOR_PATH, "wb") as f:
        f.write(bz2.decompress(r.content))
    print("[INFO] Predictor downloaded.")


_ensure_shape_predictor()

print("[INFO] Loading facial landmark predictor...")
detector = dlib.get_frontal_face_detector()
predictor = dlib.shape_predictor(SHAPE_PREDICTOR_PATH)

(lStart, lEnd) = face_utils.FACIAL_LANDMARKS_IDXS["left_eye"]
(rStart, rEnd) = face_utils.FACIAL_LANDMARKS_IDXS["right_eye"]
(mStart, mEnd) = face_utils.FACIAL_LANDMARKS_IDXS["inner_mouth"]


def eye_aspect_ratio(eye):
    a = dist.euclidean(eye[1], eye[5])
    b = dist.euclidean(eye[2], eye[4])
    c = dist.euclidean(eye[0], eye[3])
    return (a + b) / (2.0 * c) if c else 0.0


def mouth_aspect_ratio(mouth):
    a = dist.euclidean(mouth[1], mouth[7])
    b = dist.euclidean(mouth[2], mouth[6])
    c = dist.euclidean(mouth[3], mouth[5])
    d = dist.euclidean(mouth[0], mouth[4])
    return (a + b + c) / (3.0 * d) if d else 0.0


# --- DETECTION STATE (logic carried over from drowsines.py as-is, only the
# landmark source and upload mechanism changed) ---
eye_closure_start = None
closure_2s_fired = False
closure_1_5s_fired = False
open_eyes_start = None
no_face_start = None
eyes_seen_start = None
pulse_mode = False
pulse_on = False
last_pulse_toggle = 0.0
face_not_detected_fired = False
yawn_start = None
yawn_counted = False
yawn_last_above = None
last_closure_over_2s_duration = None
yawn_events = collections.deque()
closure_2s_events = collections.deque()
closure_1_5s_events = collections.deque()
repeat_lock_armed = False
repeat_lock_enforced = False
ALARM_ON = False

print("[INFO] Starting camera...")
picam2 = None
camera_available = False
try:
    picam2 = Picamera2()
    picam2.preview_configuration.main.size = (640, 480)
    picam2.preview_configuration.main.format = "RGB888"
    picam2.preview_configuration.align()
    picam2.configure("preview")
    picam2.start()
    time.sleep(2.0)
    camera_available = True
except Exception as e:
    # 09_EDGE_CASES.md gap #3: a camera fault must not take down heartbeat/
    # GPS too -- degrade detection in isolation and keep the rest running.
    print(f"[ERROR] Camera unavailable, detection disabled: {e}")

print("[INFO] Starting background threads (heartbeat, GPS)...")
threading.Thread(target=heartbeat_thread, daemon=True).start()
threading.Thread(target=gps_reader_thread, daemon=True).start()
threading.Thread(target=gps_upload_thread, daemon=True).start()

print(f"[INFO] DriveWise Pi monitor running as {DEVICE_ID}. Ctrl+C to stop.")

try:
    while True:
        with session_active_lock:
            active = session_active

        if not active:
            # No Active Session -- per 00_IMPLEMENTATION_RULES.md's one
            # documented exception, this is what silences detection/
            # vibration/alerts on Pause without a manual power-off. Reset
            # all detection state so nothing carries into the next Active
            # session (GPS keeps running regardless, in its own threads).
            # Unconditional, not gated on ALARM_ON: the no-face-detected
            # pulse (below) drives the motor via its own pulse_on flag,
            # independent of ALARM_ON -- a pause landing mid-pulse left the
            # motor physically on even though ALARM_ON was never True.
            set_vibration(False)
            ALARM_ON = False
            eye_closure_start = None
            yawn_start = None
            no_face_start = None
            pulse_mode = False
            pulse_on = False
            face_not_detected_fired = False
            yawn_events.clear()
            closure_2s_events.clear()
            closure_1_5s_events.clear()
            time.sleep(0.2)
            continue

        if not camera_available:
            # Detection stays down for the rest of this run, but heartbeat/
            # GPS threads above are already running independently.
            time.sleep(1.0)
            continue

        frame = picam2.capture_array()
        frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        rects = detector(gray, 0)

        current_time = time.time()
        face_detected = len(rects) > 0

        if not face_detected:
            if no_face_start is None:
                no_face_start = current_time
            eyes_seen_start = None
            no_face_duration = current_time - no_face_start
            if no_face_duration >= NO_EYES_PULSE_START_SEC:
                pulse_mode = True
                # face_not_detected is its own event_type (06_DROWSINESS_
                # ALERT_PIPELINE.md) -- fire once per continuous no-face
                # episode, same "fire once, reset on recovery" pattern the
                # other three event types already use below.
                if not face_not_detected_fired:
                    face_not_detected_fired = True
                    call_alert_upload("face_not_detected", no_face_duration)
                if current_time - last_pulse_toggle >= PULSE_INTERVAL_SEC:
                    pulse_on = not pulse_on
                    last_pulse_toggle = current_time
                    set_vibration(pulse_on)
        else:
            no_face_start = None
            face_not_detected_fired = False
            if pulse_mode:
                if eyes_seen_start is None:
                    eyes_seen_start = current_time
                if current_time - eyes_seen_start >= NO_EYES_PULSE_STOP_SEC:
                    pulse_mode = False
                    pulse_on = False
                    last_pulse_toggle = 0.0
                    eyes_seen_start = None
                    set_vibration(ALARM_ON)
            else:
                eyes_seen_start = None

            shape = predictor(gray, rects[0])
            shape = face_utils.shape_to_np(shape)
            left_eye = shape[lStart:lEnd]
            right_eye = shape[rStart:rEnd]
            inner_mouth = shape[mStart:mEnd]
            ear = (eye_aspect_ratio(left_eye) + eye_aspect_ratio(right_eye)) / 2.0
            mar = mouth_aspect_ratio(inner_mouth)

            # --- yawn tracking ---
            mar_above = mar > MAR_THRESH
            if mar_above:
                yawn_last_above = current_time
            yawning_active = mar_above or (
                yawn_start is not None
                and yawn_last_above is not None
                and current_time - yawn_last_above <= YAWN_GRACE_SEC
            )
            if yawning_active:
                if yawn_start is None:
                    yawn_start = current_time
                    yawn_counted = False
                yawn_duration = current_time - yawn_start
                if not yawn_counted and yawn_duration >= 1.0:
                    yawn_counted = True
                    yawn_events.append({"t": current_time, "duration": float(yawn_duration)})
            else:
                yawn_start = None
                yawn_counted = False
                yawn_last_above = None

            # --- eye closure tracking ---
            if ear < EYE_AR_THRESH:
                if eye_closure_start is None:
                    eye_closure_start = current_time
                    closure_2s_fired = False
                    closure_1_5s_fired = False
                    open_eyes_start = None
                closure_duration = current_time - eye_closure_start

                if closure_duration >= CLOSURE_2S_THRESH:
                    last_closure_over_2s_duration = float(closure_duration)
                    if not closure_2s_fired:
                        closure_2s_fired = True
                        closure_2s_events.append(current_time)

                if closure_duration >= CLOSURE_3S_THRESH and not ALARM_ON:
                    ALARM_ON = True
                    call_alert_upload("prolonged_eye_closure", closure_duration)
                    set_vibration(True)

                if closure_duration >= CLOSURE_1_5S_THRESH and not closure_1_5s_fired:
                    closure_1_5s_fired = True
                    closure_1_5s_events.append(current_time)
                    if repeat_lock_armed and not repeat_lock_enforced:
                        repeat_lock_enforced = True
                        open_eyes_start = current_time
                        if not ALARM_ON:
                            ALARM_ON = True
                            call_alert_upload("pattern_repeated_eye_closure", CLOSURE_1_5S_THRESH)
                            set_vibration(True)
            else:
                eye_closure_start = None
                closure_2s_fired = False
                closure_1_5s_fired = False
                if open_eyes_start is None:
                    open_eyes_start = current_time
                if current_time - open_eyes_start >= OPEN_EYES_RESET_SEC:
                    repeat_lock_armed = False
                    repeat_lock_enforced = False
                    open_eyes_start = None
                    yawn_events.clear()
                    closure_2s_events.clear()
                    closure_1_5s_events.clear()
                    if ALARM_ON:
                        ALARM_ON = False
                        set_vibration(False)

            # --- pattern windows (10s rolling) ---
            while yawn_events and current_time - yawn_events[0]["t"] > PATTERN_WINDOW_SEC:
                yawn_events.popleft()
            while closure_2s_events and current_time - closure_2s_events[0] > PATTERN_WINDOW_SEC:
                closure_2s_events.popleft()
            while closure_1_5s_events and current_time - closure_1_5s_events[0] > PATTERN_WINDOW_SEC:
                closure_1_5s_events.popleft()

            pattern_eye_closure_yawn = len(closure_2s_events) > 0 and len(yawn_events) > 0
            pattern_repeated = len(closure_1_5s_events) >= 3

            if (pattern_eye_closure_yawn or pattern_repeated) and not ALARM_ON:
                ALARM_ON = True
                open_eyes_start = current_time
                if pattern_eye_closure_yawn:
                    last_closure_ts = closure_2s_events[-1]
                    last_yawn = yawn_events[-1]
                    if last_yawn["t"] > last_closure_ts:
                        duration = float(last_yawn["duration"])
                    else:
                        duration = float(last_closure_over_2s_duration or CLOSURE_2S_THRESH)
                    call_alert_upload("pattern_eye_closure_yawn", duration)
                else:
                    call_alert_upload("pattern_repeated_eye_closure", CLOSURE_1_5S_THRESH)
                set_vibration(True)
            if pattern_repeated:
                repeat_lock_armed = True

        time.sleep(0.03)  # ~30fps cap

except KeyboardInterrupt:
    print("\n[INFO] Stopping...")
finally:
    running = False
    set_vibration(False)
    try:
        GPIO.cleanup()
    except Exception:
        pass
    try:
        picam2.stop()
    except Exception:
        pass
    try:
        cv2.destroyAllWindows()
    except Exception:
        pass
