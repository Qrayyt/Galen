#!/bin/sh
set -eu
root="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
tag="${1:-galen-glnt-catalog:local}"
context="$(mktemp -d)"
trap 'rm -rf -- "$context"' EXIT HUP INT TERM
cp "$root/services/glnt_catalog/Dockerfile" "$context/Dockerfile"
cp "$root/services/glnt_catalog/app.py" "$context/app.py"
cp "$root/services/glnt_catalog/requirements.txt" "$context/requirements.txt"
cp "$root/dodaios/marketplace/glnt_manifest.py" "$context/glnt_manifest.py"
docker build --tag "$tag" "$context"
