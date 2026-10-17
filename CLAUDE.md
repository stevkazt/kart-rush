# Kart Rush — handoff notes

Mobile-first 3D kart racer (Mario Kart style). Vanilla JS + Three.js 0.160 + cannon-es 0.20, both from
jsDelivr via the import map in `index.html`. No build step. The user plays it on an iPhone as a home-screen app **served from the Mac's LAN server** (`http://<LAN IP>:8000`), so local edits are live on the phone after a relaunch; don't push to GitHub unless asked (see Run).

## Run
```bash
cd kart-racer && python3 dev/serve.py 8000   # http.server + Cache-Control: no-store (plain http.server let iOS keep stale copies)
# phone (same Wi-Fi): http://<mac LAN IP>:8000   ->  ipconfig getifaddr en0
```
**Race telemetry (build 29): the best data source.** Over plain http (the LAN server), every race the user plays
is POSTed to `/telemetry` at its end (or on restart / quit after 5 s) and `serve.py` appends it to
`dev/telemetry/races.jsonl` (gitignored). One JSON per line: build, track, steering, each kart's name + AI role /
skill / grip / lineUse, result, `events` (lap, finish, box, use, hit + by/what, blocked, reset + why, rail
(player, speed loss), pause) and `samples` every second (per kart: metres raced, km/h, place, AI target % of top;
then the player's pedal). The user prefers this to headless runs ("your tests take too long and my races give
better data"): analyse their races with a short python script; only smoke-test headless. Something else (a uvicorn
app) listens on 127.0.0.1:8000, so curl the LAN IP, not localhost. `serve.py` changes need a restart of it.
**Hosted (2026-10-15):** public repo `github.com/stevkazt/kart-rush`, GitHub Pages from `main` /,
live at https://stevkazt.github.io/kart-rush/. **Deploy = `git push`** (Pages rebuilds in ~1 min); bump `VERSION`
in `sw.js` first so installed phones pick up the new files. The user installs it via Safari, Share, then Add to Home Screen; over
HTTPS the service worker works, so it plays offline. All paths are relative, so it works under `/kart-rush/`.
The user plans more games: one repo per game (`stevkazt.github.io/<repo>/`), optionally a `stevkazt.github.io`
launcher repo later. The LAN server above still works for quick testing (no offline cache over plain HTTP).

## Files
- `index.html`: import map, HUD, touch controls, overlay. Everything sits inside `#app`.
- `index.html`: import map, HUD, touch controls, overlay. Everything sits inside `#app`.
- Overlay screens: `#menu-screen` (lobby), `#pick-screen`, `#hello-screen`, `#settings-screen`, `#pause-screen`, `#results-screen`;
  `showOverlay(screen)`. Details: `docs/ui.md`.
- Tracks (`CFG.tracks`: meadow, canyon, frost), heights, banking, themes: `docs/tracks.md`.
- Characters (`drivers.js`, one baked SkinnedMesh per rider, `DRIVERS` registry, 8 drivers): `docs/drivers.md`.
- Items, AI personalities, rail reset, places, sound, effects, baked kart meshes: `docs/systems.md`.
- Feedback log, race analyses, roadmap, open ideas: `docs/history.md`.
- Settings (build 28+): steering buttons/joystick, ALL SOUND, MUSIC + SOUND EFFECTS levels, SCREEN Normal/Flipped. Add options as more `.setting` blocks. On narrow screens (container < 660 px) the card becomes a label-left list (build 39).
- `style.css`: `#app` is always laid out landscape; `.rotated` turns it 90deg in portrait. Sizes use `--app-h`
  and safe-area vars `--edge-l/--edge-r`, which map to the top/bottom insets when rotated.
- `main.js` sections: 0 CONFIG (`CFG`; all tuning lives here, incl. `racers`, `grid`, `ai`, `items`) · 1 INITIALIZATION
  (renderer, world, track, karts, 1f item boxes/pads/models, state/HUD/minimap) · 2 CONTROL LISTENERS · 3 GAME FLOW
  (grid, countdown, laps, places, results, resets) · 3b AI DRIVERS · 3c ITEMS & BOOST PADS · 4 PHYSICS STEP
  (`driveKart` per kart + `applyStabilityAssist` per kart on `preStep`, which also applies boost + brake pushes)
  · 5 RENDERING LOOP (sync meshes <- bodies, camera, effects, item visuals, HUD, sound mix).
- `sound.js`: all audio, synthesised with WebAudio (no assets). `sound.unlock()` runs on the Start tap (iOS needs a
  gesture; also sets `navigator.audioSession.type = 'playback'` so the silent switch doesn't mute it). Player engine
  + one engine voice per AI (panned, faded by distance), drift squeal, SFX one-shots, a step-sequenced chiptune
  loop during the race, and mute (Settings -> ALL SOUND, saved in localStorage).
- `manifest.webmanifest`, `sw.js`, `icons/`: PWA. **Bump `VERSION` in `sw.js` when shipping changes.**
- `dev/test.sh`: headless Chrome regression tests (see Testing).

## Hard-won gotchas (don't regress these)
1. **Static cannon bodies never refresh their AABB.** After setting position/quaternion on a mass-0
   body, call `body.updateAABB()`. Without it, the ground plane kept its unrotated bounds (z <= 0), the wheel
   raycasts missed the ground for z > 0, and the kart sank onto its chassis and got stuck forever. This
   was the user's first bug report.
2. **Engine sign is inverted** with this axle setup (`axleLocal (-1,0,0)`, forward +Z):
   `applyEngineForce(-engine)` moves the kart forward. Positive steering value = left turn.
3. `vehicle.updateWheelTransform()` (used for rendering) clears `wheel.isInContact`. To read contact state, use
   `wheel.raycastResult.hasHit`.
4. **Steering is digital (buttons).** It needs rate-limited ramping (`steerRate`/`steerReturn`), lock that
   shrinks with speed, and the stability assist. The assist must run per physics sub-step (`preStep`),
   not per frame, or the tyre forces undo it between sub-steps. Before this fix, holding RIGHT for
   0.6 s at speed spun the kart 180 degrees into a wall.
5. Drift only engages when lock is held past ~75% above 15 m/s, and it's mild. The original auto-drift on any
   hard turn caused the spin-outs.
6. iOS ignores `user-scalable=no`. Double-tap zoom and the long-press magnifier on the buttons are blocked by
   `preventDefault` on `touchstart`/`touchend` on `#controls`. Pointer Events still fire.
   Don't attach that to `#overlay`, because it would kill the Start button's click.
7. Corner radius limit is geometric: the walls sit `halfWidth + curb` (+ thickness) from the centre line, so the
   inner wall folds over itself once a corner is tighter than that (~10.6 m now). Inner widths now cap themselves (`roadWidths`), so
   corners down to ~12 m work (the hairpin). A 9 m hairpin was unplayable. The kart itself turns 8 m at 36 km/h, 17 m at 93 km/h. The track is the `CFG.track.points` Catmull-Rom loop.
8. AI pile-ups: braking hard for corners made trailing AIs rear-end the leaders. AIs now take corners with
   high `cornerGrip`, mostly just lift (brake only when 5 m/s over target), and lift when right behind a kart.
9. **cannon-es `setBrake(x)` is an impulse cap per sub-step, not a force.** `brakeForce: 600` (or even 80) locks
   the tyres at ~50 m/s^2 decel at the contact patch, below the centre of mass, and flips the kart onto its roof.
   The committed AI build already did this on any hard brake at top speed. Now braking = tiny `wheelBrake` (1.5)
   + `brakeDecel` applied to the velocity in `preStep`. Same for spin-outs. `brakeForce` is only used at standstill
   (holding karts on the grid). `coastBrake: 12` is also an impulse; it stops the kart from top speed in ~1.4 s,
   which is close to braking. Nothing uses it while driving any more: the player coasts with `playerCoast: 3`,
   AIs with `ai.coast: 4`.
10. **Boost is a centre-of-mass push** (`boostAccel` in `preStep`), not more engine force. Extra wheel torque
    popped wheelies on boost pads. Braking cancels a boost, and AIs don't brake while boosting.
11. Player rescue (build 24; user got stuck nose-in on a rail on a slope, "really difficult to back up"): GAS or
    BRAKE held while under `rescueSpeed` 2 m/s for `rescueTime` 2.5 s (not while spun out) = reset ('stuck').
    Test: nose-in with GAS -> rescued at ~2.9 s; backing out with BRAKE crawls at 2-7 km/h for ~1.5 s, then
    gets going (timer peaked 2.3 s). Auto-recovery also triggers on `up.y < 0.3` or **fewer than 3 wheels down** for 1.5 s (a kart once sat perched on
    a wall with its rear wheels in the air). Resets record `k.lastReset` (AI reason or flip/button) for debugging.
12. **Draw from `body.interpolatedPosition/Quaternion`**, never the raw pose (karts, wheels, camera, sun).
    Raw poses advance 0 or 2 fixed steps on some frames and cause hitches at a steady fps. Teleports must also
    set `previous*`/`interpolated*` (see `resetKart`). `warmUpShaders()` at boot renders every item/flame/spark
    once, so no GPU program compiles mid-race (`__r.info.programs.length` stays 12 through a race).
    The warm-up runs before item boxes are placed, so `boxMesh.frustumCulled = false` (else boxes vanished
    when close: InstancedMesh caches its bounding sphere from the first draw). Rails are one continuous
    vertex-coloured strip (per-segment boxes overlapped and z-fought, the "laggy rails"); colliders unchanged.
    The sun's shadow camera snaps to texels in light space (`lightQ`) so shadow edges don't crawl.
    Frame meter: tap the build label on the title screen (fps, frames > 33 ms, worst frame; `kartrush.perf`).

13. **Cornering grip / rails (2026-10-16).** The assist's `maxLateralAccel` + yaw slacks, not the tyres, set how hard
    a kart corners; the auto-drift (full lock above 54 km/h) added most of it. At 22 / drift slack 0.4 the kart pulled
    ~2.8 g and took the 12 m hairpin flat. Now 14 / 0.2: full lock at top speed = ~30 m circle, ~14 m at 65 km/h, so the
    hairpin needs a brake or lift. Rails cost speed (`wallHitLoss/wallHitMax/wallScrape`, applied in
    `applyStabilityAssist` from each kart's `collide` hits). The scrape is a share of speed: a fixed 8 m/s^2 nearly
    cancelled the engine and pinned karts to the rail. AI `cornerGrip` dropped to 20-25 to match (24-30 hit the hairpin rail).
    Menu buttons fire on pointerup (`onTap`), not click: iOS dropped some synthesised clicks (START needed 2 taps).

## Testing
```bash
dev/test.sh autopilot 80        # full race with button-style autopilot; prints lap log + STUCK events
dev/test.sh tap 0.25 0.6 1.0    # hold RIGHT on open grass at top speed; heading/slip/yaw per hold time
dev/test.sh eval '<js expr>'    # print a page expression ~1 s after GO, e.g. '__karts.map(k=>k.place)'
dev/test.sh trace probe.js 40   # autopilot race + your probe script pushing lines to __log (test.sh waits for Chrome's port: it once took > 2 s)
dev/test.sh shots 300,860:3     # screenshots with the player parked at sample idx[:lane]
dev/test.sh profile 8           # CPU profile, drawing off
TRACK=canyon dev/test.sh ...    # any mode on another track
```
Headless Chrome draws in software (5-10 fps), so the game runs in slow motion; for physics runs put
`__r.render = () => {}` in a trace probe (runs about real time). `__loadTrack`, `__resetKart`, `__snap` are
exposed too.
`test.sh` also exposes `__r` (renderer: `__r.info.render.calls`) and `__snd` (sound; `__snd.context.state`), and runs
Chrome with autoplay allowed so the audio code is exercised. The autopilot never fires items, so with items on it
no longer reliably wins. To have it fire items, add `if (__k.item && __k.itemRoll <= 0) __in.item = true` in a
trace probe. Spin-outs record `k.hitBy` ("red from Mako").
Baselines (2026-10-16, drawing off via a probe): meadow laps ~33-37 s, canyon ~44-51 s, 3-lap races on both
with 0 AI resets/flips in clean runs (items occasionally cause a watchdog reset). Probes used are simple
`setInterval` scripts logging to `__log` (airtime per kart, resets with `k.lastReset`, place changes, wheel
contacts); write new ones as needed. Older note: autopilot laps of about 21–23 s with 0 STUCK events. The autopilot log lists every kart each
5 s (place, lap/idx, speed, AI `resets=`). With AIs, the autopilot finishes 1st by ~2 s; the whole field
finishes within ~10 s, with 0 AI resets in a clean run. `tap 0.6` gives about 35 degrees at
release, slip under 2 degrees, and 95 km/h kept (before the 2026-10-16 grip cut; now 0.25 s = 9 deg, 0.6 s = 25 deg, 1.0 s = 51 deg). `dev/test.sh` injects debug globals (`__k` kart, `__s` state,
`__t` track, `__w` world, `__in` input) into a temp copy by replacing the `// ---------- Boot ----------` marker
line in `main.js` (also `__karts`, `__useItem`, `__spinOut`, `__shells`: give `__k.item = 'blue'; __k.itemRoll = 0`
then `__useItem(__k)`). Keep that line. `test.sh` refuses to run if port 8765 is already taken:
an orphaned test server once served a stale copy and made every test lie. The page can't be tested on a real phone from here: ask the user to
check touch and feel.

**Screenshots (user 2026-10-17):** whenever visuals are needed, save them with `dev/shot.sh` (same args as
`dev/test.sh shots|studio`): into gitignored `dev/shots/`, named `b<build>-<commit>[+dirty]-<view>.png`
(build from `sw.js` VERSION), so before/after sets stay comparable. `ITEMS=1` parks items in `shots` views.


## Open items (details in docs/history.md)
- **Version label (user 2026-10-17):** the title screen shows `build <VERSION_N>` (main.js). Main number = sw.js VERSION; **bump the sub-build (`64.1` -> `64.2`...) with every change you make**, so the user can confirm which version their phone runs. Race logs carry it too.
- **State 2026-10-17 (build 64.4):** everything committed; pushed to origin up to 9c2f444 (build 62); **64.1-64.4 are NOT pushed** (ask the user). See "Builds 61-64.4" in docs/history.md.
- **Open: wall stalls on the canyon** (banks, whoops, post-bridge idx 870-990). Next step: read the `railpost` events in the user's next canyon race (history.md says how). The user tests on the phone: don't run headless physics unless asked; taller walls are ruled out.
- Next options: check the mushroom-at-wall trick on the Test Lab; the user's own buttons races; rail/steering options.
- Builds 37-39 are committed locally (HEAD cd8f031), **not pushed**, and not all phone-tested: 8 characters, Hex trickster AI, in-game keyboard, screen flip, settings fix, Rex (veteran look: only the visor flicker kept, scars removed on request), Pip chibi, Koda goggles.
- Analyse the user's next 4-5 real races (checklist: "What to check" in history.md); watch ghost-on events, boxes per race, hits on the player.
- Ideas awaiting the user's pick: throw items forwards/backwards, remove side rails, personalities that change (track specialists, rivalry, cup), bully items, landing after the canyon jump.
- Keep the user's feedback rules: don't retune steering; AI personalities fixed per name; drivers are looks only for the player; push only when asked.
