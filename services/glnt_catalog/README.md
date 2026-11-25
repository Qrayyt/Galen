# GLNT catalog service

Run from the repository root with a dedicated environment:
```sh
python -m pip install -r services/glnt_catalog/requirements.txt
uvicorn services.glnt_catalog.app:app --host 127.0.0.1 --port 8768
```

Set GLNT_CATALOG_DB to a dedicated SQLite file. Set GLNT_ADMIN_TOKEN using a protected service environment, at least 32 random characters. Never commit either secrets or database files. Place behind the approved Galenite HTTPS reverse proxy with request-size and rate limits. Do not expose the moderation token to the desktop app. Public submissions use a GitHub access token solely to verify identity and repository write permission; no token is persisted. The catalog stores metadata, not manifest or package bytes. Moderation is manual and audited.

Deployment is not performed by this source change. Do not modify production nginx or the central API until tests, backup, certificate and rollback checks pass.

For an isolated container containing only the catalog and the canonical manifest parser, run `sh services/glnt_catalog/build-image.sh` and `sh services/glnt_catalog/smoke-image.sh`. See [DEPLOY.md](DEPLOY.md) for preflight, protected HTTPS routes, storage, smoke testing and rollback. Do not deploy before preflight succeeds.
