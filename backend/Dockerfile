# Python backend Dockerfile for RenderCV
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies and Typst from GitHub releases
# Cache bust: v2
RUN apt-get update && apt-get install -y \
    curl \
    xz-utils \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://github.com/typst/typst/releases/download/v0.12.0/typst-x86_64-unknown-linux-musl.tar.xz \
    | tar -xJ -C /usr/local/bin --strip-components=1 typst-x86_64-unknown-linux-musl/typst

# Copy requirements first for caching
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY . ./

# Set Python path
ENV PYTHONPATH="/app"
ENV ENVIRONMENT="production"
ENV PORT=8000

EXPOSE 8000

# Use shell form to expand $PORT environment variable
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
