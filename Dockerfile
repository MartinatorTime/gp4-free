# Use Python slim image for smaller size
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

# Install system dependencies and clean up in one layer
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    git \
    ffmpeg \
    && pip install --no-cache-dir --upgrade pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Clone repo and install dependencies in one layer
RUN git clone --depth 1 https://github.com/xtekky/gpt4free.git . && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir -U g4f[all]

# 7. Expose the API port
EXPOSE 1337

# 8. Set the default command to run the FastAPI server
CMD ["python3", "-m", "g4f.cli", "api", "--port", "1337", "--timeout", "300"]
