FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app GLNT_CATALOG_DB=/data/catalog.sqlite3
WORKDIR /app
COPY requirements.txt /tmp/glnt-requirements.txt
RUN pip install --no-cache-dir -r /tmp/glnt-requirements.txt \
    && groupadd --gid 10001 glnt \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin glnt \
    && mkdir -p /data /app/services/glnt_catalog /app/dodaios/marketplace \
    && chown 10001:10001 /data
# Deliberately copy only the catalog and its canonical pure manifest parser.
# PEP 420 namespace packages avoid initializing the desktop app on a server.
COPY app.py /app/services/glnt_catalog/app.py
COPY glnt_manifest.py /app/dodaios/marketplace/glnt_manifest.py
USER 10001:10001
EXPOSE 8768
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8768/v1/catalog', timeout=3).close()"]
CMD ["uvicorn", "services.glnt_catalog.app:app", "--host", "0.0.0.0", "--port", "8768", "--no-access-log", "--limit-concurrency", "32"]
