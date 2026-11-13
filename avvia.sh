#!/bin/sh
# Avvia la dashboard su http://localhost:8000 (serve solo un server statico)
cd "$(dirname "$0")"
PORT=${1:-8000}
( sleep 1; command -v open >/dev/null && open "http://localhost:$PORT" ) &
python3 -m http.server "$PORT"
