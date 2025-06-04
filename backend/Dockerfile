FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    unixodbc-dev \
    libodbc1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Expose the correct port
EXPOSE 8088

# Start the app (Flask must run on host=0.0.0.0 and port=8088)
CMD ["python", "run.py"]
