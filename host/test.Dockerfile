FROM python:3.13-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends mosquitto && rm -rf /var/lib/apt/lists/*
WORKDIR /tests
COPY host/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY host/ ./
CMD ["python3", "-m", "unittest", "discover", "-s", ".", "-p", "test_*.py", "-v"]
