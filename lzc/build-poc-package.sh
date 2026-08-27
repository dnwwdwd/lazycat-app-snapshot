#!/bin/sh
set -eu

# The POC remains a separately built diagnostic artifact. It is not the
# product server and is intentionally absent from the formal V1 navigation.
REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DIST_ROOT="$REPO_ROOT/lzc-dist-poc"

rm -rf "$DIST_ROOT"
mkdir -p "$DIST_ROOT/bin" "$DIST_ROOT/web" "$DIST_ROOT/lzc"

cd "$REPO_ROOT"
npm ci --prefix apps/web
npm run build --prefix apps/web

CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
  go build -trimpath -ldflags='-s -w' \
  -o "$DIST_ROOT/bin/backup-poc" ./apps/server/cmd/poc

cp -a "$REPO_ROOT/apps/web/dist/." "$DIST_ROOT/web/"
cp "$REPO_ROOT/lzc/run-poc.sh" "$DIST_ROOT/lzc/run.sh"
chmod 0755 "$DIST_ROOT/bin/backup-poc" "$DIST_ROOT/lzc/run.sh"

find "$DIST_ROOT" -maxdepth 3 -type f -print | sort
