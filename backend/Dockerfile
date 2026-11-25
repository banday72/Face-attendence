FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    unzip \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    libopenblas-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt requirements-face.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt -r requirements-face.txt

RUN useradd --create-home --shell /bin/bash appuser
ENV HOME=/home/appuser

RUN mkdir -p /home/appuser/.insightface/models/buffalo_sc \
    && curl -fsSL https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_sc.zip -o /tmp/buffalo_sc.zip \
    && unzip -q /tmp/buffalo_sc.zip -d /home/appuser/.insightface/models/buffalo_sc \
    && rm /tmp/buffalo_sc.zip

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
RUN chown -R appuser:appuser /app /home/appuser/.insightface
USER appuser

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
