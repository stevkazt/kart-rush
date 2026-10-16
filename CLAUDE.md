# Kart Rush — handoff notes

Mobile-first 3D kart racer (Mario Kart style). Vanilla JS + Three.js 0.160 + cannon-es 0.20, both from
jsDelivr via the import map in `index.html`. No build step. The user plays it on an iPhone as a home-screen app **served from the Mac's LAN server** (`http://<LAN IP>:8000`), so local edits are live on the phone after a relaunch; don't push to GitHub unless asked (see Run).

## Run
```bash
cd kart-racer && python3 dev/serve.py 8000   # http.server + Cache-Control: no-store (plain http.server let iOS keep stale copies)
# phone (same Wi-Fi): http://<mac LAN IP>:8000   ->  ipconfig getifaddr en0
```
**Hosted (2026-10-15):** public repo `github.com/stevkazt/kart-rush`, GitHub Pages from `main` /,
live at https://stevkazt.github.io/kart-rush/. **Deploy = `git push`** (Pages rebuilds in ~1 min); bump `VERSION`
in `sw.js` first so installed phones pick up the new files. The user installs it via Safari, Share, then Add to Home Screen; over
HTTPS the service worker works, so it plays offline. All paths are relative, so it works under `/kart-rush/`.
The user plans more games: one repo per game (`stevkazt.github.io/<repo>/`), optionally a `stevkazt.github.io`
launcher repo later. The LAN server above still works for quick testing (no offline cache over plain HTTP).

## Files
- `index.html`: import map, HUD, touch controls, overlay. Everything sits inside `#app`.
- Overlay = `#menu-screen` (title + how to play) and `#results-screen` (place, time, best lap, standings with gaps,
  RACE AGAIN / MENU, confetti on a win). `showMenu()` / `showResults()`; `#app.overlay-on` hides HUD + controls
  (mute stays). Records in localStorage `kartrush.records` `{race, lap}`. Engines duck (`soundMix.duck`) behind menus.
  `#pause-screen` (RESUME / RESTART / MENU): `pauseGame()` from the pause button, Esc/P, or the app going to the
  background; the loop skips physics + render while `state.paused`, audio is suspended. All screens go through
  `showOverlay(screen)`. HUD also has WRONG WAY (`updateWrongWay`: facing and moving backwards > 1 s) and a lap
  split under the LAP message (`showSplit`, green/red vs best lap so far).
- **Rocket start:** GAS first pressed within `rocketWindow` (1 s) before GO and held = `rocketBoost`; held since
  before `rocketEarly` (1.8 s) = `stall` (no power). A tip shows at the countdown (`#tip`). AIs don't rocket.
- **Effects (`fx`, section 1g):** one `THREE.Points` ShaderMaterial pool (220) for drift smoke, grass dust and hit
  bursts (`hitBurst` in `spinOut`), plus a 360-quad ring buffer of skid marks at y 0.05; emitted only for karts
  within 45 m with rear wheels down. Dizzy stars (`k.stars`) while spun out. `fx.reset()` on race start / menu.
  GPU programs: 16, all compiled by `warmUpShaders`.
- **Music:** `sound.music('race' | 'menu' | false)`; menu loop on the title + results screens, starts on the first
  tap (iOS). sound.js only suspends on visibility change; the game resumes audio (so a paused race stays silent).
- Flat track layers are >= 2 cm apart (road 0.02, curbs 0.04, dashes 0.06, pads 0.08, start line 0.10) and the
  camera near plane is 0.5: closer layers / near 0.1 shimmered far down the track (depth precision).
- **iOS portrait strip (2026-10-16):** with rotation lock on, the installed app got a viewport of 797 of 844pt
  (short by `safe-area-inset-top`, 47pt) and clipped the page there: an empty band at the home-indicator edge.
  Tried and failed (iOS clips the web view itself): `html, body` height + env(safe-area-inset-top), and sizing
  #app from `screen.*`. Now testing status-bar-style `black` instead of `black-translucent` (the page starts below
  the status bar). Real landscape (rotation unlocked) never had the bug. The title screen shows `build N · host · app` (bump N with `sw.js` VERSION): if the
  phone shows an old N, it is running a stored copy (the home-screen app once never contacted the server at all).
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
  loop during the race, and a mute toggle (top right, saved in localStorage).
- **Items:** 3 rows of `?` boxes, 3 boost pads (`CFG.items`). Items: mushroom (boost), banana (dropped behind),
  green shell (straight, bounces off walls), red shell (follows the track, homes in on its target). Odds depend
  on race position. AI red shells lock onto the player whenever the player is ahead within `aiTargetPlayer` m;
  AI green shells go at the player (other AIs only after holding it a while). This is the difficulty lever the
  user asked for instead of faster AI. Bananas/shells are not physics bodies (distance checks on the plane).
  A hit = `spinOut`: speed halved, ~1.1 s with no power, visual-only spin of body + wheels. ITEM button sits
  above BRAKE (Space/E on desktop). Sliding a thumb from GAS onto ITEM fires it while GAS stays held
  (`slideToItem`). User feedback: lifting GAS to tap ITEM felt "like a pro battle royale", so the player's kart
  now coasts (`playerCoast: 3`, ~5 km/h lost per 0.3 s lift) while AIs keep `coastBrake: 12`. Red shell incoming shows a blinking `!` + alarm.
- **Karts are baked**: `bakeMeshes` merges each kart body into one vertex-coloured mesh (plus one per wheel).
  Before that, ~28 meshes per kart (x2 for the shadow pass) = 195 draw calls on the grid and stutter on the
  phone when karts were close. Now 75. Add new kart parts before the `bakeMeshes` call.
- **Karts:** `karts[]` (6), `kart === karts[0]` is the player. Each kart object holds its physics/meshes plus its
  own driving + lap state (`freshDriveState()`), and a `ctl {steer -1..1, gas, brake}` that `driveKart` turns into
  forces. The player's `ctl` comes from the buttons; AI karts (`k.ai` set) fill it in `updateAI`. All karts run
  the same physics, so tuning `CFG.kart` changes the AI too. `state` is race-wide only (phase, time, best lap).
- **AI lanes (2026-10-16):** user said the road was too narrow and the AI "just follows the center line". Road is
  now `halfWidth: 9` (was 7). `track.line` = minimum-curvature racing line (`racingLine`, 4th-difference
  smoothing, coarse then fine; a taut-string version just hugged the inside of the loop). Each AI drives
  `line * ai.lineUse` (0.55-1.0, per race) + `ai.lane` (wander +-1.8 m, relative to that line); pads, boxes,
  bananas and slower karts ahead set an absolute goal; a kart alongside (within 2.5 m fore/aft) pushes it ~3 m
  away. Measured in a race vs the old AI: player-AI contacts 48 -> 13-17, 0 resets, similar finish spread.
  Then (user: "they follow the exact same line... like F1, not the Mario Kart way" and "brake where there's no
  need"): `lineUse` 0.15-0.85 plus a per-AI `bias` (+-4 m preferred side, re-rolled each lap), `laneRange` 2.5.
  Corner speed uses the curvature blended between centre line and `track.lineRadius` by `lineUse`. AIs brake
  only for corners (`corner + brakeOver`); being over their own pace (after a boost pad, the rubber band) is a
  lift. That was the "braking on straights": hotspots were 25-35 m after each boost pad. AI lift = `ai.coast: 4`
  (~6 m/s^2; the old coastBrake 12 was ~18 m/s^2, as hard as braking). Measured: AI braking 1-2% -> ~0% of the
  time; AIs are quicker (whole field within ~3-5 s of the autopilot, which now finishes mid-pack).
- **AI:** pure pursuit to a look-ahead point on the AI's lane; target speed = top x skill x rubber band, capped
  by `track.radius` corner speeds; lane wander, dodging slower karts ahead, random wobble/lift mistakes;
  back-up + reset recovery and a 4 s no-progress watchdog. After the player finishes, the CPU drives their kart.
- **Places:** `k.progress` = (lap-1)*N + idx, with idx counted negative behind the line before halfway.
  Finished karts rank by finish time. The results overlay refreshes live as AIs finish.
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
   inner wall folds over itself once a corner is tighter than that (~10.6 m now). Keep corners >= ~20 m (the
   tightest is 20 m). A 9 m hairpin was unplayable. The kart itself turns 8 m at 36 km/h, 17 m at 93 km/h. The track is the `CFG.track.points` Catmull-Rom loop.
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
11. Auto-recovery triggers on `up.y < 0.3` or **fewer than 3 wheels down** for 1.5 s (a kart once sat perched on
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

## Testing
```bash
dev/test.sh autopilot 80        # full race with button-style autopilot; prints lap log + STUCK events
dev/test.sh tap 0.25 0.6 1.0    # hold RIGHT on open grass at top speed; heading/slip/yaw per hold time
dev/test.sh eval '<js expr>'    # print a page expression ~1 s after GO, e.g. '__karts.map(k=>k.place)'
dev/test.sh trace probe.js 40   # autopilot race + your probe script pushing lines to __log
```
`test.sh` also exposes `__r` (renderer: `__r.info.render.calls`) and `__snd` (sound; `__snd.context.state`), and runs
Chrome with autoplay allowed so the audio code is exercised. The autopilot never fires items, so with items on it
no longer reliably wins. To have it fire items, add `if (__k.item && __k.itemRoll <= 0) __in.item = true` in a
trace probe. Spin-outs record `k.hitBy` ("red from Mako").
Current baseline: autopilot laps of about 21–23 s with 0 STUCK events. The autopilot log lists every kart each
5 s (place, lap/idx, speed, AI `resets=`). With AIs, the autopilot finishes 1st by ~2 s; the whole field
finishes within ~10 s, with 0 AI resets in a clean run. `tap 0.6` gives about 35 degrees at
release, slip under 2 degrees, and 95 km/h kept. `dev/test.sh` injects debug globals (`__k` kart, `__s` state,
`__t` track, `__w` world, `__in` input) into a temp copy by replacing the `// ---------- Boot ----------` marker
line in `main.js` (also `__karts`). Keep that line. `test.sh` refuses to run if port 8765 is already taken:
an orphaned test server once served a stale copy and made every test lie. The page can't be tested on a real phone from here: ask the user to
check touch and feel.

## User feedback so far
- Physics stuck bug: fixed. Wants landscape only (done), buttons instead of a joystick (done), PWA (done).
- Steering: "feels slow but much better, let's leave it like that for now". Don't retune unless asked.
- Wants it to feel like a finished game rather than a demo.
- 2026-10-16: new menu/results screens "look good"; player coasting + slide GAS->ITEM "really improved the game
  experience". Plays with rotation unlocked (real landscape), which avoids the iOS portrait strip.

## Roadmap (agreed with the user)
**Done (2026-10-15): AI opponents:** 5 AI karts, staggered grid (player starts last), position HUD, results
table, rubber-banding. AI pace knobs if ever needed: `CFG.ai.skill`, `cornerGrip`, `rubberMin/rubberMax/rubberBand`.

**Done and deployed (2026-10-15, sw v4):**
- Perf: baked kart meshes (stutter when karts were close). Sound (sound.js). Items + boost pads + AI item use.
- Physics fixes: brake/spin flips (gotcha 9), boost wheelies (10), perched-kart recovery (11).
- User feedback before this: "it does stutter when the cars are near me"; difficulty: "I always end 1st... keep it
  like is while we add extra functionality that could make it harder". So AI pace is unchanged; items are the lever.
  With items, an autopilot that never dodges finishes anywhere from 1st (by ~1–5 s) to 5th.

**Next**, roughly in order:
- Await the user's feedback on items, difficulty and frame rate. Sound: the engine was "really annoying" at high
  speed (bright saw whine); it's now lower, darker and quieter at top speed (`setEngine` in sound.js).
- Hop-to-drift button with mini-turbo levels (changes controls: ask the user first; steering feel is sensitive).
- Visual polish: tyre smoke, skid marks, grass dust, grandstands/flags/tyre stacks, sky gradient,
  WRONG WAY warning, lap split vs best.
- Structure: title screen, kart colour picker, more tracks (just new `points`), best times in
  localStorage, ghost of the best lap, pause menu with a steering sensitivity slider.

**Deferred by the user ("ignore for now"):** the speed-feel item. That means a lower/closer camera, speed
lines, camera shake, close trackside objects and a higher top speed.
