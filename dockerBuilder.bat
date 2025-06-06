@echo off
setlocal

REM --- Build and push frontend ---
echo === Building and Pushing Frontend ===
cd /d "%~dp0RMA_server\frontend"
docker build -t react-frontend .
docker tag react-frontend doglasdannyt/react-frontend:latest
docker push doglasdannyt/react-frontend:latest

REM --- Build and push backend ---
echo === Building and Pushing Backend ===
cd /d "%~dp0RMA_server\backend"
docker build -t flask-backend .
docker tag flask-backend doglasdannyt/backend:latest
docker push doglasdannyt/backend:latest

REM --- Return to original directory ---
cd /d "%~dp0"

echo === All Done! ===
pause
