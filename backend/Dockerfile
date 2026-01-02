# Python backend Dockerfile for RenderCV
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for PDF/PNG generation
RUN apt-get update && apt-get install -y \
    typst \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY . ./

# Set Python path
ENV PYTHONPATH="/app"
ENV ENVIRONMENT="production"

EXPOSE 8000

# Run with uvicorn
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
