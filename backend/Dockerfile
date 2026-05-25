# Python backend Dockerfile for RenderCV
FROM python:3.12-slim

WORKDIR /app

# Keep the image independent of GitHub release downloads. RenderCV installs the
# Typst runtime through its Python `full` extra below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy rendercv source code first (needed for local install)
COPY src /tmp/rendercv-src/src
COPY pyproject.toml /tmp/rendercv-src/
COPY README.md /tmp/rendercv-src/
COPY uv.lock /tmp/rendercv-src/

# Install rendercv from local source with full extras
RUN pip install --no-cache-dir "/tmp/rendercv-src[full]"

# Copy requirements and install other dependencies
COPY web/backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY web/backend ./

# Set Python path
ENV PYTHONPATH="/app"
ENV ENVIRONMENT="production"
ENV PORT=8000

EXPOSE 8000

# Use shell form to expand $PORT environment variable
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
