#!/usr/bin/env sh
set -eu
cd -- "$(dirname -- "$0")"
docker compose up -d --build --wait --wait-timeout 180
printf 'Ready: http://127.0.0.1:%s/\n' "${SAMPLE_PORT:-19222}"
