# Production GLNT catalog deployment runbook

Target: the existing Galen HTTPS host, with an isolated loopback catalog and no changes to the central API or installer mirror. Proposed public base: `https://galen.galenite.org/glnt`. Do not set the desktop default until this endpoint is actually verified.

## Mandatory preflight

- Use a verified source SHA; build-image.sh copies the exact shared manifest parser from that revision.
- Verify the host's filesystem has at least 2 GiB free before pulling/building images, and check RAM, port 8768, certificate expiry, HTTPS reachability, and `nginx -t`. Do not remove existing data, images, releases or logs to make room without review.
- Build and run `sh services/glnt_catalog/smoke-image.sh <image>` with scratch data; do not use production credentials for this.
- Back up the existing nginx virtual host and any previous catalog database before changes. Do not overwrite an existing catalog or its token.

## New isolated service

Run on the approved host, from the audited source checkout. The following are commands for a first deployment only (refuse if the directory or container already exists):

```sh
test "$(df --output=avail -k /var/lib/docker | tail -n1 | tr -d ' ')" -ge 2097152
test ! -e /srv/galen-glnt-catalog
install -d -m 0750 /srv/galen-glnt-catalog
install -d -m 0700 -o 10001 -g 10001 /srv/galen-glnt-catalog/data
umask 077
python3 -c 'import secrets; print("GLNT_ADMIN_TOKEN="+secrets.token_hex(32))' > /srv/galen-glnt-catalog/service.env
sh services/glnt_catalog/build-image.sh galen-glnt-catalog:reviewed
sh services/glnt_catalog/smoke-image.sh galen-glnt-catalog:reviewed
docker run -d --name galen-glnt-catalog --restart unless-stopped \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory=256m --pids-limit=64 \
  --log-opt max-size=5m --log-opt max-file=2 \
  --env-file /srv/galen-glnt-catalog/service.env \
  -v /srv/galen-glnt-catalog/data:/data:rw \
  -p 127.0.0.1:8768:8768 galen-glnt-catalog:reviewed
curl -fsS http://127.0.0.1:8768/v1/catalog
```

The moderator token is generated on the host and must never appear in logs, Git, the client or the conversation. The catalog data directory is the only persistent writable mount. The container has no access to other services or the Docker socket.

## HTTPS

Copy `nginx-rate.conf` into the nginx HTTP context and include `nginx-locations.conf` only in the existing Galen HTTPS server, keeping an exact backup of its old config outside enabled directories. Test `nginx -t` before reload. On failure restore the backup and remove only the newly installed catalog snippets. Do not change TLS, existing routes or installer publication. Verify:

- Site home and installer metadata remain unchanged; public catalog returns API v1.
- Public moderation/docs/arbitrary routes are 404; unauthenticated submission is 401.
- Submission rate/size limits work; HTTPS certificate is valid. No package bytes or credentials are stored.
- Live publisher authorization: submit a user-owned public fixture repository using the existing signed-in desktop flow. Moderate from loopback using protected credentials, verify direct GitHub download, update, removal, and audit records.

## Rollback / upgrade

Back up SQLite with its consistent backup API or stop the catalog before copying the data directory (including WAL/SHM). Preserve old image and environment. Build and smoke-test a new image against scratch data before stopping the old service. On failure restore the previous image and matching database snapshot, keeping the old HTTPS path intact. For a failed first deployment, restore nginx config and stop/remove only the new catalog container; retain its data and token for inspection. Never touch the main Galenite API or user data.

## Resolved storage blocker and production deployment (2026-11-25)

Moscow was 97% full; user-approved installer redirect migration freed space to 2.5 GiB. Catalog image `galen-glnt-catalog:302c6485` was built from exact source and isolated smoke passed. Live container is healthy at 127.0.0.1:8768 with public HTTPS at https://galen.galenite.org/glnt. Catalog returned API v1; moderation and docs returned 404, anonymous submissions 401. Site and download feed healthy. Remaining disk 2.3 GiB. Nginx backup: /var/backups/galen-nginx-before-glnt.conf. No changes to Amsterdam. Live signed-in publisher, moderated fixture, install/update/removal acceptance remains pending; no release published.
