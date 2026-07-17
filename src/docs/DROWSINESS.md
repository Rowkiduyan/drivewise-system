# Drowsiness Detection

## Overview

The Drowsiness Detection module monitors the driver's level of alertness in real time using computer vision. It analyzes the driver's eyes and mouth to detect signs of fatigue. When drowsiness is detected based on predefined conditions, the system warns the driver through a vibration motor and an audio alert.

---

## Purpose

The purpose of this module is to reduce fatigue-related accidents by continuously monitoring the driver's condition and providing immediate alerts when drowsiness is detected.

---

## Hardware

### Raspberry Pi 4 Model B

Acts as the main processing unit. It runs the drowsiness detection program and controls the connected hardware.

### Raspberry Pi Camera Module Noir

Captures the driver's face in real time for computer vision processing.

### Vibration Motor

Provides haptic feedback to alert the driver when drowsiness is detected.

---

## Software

### Programming Language

- Python

### Computer Vision

- OpenCV
- MediaPipe

---

## Detection Pipeline

1. The Raspberry Pi boots and starts the detection program.
2. The Camera Module Noir captures live video frames.
3. Each frame is analyzed using MediaPipe.
4. The system monitors:
   - Eye Aspect Ratio (EAR)
   - Mouth Aspect Ratio (MAR)
   - Face visibility
5. The system evaluates whether any alert conditions are met.
6. If an alert condition is satisfied:
   - The vibration motor is activated.
   - An audio alert is sent to the driver's mobile application.
7. Once the driver's eyes remain open continuously for at least three seconds, the vibration alert stops.

---

## Detection Logic

### Continuous Eye Closure

An alert is triggered when the driver's eyes remain closed continuously for at least **3 seconds**.

---

### Eye Closure + Yawning

An alert is triggered when:

- Eye closure lasts for approximately **2 seconds**, and
- Yawning lasts for approximately **1.5 seconds**

within the same **10-second observation window**.

---

### Repeated Eye Closure

An alert is triggered when eye closure lasting at least **1.5 seconds** occurs **three or more times** within a **10-second observation window**.

---

### Eyes Not Detected

If the driver's eyes cannot be detected continuously for **3 seconds**, the system assumes the driver's face is no longer properly visible and activates a pulse-like vibration alert.

---

## Alert Behavior

When drowsiness is detected:

- The vibration motor is activated.
- An audio alert is sent to the driver's mobile application.
- The vibration continues until the driver's eyes remain open continuously for at least **3 seconds**.

---

## Data Produced

When an alert occurs, the system records:

- Detection timestamp
- Drowsiness duration
- Alert event

This information is intended to be stored in the database and associated with the corresponding trip after system integration.

---

## Current Limitations

The current implementation has several known limitations:

- Sunglasses are not supported.
- Camera obstruction may prevent accurate detection.
- If the driver's eyes cannot be detected due to environmental conditions, the system may trigger the eye-not-detected alert.
- Performance may depend on maintaining a clear view of the driver's face.

---

## Current Integration

The drowsiness detection module is currently integrated with the DriveWise web application.

In the current prototype:

- The Raspberry Pi sends drowsiness events directly to the web application.
- Detection records are stored in the database.
- The system currently supports a single active driver and a single hardware device.

The prototype is intended to validate the detection system before expanding to support multiple trucks and drivers.