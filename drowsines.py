import cv2
import dlib
import time
import datetime
import uuid
import imutils 
import numpy as np
from imutils import face_utils
from scipy.spatial import distance as dist
import RPi.GPIO as GPIO
from picamera2 import Picamera2 

try:
    import requests
except Exception:
    requests = None

# --- HARDWARE SETUP ---
VIBE_MOTOR_PIN = 17 

GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
GPIO.setup(VIBE_MOTOR_PIN, GPIO.IN) # Start motor OFF (High-Impedance)

# --- AI & KPI THRESHOLDS ---
EYE_AR_THRESH = 0.25      # Below this = eyes closed
MAR_THRESH = 0.6          # Above this = yawning (Mouth Aspect Ratio)
YAWN_GRACE_SEC = 0.25     # Allow brief MAR dips before resetting yawn
CLOSURE_2S_THRESH = 2.0   # Pattern event for 2s eye closure
CLOSURE_3S_THRESH = 3.0   # Standalone alert for 3s eye closure
NO_EYES_PULSE_START_SEC = 3.0
NO_EYES_PULSE_STOP_SEC = 2.0
PULSE_INTERVAL_SEC = 0.5

# --- TIME TRACKING VARIABLES ---
eye_closure_start = None
last_yawn_time = 0.0
ALARM_ON = False

# --- PATTERN-BASED ALERT TRACKING ---
PATTERN_WINDOW_SEC = 10.0
yawn_events = []
closure_2s_events = []
closure_1_5s_events = []
closure_2s_fired = False
closure_1_5s_fired = False
repeat_lock_armed = False
repeat_lock_enforced = False
open_eyes_start = None
no_face_start = None
eyes_seen_start = None
pulse_mode = False
pulse_on = False
last_pulse_toggle = 0.0
yawn_start = None
yawn_counted = False
yawn_last_above = None
drowsy_alert_count = 0
drowsy_alert_times = []
session_start_time = time.time()
session_id = str(uuid.uuid4())
current_yawn_event_idx = None
last_closure_over_2s_duration = None

# --- SUPABASE LOGGING ---
SUPABASE_URL = "https://tcoschnsmttpnzuhmdko.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjb3NjaG5zbXR0cG56dWhtZGtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDY5NDEsImV4cCI6MjA5NDE4Mjk0MX0.9_As1sRo_jzADJolHVhqsNwkxwvBZgioMo6F176Z0Us"
SUPABASE_TIMEOUT_SEC = 2.0
supabase_enabled = requests is not None and bool(SUPABASE_URL) and bool(SUPABASE_KEY)
supabase_error_count = 0
SUPABASE_MAX_ERROR_PRINTS = 10

def _iso(ts):
    return datetime.datetime.fromtimestamp(ts).isoformat()

def _sb_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

def supabase_insert(table, payload):
    global supabase_error_count
    if not supabase_enabled:
        return
    try:
        url = f"{SUPABASE_URL}/rest/v1/{table}"
        r = requests.post(url, headers=_sb_headers(), json=payload, timeout=SUPABASE_TIMEOUT_SEC)
        if not (200 <= r.status_code < 300):
            if supabase_error_count < SUPABASE_MAX_ERROR_PRINTS:
                supabase_error_count += 1
                print(f"[SUPABASE] INSERT {table} failed: {r.status_code} {r.text[:300]}")
    except Exception as e:
        if supabase_error_count < SUPABASE_MAX_ERROR_PRINTS:
            supabase_error_count += 1
            print(f"[SUPABASE] INSERT {table} exception: {type(e).__name__}: {str(e)[:200]}")

def supabase_update_session(payload):
    global supabase_error_count
    if not supabase_enabled:
        return False
    try:
        url = f"{SUPABASE_URL}/rest/v1/sessions?session_id=eq.{session_id}"
        r = requests.patch(url, headers=_sb_headers(), json=payload, timeout=SUPABASE_TIMEOUT_SEC)
        if not (200 <= r.status_code < 300):
            if supabase_error_count < SUPABASE_MAX_ERROR_PRINTS:
                supabase_error_count += 1
                print(f"[SUPABASE] UPDATE sessions failed: {r.status_code} {r.text[:300]}")
            return False
        return True
    except Exception as e:
        if supabase_error_count < SUPABASE_MAX_ERROR_PRINTS:
            supabase_error_count += 1
            print(f"[SUPABASE] UPDATE sessions exception: {type(e).__name__}: {str(e)[:200]}")
        return False

if supabase_enabled:
    print("[INFO] Supabase logging enabled")
else:
    print("[WARN] Supabase logging disabled (requests/key/url)")

print("[INFO] Loading facial landmark predictor...")
detector = dlib.get_frontal_face_detector()
predictor = dlib.shape_predictor("shape_predictor_68_face_landmarks.dat")

# Get landmark indexes for eyes and inner mouth
(lStart, lEnd) = face_utils.FACIAL_LANDMARKS_IDXS["left_eye"]
(rStart, rEnd) = face_utils.FACIAL_LANDMARKS_IDXS["right_eye"]
(mStart, mEnd) = face_utils.FACIAL_LANDMARKS_IDXS["inner_mouth"]

def eye_aspect_ratio(eye):
    A = dist.euclidean(eye[1], eye[5])
    B = dist.euclidean(eye[2], eye[4])
    C = dist.euclidean(eye[0], eye[3])
    ear = (A + B) / (2.0 * C)
    return ear

def mouth_aspect_ratio(mouth):
    A = dist.euclidean(mouth[1], mouth[7])
    B = dist.euclidean(mouth[2], mouth[6])
    C = dist.euclidean(mouth[3], mouth[5])
    D = dist.euclidean(mouth[0], mouth[4])
    mar = (A + B + C) / (3.0 * D)
    return mar

# --- NATIVE CAMERA SETUP ---
print("[INFO] Starting native Picamera2 stream...")
picam2 = Picamera2()
picam2.preview_configuration.main.size = (640, 480)
picam2.preview_configuration.main.format = "RGB888"
picam2.preview_configuration.align()
picam2.configure("preview")
picam2.start()

time.sleep(2.0) # Let the sensor warm up

def record_drowsy_alert(alert_time):
    global drowsy_alert_count, drowsy_alert_times
    drowsy_alert_count += 1
    drowsy_alert_times.append(alert_time)

def record_drowsy_alert_db(alert_time, event_type, duration):
    record_drowsy_alert(alert_time)
    supabase_insert(
        "alerts",
        {
            "event_type": event_type,
            "duration": float(duration),
            "session_id": session_id,
        },
    )

def get_peak_window(alert_times):
    if not alert_times:
        return None
    buckets = {}
    for ts in alert_times:
        t = time.localtime(ts)
        bucket_min = 0 if t.tm_min < 30 else 30
        bucket_start = time.struct_time(
            (t.tm_year, t.tm_mon, t.tm_mday, t.tm_hour, bucket_min, 0,
             t.tm_wday, t.tm_yday, t.tm_isdst)
        )
        bucket_start_ts = time.mktime(bucket_start)
        buckets[bucket_start_ts] = buckets.get(bucket_start_ts, 0) + 1
    peak_start_ts = max(buckets, key=buckets.get)
    peak_count = buckets[peak_start_ts]
    peak_start = time.localtime(peak_start_ts)
    peak_end_ts = peak_start_ts + (30 * 60) - 1
    peak_end = time.localtime(peak_end_ts)
    window_label = f"{peak_start.tm_hour:02d}:{peak_start.tm_min:02d}-{peak_end.tm_hour:02d}:{peak_end.tm_min:02d}"
    return window_label, peak_count

if supabase_enabled:
    supabase_insert(
        "sessions",
        {
            "session_id": session_id,
            "start_time": _iso(session_start_time),
        },
    )

try:
    while True:
        frame = picam2.capture_array()
        frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        
        # SMALLER DISPLAY SIZE FOR SMOOTH FPS
        frame = imutils.resize(frame, width=400)
        
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        rects = detector(gray, 0) 

        current_time = time.time()

        faces_detected = len(rects) > 0
        if not faces_detected:
            if no_face_start is None:
                no_face_start = current_time
            eyes_seen_start = None
            if current_time - no_face_start >= NO_EYES_PULSE_START_SEC:
                pulse_mode = True
            if pulse_mode:
                if current_time - last_pulse_toggle >= PULSE_INTERVAL_SEC:
                    pulse_on = not pulse_on
                    last_pulse_toggle = current_time
                    if pulse_on:
                        GPIO.setup(VIBE_MOTOR_PIN, GPIO.OUT)
                        GPIO.output(VIBE_MOTOR_PIN, GPIO.LOW)
                    else:
                        GPIO.setup(VIBE_MOTOR_PIN, GPIO.IN)
        else:
            no_face_start = None
            if pulse_mode:
                if eyes_seen_start is None:
                    eyes_seen_start = current_time
                if current_time - eyes_seen_start >= NO_EYES_PULSE_STOP_SEC:
                    pulse_mode = False
                    pulse_on = False
                    last_pulse_toggle = 0.0
                    eyes_seen_start = None
                    if ALARM_ON:
                        GPIO.setup(VIBE_MOTOR_PIN, GPIO.OUT)
                        GPIO.output(VIBE_MOTOR_PIN, GPIO.LOW)
                    else:
                        GPIO.setup(VIBE_MOTOR_PIN, GPIO.IN)
            else:
                eyes_seen_start = None

        for rect in rects:
            shape = predictor(gray, rect)
            shape = face_utils.shape_to_np(shape)

            # --- 1. EXTRACT FEATURES ---
            leftEye = shape[lStart:lEnd]
            rightEye = shape[rStart:rEnd]
            innerMouth = shape[mStart:mEnd]

            leftEAR = eye_aspect_ratio(leftEye)
            rightEAR = eye_aspect_ratio(rightEye)
            ear = (leftEAR + rightEAR) / 2.0
            mar = mouth_aspect_ratio(innerMouth)

            # --- 2. DRAW VISUALS ---
            leftEyeHull = cv2.convexHull(leftEye)
            rightEyeHull = cv2.convexHull(rightEye)
            mouthHull = cv2.convexHull(innerMouth)
            cv2.drawContours(frame, [leftEyeHull], -1, (0, 255, 0), 1)
            cv2.drawContours(frame, [rightEyeHull], -1, (0, 255, 0), 1)
            cv2.drawContours(frame, [mouthHull], -1, (255, 255, 0), 1)

            # Show metrics on screen 
            cv2.putText(frame, f"EAR: {ear:.2f}", (280, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
            cv2.putText(frame, f"MAR: {mar:.2f}", (280, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)

            # Session stats on screen
            elapsed = int(current_time - session_start_time)
            e_hours = elapsed // 3600
            e_minutes = (elapsed % 3600) // 60
            e_seconds = elapsed % 60
            session_start_label = datetime.datetime.fromtimestamp(session_start_time).strftime("%H:%M:%S")
            peak_window = get_peak_window(drowsy_alert_times)
            peak_label = peak_window[0] if peak_window else "N/A"
            cv2.putText(frame, f"Start: {session_start_label}", (10, 140), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
            cv2.putText(frame, f"Elapsed: {e_hours:02d}:{e_minutes:02d}:{e_seconds:02d}", (10, 160), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
            cv2.putText(frame, f"Drowsy alerts: {drowsy_alert_count}", (10, 180), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
            cv2.putText(frame, f"Peak window: {peak_label}", (10, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
            # --- 3. TRACK BEHAVIORS ---
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
                    current_yawn_event_idx = None
                yawn_duration = current_time - yawn_start
                if not yawn_counted and current_time - yawn_start >= 1.0:
                    yawn_counted = True
                    last_yawn_time = current_time
                    yawn_events.append({"t": current_time, "duration": float(yawn_duration)})
                    current_yawn_event_idx = len(yawn_events) - 1
                if yawn_counted:
                    if current_yawn_event_idx is None or current_yawn_event_idx >= len(yawn_events):
                        yawn_events.append({"t": current_time, "duration": float(yawn_duration)})
                        current_yawn_event_idx = len(yawn_events) - 1
                    else:
                        yawn_events[current_yawn_event_idx]["duration"] = float(yawn_duration)
                cv2.putText(frame, f"Yawn: {yawn_duration:.1f}s", (10, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)
                cv2.putText(frame, "YAWN DETECTED", (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)
            else:
                yawn_start = None
                yawn_counted = False
                current_yawn_event_idx = None
                yawn_last_above = None

            # --- 4. KPI ALARM LOGIC ---
            if ear < EYE_AR_THRESH:
                if eye_closure_start is None:
                    eye_closure_start = current_time
                    closure_2s_fired = False
                    closure_1_5s_fired = False
                    open_eyes_start = None
                
                closure_duration = current_time - eye_closure_start
                cv2.putText(frame, f"Closed: {closure_duration:.1f}s", (10, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)

                # Track 2.0s closure for pattern detection
                if closure_duration >= CLOSURE_2S_THRESH:
                    last_closure_over_2s_duration = float(closure_duration)
                    if not closure_2s_fired:
                        closure_2s_fired = True
                        closure_2s_events.append(current_time)

                # TRIGGER CONDITION: Vibrate after exactly 3.0 seconds of closure
                if closure_duration >= CLOSURE_3S_THRESH:
                    if not ALARM_ON:
                        ALARM_ON = True
                        record_drowsy_alert_db(current_time, "prolonged_eye_closure", closure_duration)
                        print("[ALERT] DRIVER DROWSY! VIBRATING SEAT!")
                        GPIO.setup(VIBE_MOTOR_PIN, GPIO.OUT)
                        GPIO.output(VIBE_MOTOR_PIN, GPIO.LOW)

                    cv2.putText(frame, "ALERT!", (10, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            else:
                eye_closure_start = None
                closure_2s_fired = False
                closure_1_5s_fired = False
                if open_eyes_start is None:
                    open_eyes_start = current_time
                if current_time - open_eyes_start >= 3.0:
                    repeat_lock_armed = False
                    repeat_lock_enforced = False
                    open_eyes_start = None
                    yawn_events = []
                    closure_2s_events = []
                    closure_1_5s_events = []
                    if ALARM_ON:
                        ALARM_ON = False
                        GPIO.setup(VIBE_MOTOR_PIN, GPIO.IN)

            # --- 5. PATTERN-BASED ALERT LOGIC (10s WINDOW) ---
            yawn_events = [e for e in yawn_events if current_time - e["t"] <= PATTERN_WINDOW_SEC]
            closure_2s_events = [t for t in closure_2s_events if current_time - t <= PATTERN_WINDOW_SEC]
            closure_1_5s_events = [t for t in closure_1_5s_events if current_time - t <= PATTERN_WINDOW_SEC]

            # Track 1.5s closures for repeated pattern
            if ear < EYE_AR_THRESH and closure_duration >= 1.5:
                if not closure_1_5s_fired:
                    closure_1_5s_fired = True
                    closure_1_5s_events.append(current_time)
                    if repeat_lock_armed and not repeat_lock_enforced:
                        repeat_lock_enforced = True
                        open_eyes_start = current_time
                        if not ALARM_ON:
                            ALARM_ON = True
                            record_drowsy_alert_db(current_time, "pattern_repeated_eye_closure", 1.5)
                            print("[ALERT] DRIVER DROWSY! VIBRATING SEAT!")
                            GPIO.setup(VIBE_MOTOR_PIN, GPIO.OUT)
                            GPIO.output(VIBE_MOTOR_PIN, GPIO.LOW)

            pattern_1 = len(closure_2s_events) > 0 and len(yawn_events) > 0
            pattern_3 = len(closure_1_5s_events) >= 3

            if pattern_1 or pattern_3:
                if not ALARM_ON:
                    ALARM_ON = True
                    open_eyes_start = current_time
                    if pattern_1:
                        last_closure_ts = closure_2s_events[-1]
                        last_yawn = yawn_events[-1]
                        if last_yawn["t"] > last_closure_ts:
                            last_pattern_duration = float(last_yawn["duration"])
                        else:
                            last_pattern_duration = float(last_closure_over_2s_duration) if last_closure_over_2s_duration is not None else CLOSURE_2S_THRESH
                        record_drowsy_alert_db(current_time, "pattern_eye_closure_yawn", last_pattern_duration)
                    else:
                        record_drowsy_alert_db(current_time, "pattern_repeated_eye_closure", 1.5)
                    print("[ALERT] DRIVER DROWSY! VIBRATING SEAT!")
                    GPIO.setup(VIBE_MOTOR_PIN, GPIO.OUT)
                    GPIO.output(VIBE_MOTOR_PIN, GPIO.LOW)
                if pattern_3:
                    repeat_lock_armed = True

        cv2.imshow("DriveWise Drowsiness Detection", frame)
        
        if cv2.waitKey(1) & 0xFF == ord('q'):
            stop_time = time.time()
            ok = supabase_update_session(
                {
                    "end_time": _iso(stop_time),
                    "total_alerts": int(drowsy_alert_count),
                    "session_duration": float(stop_time - session_start_time),
                    "start_time": _iso(session_start_time),
                }
            )
            if supabase_enabled:
                print(f"[SUPABASE] Final session update on quit: {'OK' if ok else 'FAILED'}")
            break

except KeyboardInterrupt:
    print("\n[INFO] Force exiting...")
finally:
    session_end_time = time.time()
    session_duration = int(session_end_time - session_start_time)
    session_start_str = datetime.datetime.fromtimestamp(session_start_time).strftime("%Y-%m-%d %H:%M:%S")
    session_end_str = datetime.datetime.fromtimestamp(session_end_time).strftime("%Y-%m-%d %H:%M:%S")
    hours = session_duration // 3600
    minutes = (session_duration % 3600) // 60
    seconds = session_duration % 60
    peak_window = get_peak_window(drowsy_alert_times)

    print("[INFO] Session summary:")
    print(f"  Start: {session_start_str}")
    print(f"  End:   {session_end_str}")
    print(f"  Duration: {hours:02d}:{minutes:02d}:{seconds:02d}")
    print(f"  Drowsy vibrations: {drowsy_alert_count}")
    if peak_window:
        window_label, peak_count = peak_window
        print(f"  Peak alert window: {window_label} ({peak_count} alerts)")
    else:
        print("  Peak alert window: N/A")

    ok = supabase_update_session(
        {
            "end_time": _iso(session_end_time),
            "total_alerts": int(drowsy_alert_count),
            "session_duration": float(session_end_time - session_start_time),
            "start_time": _iso(session_start_time),
        }
    )
    if supabase_enabled:
        print(f"[SUPABASE] Final session update in finally: {'OK' if ok else 'FAILED'}")

    print("[INFO] Cleaning up hardware...")
    try:
        GPIO.setup(VIBE_MOTOR_PIN, GPIO.IN)
    except Exception:
        pass
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