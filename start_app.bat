@echo off
ECHO Starting Backend Server...
cd /d "C:\Users\my\Documents\shadowing langs"
start "Backend" cmd /k "python app.py"

ECHO Starting Frontend Development Server...
cd /d "C:\Users\my\Documents\shadowing langs\frontend"
start "Frontend" cmd /k "npm install && npm run dev"