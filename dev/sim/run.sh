#!/usr/bin/env bash
# Accelerated bot races (fake clock, drawing off, muted, ~3.5x real time). Results: one JSON per race in <out dir>, then a summary.
#   dev/sim/run.sh <out dir> track:persona:count [track:persona:count ...]
#   dev/sim/run.sh /tmp/x canyon:vertical:4 canyon:skilled:3
# Personas: vertical (default view, auto-gas, Easy), skilled (lifts and brakes, Hard), medium, offwide / offfence (run wide on Green Valley's sweeper).
# One worker runs its jobs in turn; to compare builds, start several with GAME_PORT and DEBUG_PORT set, on the SAME mix of races (single races vary a lot).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; GAME="$(cd "$HERE/../.." && pwd)"
OUT="$1"; shift; mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"
GAME_PORT="${GAME_PORT:-8791}"; DEBUG_PORT="${DEBUG_PORT:-9411}"
TMP="$(mktemp -d)"
cp -R "$GAME"/index.html "$GAME"/style.css "$GAME"/sound.js "$GAME"/ui-icons.js "$GAME"/drivers.js "$GAME"/manifest.webmanifest "$GAME"/icons "$TMP"/
sed 's#^// ---------- Boot ----------#window.__k=kart;window.__karts=karts;window.__s=state;Object.defineProperty(window,"__t",{get:()=>track});window.__w=world;window.__in=input;window.__r=renderer;window.__snd=sound;window.__resetKart=resetKart;window.__useItem=useItem;window.__tele=tele;#' "$GAME/main.js" > "$TMP/main.js"
(cd "$TMP" && exec python3 -m http.server "$GAME_PORT" >/dev/null 2>&1) & SERVER=$!
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --mute-audio --autoplay-policy=no-user-gesture-required --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=844,390 --disable-background-timer-throttling --disable-renderer-backgrounding --remote-debugging-port="$DEBUG_PORT" --user-data-dir="$TMP/profile" about:blank >/dev/null 2>&1 & CHROME=$!
trap 'kill "$SERVER" "$CHROME" 2>/dev/null || true; rm -rf "$TMP"' EXIT
sleep 1
for _ in $(seq 40); do curl -s "127.0.0.1:$DEBUG_PORT/json/version" >/dev/null && break; sleep 0.5; done
for job in "$@"; do IFS=: read -r t p c <<<"$job"; node "$HERE/sim.mjs" "$DEBUG_PORT" "$GAME_PORT" "$t" "$p" "$c" "$OUT/races.jsonl"; done
python3 -I "$HERE/ana.py" "$OUT"
