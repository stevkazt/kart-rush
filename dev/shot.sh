#!/usr/bin/env bash
# Screenshots to keep: dev/test.sh shots/studio into dev/shots/ (gitignored), every file named after the build
# and commit it shows (+ the driver if DRIVER is set), e.g. dev/shots/b35-512ed60+dirty-Luna-studio-back.png.
# Same arguments as dev/test.sh.
#   dev/shot.sh studio profile,chase       ITEMS=1 dev/shot.sh shots 300
set -euo pipefail
GAME_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$(sed -n "s/^const VERSION = 'kart-rush-v\([0-9]*\)'.*/\1/p" "$GAME_DIR/sw.js")"
COMMIT="$(git -C "$GAME_DIR" rev-parse --short HEAD)"
git -C "$GAME_DIR" diff --quiet HEAD -- . ':!dev/shots' || COMMIT="$COMMIT+dirty" # uncommitted edits on top
mkdir -p "$GAME_DIR/dev/shots"
SHOT_TAG="b$BUILD-$COMMIT${DRIVER:+-$DRIVER}" OUT_DIR="$GAME_DIR/dev/shots" exec "$GAME_DIR/dev/test.sh" "$@"
