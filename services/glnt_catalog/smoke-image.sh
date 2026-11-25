#!/bin/sh
set -eu
image="${1:-galen-glnt-catalog:local}"
name="galen-glnt-smoke-$$"
cleanup() { docker rm -f -v "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT HUP INT TERM
# Anonymous scratch data only. No production credentials or catalog state.
docker run -d --name "$name" --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
    --cap-drop ALL --security-opt no-new-privileges \
    --memory=256m --pids-limit=64 --mount type=tmpfs,destination=/data,tmpfs-size=16777216,tmpfs-mode=0777 \
    -p 127.0.0.1::8768 "$image" >/dev/null
port="$(docker port "$name" 8768/tcp | head -n 1 | cut -d: -f2)"
base="http://127.0.0.1:$port"
for n in $(seq 1 30); do
    if curl -fsS --max-time 2 "$base/v1/catalog" >/dev/null 2>&1; then break; fi
    sleep 1
done
curl -fsS "$base/v1/catalog" | python -c 'import json,sys; v=json.load(sys.stdin); assert v == {"api_version":1,"items":[],"total":0,"next_offset":None}, v'
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/v1/catalog/unknown")" = 404
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/v1/moderation")" = 403
test "$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"repository_url":"https://github.com/owner/repo"}' "$base/v1/submissions")" = 401
test "$(curl -sS -o /dev/null -w '%{http_code}' "$base/openapi.json")" = 404
printf '%s\n' 'GLNT isolated container smoke passed'
