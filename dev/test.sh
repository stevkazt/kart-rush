#!/usr/bin/env bash
# Headless regression tests (macOS + Google Chrome + Node 22+).
#   dev/test.sh autopilot [seconds=80]      full race driven by dev/autopilot.js
#   dev/test.sh trace <probe.js> [seconds=40]  autopilot race + a probe script that pushes lines to __log
#   dev/test.sh shots 300,880:3           screenshots with the player parked at sample idx[:lane] (OUT_DIR)
#   dev/test.sh studio [front,side,back,fast,turn,chase,face]  lobby close-ups of the player's driver
#   dev/test.sh profile [seconds]           CPU profile of a race with drawing off (top functions by self time)
#   dev/test.sh eval '<js expr>'          print a page expression ~1 s after GO (debug globals available)
#   dev/test.sh tap [hold seconds ...]      steering response on open grass (default: 0.25 0.6 1.0)
# Copies the game to a temp dir with debug globals injected, so the real files stay clean.
# TRACK=canyon dev/test.sh ...  runs on another track (default: the meadow).
# Screenshot of the final frame goes to $OUT_DIR (default: the temp dir), path printed at the end.
set -euo pipefail
GAME_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
MODE="${1:-autopilot}"; shift || true
TMP="$(mktemp -d)"
export OUT_DIR="${OUT_DIR:-$TMP}" GAME_PORT=8765
DEBUG_PORT=9333

if lsof -nP -iTCP:$GAME_PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $GAME_PORT is busy (stale test server serving an old copy?): lsof -iTCP:$GAME_PORT"; exit 1
fi
cp -R "$GAME_DIR"/index.html "$GAME_DIR"/style.css "$GAME_DIR"/sound.js "$GAME_DIR"/ui-icons.js "$GAME_DIR"/drivers.js "$GAME_DIR"/manifest.webmanifest "$GAME_DIR"/icons "$TMP"/
sed 's#^// ---------- Boot ----------#window.__k=kart;window.__karts=karts;window.__s=state;Object.defineProperty(window,"__t",{get:()=>track});window.__w=world;window.__in=input;window.__r=renderer;window.__snd=sound;window.__loadTrack=loadTrack;window.__resetKart=resetKart;window.__snap=()=>{camState.snap=true};window.__cam=camera;window.__useItem=useItem;window.__spinOut=spinOut;window.__shells=shells;#' \
  "$GAME_DIR/main.js" > "$TMP/main.js"
grep -q '__in=input' "$TMP/main.js" || { echo "Boot marker not found in main.js"; exit 1; }

(cd "$TMP" && exec python3 -m http.server "$GAME_PORT" >/dev/null 2>&1) & SERVER=$!
cleanup() {
  kill "$SERVER" 2>/dev/null || true
  wait "$SERVER" 2>/dev/null || true
  pkill -f "remote-debugging-port=$DEBUG_PORT" 2>/dev/null || true
}
trap cleanup EXIT
sleep 0.5

run() {
  "$CHROME" --headless=new --autoplay-policy=no-user-gesture-required --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=844,390 \
    --remote-debugging-port=$DEBUG_PORT --user-data-dir="$TMP/profile-$RANDOM" about:blank >/dev/null 2>&1 &
  sleep 2
  node "$GAME_DIR/dev/test.mjs" $DEBUG_PORT "$@"
  pkill -f "remote-debugging-port=$DEBUG_PORT" || true
  sleep 1
}

if [ "$MODE" = "trace" ]; then
  run trace "${2:-40}" "$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
elif [ "$MODE" = "shots" ]; then
  run shots "$1"
elif [ "$MODE" = "studio" ]; then
  run studio "${1:-front,side,back,fast,turn,chase,face}"
elif [ "$MODE" = "profile" ]; then
  run profile "${1:-8}"
elif [ "$MODE" = "eval" ]; then
  run eval "$1"
elif [ "$MODE" = "tap" ]; then
  for T in "${@:-0.25 0.6 1.0}"; do for t in $T; do run tap "$t"; done; done
else
  run autopilot "${1:-80}"
fi
echo "Screenshot(s): $OUT_DIR"
