# 1. Use Debian 12 (Bookworm) which has Python 3.11 as default
FROM debian:bookworm

# Set environment variables for non-interactive installation
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=off \
    DEBIAN_FRONTEND=noninteractive

# 2. Update and install necessary system packages.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    git \
    && rm -rf /var/lib/apt/lists/*

# 3. Set the working directory
WORKDIR /app

# 4. Clone the gpt4free repository
RUN git clone --depth 1 https://github.com/xtekky/gpt4free.git .

# 5. Install Python dependencies, breaking the system-packages lock
# This is safe inside a container.
RUN python3 -m pip install --break-system-packages -r requirements.txt

# 6. Install the gpt4free package itself
RUN python3 -m pip install --break-system-packages .

# 7. Expose the API port
EXPOSE 1337

# 8. Set the default command to run the FastAPI server
CMD ["python3", "-m", "g4f.cli", "api", "--host", "0.0.0.0", "--port", "1337"]