#!/usr/bin/env bash
# Serve BOTH play surfaces from a localhost origin (the model hosts allow
# localhost CORS; file:// they do not). Serves the repo root so the featured
# page and the minimal one share the same origin and config.
cd "$(dirname "$0")/.." || exit 1
PORT="${1:-8800}"
echo "the parlor      ->  http://localhost:${PORT}/"
echo "the open sheet  ->  http://localhost:${PORT}/ui/corpse.html"
exec python3 -m http.server "$PORT"
