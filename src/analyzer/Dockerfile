# syntax=docker/dockerfile:1
ARG PYTHON_VERSION=3.12

# ── deps stage ────────────────────────────────────────────────────────────────
FROM python:${PYTHON_VERSION}-alpine AS deps

WORKDIR /deps

RUN pip install --no-cache-dir \
    fastapi==0.115.6 \
    uvicorn==0.32.1 \
    httpx==0.28.1 \
    redis==5.2.1 \
    python-dotenv==1.0.1

# ── runtime stage ──────────────────────────────────────────────────────────────
FROM python:${PYTHON_VERSION}-alpine AS runtime

LABEL org.opencontainers.image.title="twitter-analyzer" \
      org.opencontainers.image.description="Twitter personality analyzer powered by Claude" \
      org.opencontainers.image.source="https://github.com/0x3654/dumbtests" \
      org.opencontainers.image.licenses="MIT"

# Copy installed packages from deps stage
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages

COPY --from=deps /usr/local/bin/uvicorn /usr/local/bin/uvicorn

WORKDIR /app

RUN addgroup -g 1001 app && \
    adduser -u 1001 -G app -s /bin/sh -D app

COPY --chown=app:app . .

USER app

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
