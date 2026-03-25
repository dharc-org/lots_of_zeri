FROM python:3.11-slim

LABEL maintainer="Fondazione Federico Zeri — Università di Bologna"
LABEL description="ZAC Platform — FastAPI Backend"

WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY docker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY . .

# Create log directory
RUN mkdir -p logs

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--access-log"]
