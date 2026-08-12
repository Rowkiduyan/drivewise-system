#!/usr/bin/env python
"""Feeds a captured multi-leg route into gps_logs as sequential GPS ticks, so
you can watch DriverDeliveries.jsx's Live Navigation "Stop X of Y" indicator
advance in a real browser without a physical device or real driving.

Reads SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY from .env (repo root) directly,
inserts rows via the REST API with service_role (bypasses gps-upload's device
auth — this is a test-only shortcut, never how the real Pi uploads).

Usage:
    python scripts/gps-route-capture.mjs > /tmp/legs.json   (run capture first)
    python scripts/gps-route-simulate.py <session_id> <delivery_id> /tmp/legs.json [delay_seconds]

See scripts/README.md for the full fixture setup this depends on.
"""
import json
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def read_env(key):
    env_file = REPO_ROOT / ".env"
    for line in env_file.read_text().splitlines():
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip()
    raise SystemExit(f"{key} not found in .env")


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        raise SystemExit(1)

    session_id, delivery_id, legs_path = sys.argv[1:4]
    delay = float(sys.argv[4]) if len(sys.argv) > 4 else 1.3

    supabase_url = read_env("VITE_SUPABASE_URL").rstrip("/")
    service_key = read_env("SUPABASE_SERVICE_ROLE_KEY")

    legs = json.loads(Path(legs_path).read_text())
    points = [p for leg in legs for p in leg]
    print(f"{len(points)} points across {len(legs)} legs, ~{delay}s apart "
          f"(~{len(points) * delay:.0f}s total)")

    url = f"{supabase_url}/rest/v1/gps_logs"
    for idx, p in enumerate(points):
        body = json.dumps({
            "session_id": session_id,
            "delivery_request_id": delivery_id,
            "latitude": p["lat"],
            "longitude": p["lng"],
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
        })
        result = subprocess.run([
            "curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
            "-X", "POST", url,
            "-H", f"apikey: {service_key}",
            "-H", f"Authorization: Bearer {service_key}",
            "-H", "Content-Type: application/json",
            "-H", "Prefer: return=minimal",
            "-d", body,
        ], capture_output=True, text=True)
        print(f"tick {idx}: {p['lat']:.6f},{p['lng']:.6f} -> {result.stdout}")
        time.sleep(delay)
    print("done")


if __name__ == "__main__":
    main()
