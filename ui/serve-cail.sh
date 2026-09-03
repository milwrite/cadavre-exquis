#!/usr/bin/env bash
# Serve both play surfaces through the CAIL Gateway relay (ui/cail_proxy.py).
# The key stays in this shell's environment; the browser only ever sees the
# same-origin /api/cail routes. Prompts for the key if CAIL_API_KEY is unset.
cd "$(dirname "$0")/.." || exit 1
if [ -z "${CAIL_API_KEY:-}" ]; then
  read -rs "CAIL_API_KEY?CAIL API key: " 2>/dev/null || read -rs -p "CAIL API key: " CAIL_API_KEY
  printf '\n'
  export CAIL_API_KEY
fi
exec python3 ui/cail_proxy.py "${1:-8800}"
