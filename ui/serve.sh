#!/usr/bin/env bash
# Serve the UI from a localhost origin (Ollama allows localhost CORS; file:// it
# does not). Then open the printed URL.
cd "$(dirname "$0")" || exit 1
PORT="${1:-8800}"
echo "corpse UI  ->  http://localhost:${PORT}/corpse.html"
exec python3 -m http.server "$PORT"
