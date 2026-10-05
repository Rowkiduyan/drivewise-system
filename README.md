# DriveWise

### AI-Powered Driver Drowsiness Monitoring and GPS Tracking System

DriveWise is a web-based driver safety and fleet monitoring system developed as a capstone project for MARVEL Trucking Solutions, Inc.

It combines a React web application with a Raspberry Pi monitoring device to detect driver drowsiness, track vehicle location, and record safety alerts.

## Features

- Real-time driver drowsiness detection using facial landmarks
- Eye Aspect Ratio (EAR) and Mouth Aspect Ratio (MAR) analysis
- Raspberry Pi camera and vibration-based driver alerts
- GPS-based truck and trip tracking
- Route and trip monitoring
- Drowsiness and route deviation alert logging
- Driver safety performance monitoring
- Role-based interfaces for Admin, Supervisor, Driver, and Customer

## Technologies

- **Frontend:** React, JavaScript, Vite, Tailwind CSS
- **Backend:** Supabase, PostgreSQL
- **Computer Vision:** Python, OpenCV, dlib
- **Hardware:** Raspberry Pi, Pi Camera, GPS Module
- **Maps:** Google Maps API, Leaflet
- **Testing:** Playwright
- **Version Control:** Git, GitHub

## System Overview

DriveWise consists of two main components:

**Web Application**
- Fleet and trip management
- Driver monitoring
- GPS visualization
- Safety alerts and reports

**Raspberry Pi Monitoring Device**
- Captures the driver's face using a camera
- Processes facial landmarks
- Calculates EAR and MAR
- Detects drowsiness conditions
- Activates a vibration alert
- Sends monitoring data to Supabase

## Project Status

Academic capstone project developed for demonstration and evaluation purposes.

## Disclaimer

DriveWise is an academic prototype and is not intended to replace certified driver safety systems.
