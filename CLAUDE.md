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
  `showOverlay(screen)`. Lap counter `#lapbox` sits under the minimap (build 19; turns yellow on the final lap). HUD also has WRONG WAY (`updateWrongWay`: facing and moving backwards > 1 s) and a lap
  split under the LAP message (`showSplit`, green/red vs best lap so far).
- **Tracks (build 20):** `CFG.tracks` = layouts (`meadow` "Green Valley", `canyon` "Canyon Run"), each with
  its theme, box rows and pads. `loadTrack(id)` tears down `trackRoot` (all track meshes) + `trackBodies` and
  rebuilds `track`, `itemVis`, `theme`, the minimap; `track`, `itemVis`, `theme` are `let`. Picker on the title
  screen (`#track-pick`, `selectTrack`), remembered in localStorage `kartrush.track`; `?track=canyon` in the URL
  wins. Records are per track: `kartrush.records` `{ meadow: {race, lap}, canyon: {...} }` (the old flat record
  became the meadow's). `THEMES` (section 1c-2): palette (road/curb/rail/arch), sky/fog/lights (`applyTheme`),
  `build(track)` -> `{ update(dt) }` called every frame for animated scenery.
- **Heights (canyon):** control points are (x, z, y, halfWidth); `samples[i].y` is the road height. `shapeTrack`
  adds `bumps` (cosine crest), `jumps` (kicker up to the lip + 3-sample step down; taller rails `jumpWallHeight`
  around it; hazard stripes) and `banks` (outside of the bend raised; `track.bank[i]` = tan). Helpers:
  `surfaceY(i, lat)`, `roadPoint(i, lat, up)`, `lateral(i, p)`, `roadBasis(i)` (left/up/forward frame). Flat
  tracks keep the single ground plane. Hilly tracks: wheels ride a **Trimesh** road (one row per sample,
  exact), plus a safety net of boxes `netDepth` 0.25 m below for the chassis (cannon-es has NO box-vs-trimesh
  collision); static boxes go in bodies of 16 (`staticChunks`: ~1200 one-box bodies made the physics step 5x
  slower). Walls follow the road height. `nearestTrackIndex` weighs height (the bridge). Karts more than
  2.5 m below the road for 0.6 s are reset ('fell'). In the air `airLevel` turns karts toward the road's tilt
  and damps tumbling (`airLevel`, `airDamp`). Items sit on the surface; hit checks ignore > 2.5 m height gaps.
- **Canyon (~1133 m, N 1218, lap ~44 s):** figure-8, start straight (y 0), banked right-hander, under the bridge
  through a slot canyon, whoops (idx 440/457), 12 m uphill hairpin, crest on the mesa (idx 700, ~0.8 s air),
  bridge 9 m over the lower road (idx ~890), jump (lip idx 1074, ~0.7 s, lands before the sweeper), banked
  downhill sweeper. Design with `dev/track-check.py` (3D now: allows crossings >= 6.5 m apart in height).
  Desert theme (`buildDesert`): height-field canyon from the road (min over nearby samples of road height + rise,
  so the lower road gets the slot and the upper one the bridge), steel truss bridge, stone embankment faces,
  chevron boards on corners < 22 m, cacti/rocks/bushes, gradient sky dome + sun, flags at the start, circling
  vultures, hot-air balloons, tumbleweeds rolling across ahead of the player, dust devils. Builds in ~0.5 s.
  Measured (no drawing, headless): 3-lap race 0 resets / flips; first version flipped karts landing a bigger
  jump in the sweeper, and flat road boxes left 20 cm steps where banking eased in/out (watchdog resets).
- **Meadow track (2026-10-16, ~852 m, N 916 samples at `spacing` 0.93):** main straight, fast right, boost straight,
  12-13 m hairpin, chicane, middle S, sweeper, 16 m kink. Road width is per sample per side (`track.wL/wR`,
  `roadWidths`): `halfWidth` (or a 3rd value on a control point) capped on the inside of bends so the inner
  rail keeps `innerWallRadius` of curve. Use `clampLane(i, x)` for anything lateral. Item rows / pads are
  sample indices: move them when the layout changes. Design new layouts with `dev/track-check.py` (same
  centripetal Catmull-Rom as three.js: corner radii as the game measures them, closest approach between
  different parts (need >= 26 m), ASCII map). Put several points along tight arcs: one apex point = cusp.
- **Rocket start:** GAS first pressed within `rocketWindow` (1 s) before GO and held = `rocketBoost`; held since
  before `rocketEarly` (1.8 s) = `stall` (no power). A tip shows at the countdown (`#tip`). AIs don't rocket.
- **Effects (`fx`, section 1g):** one `THREE.Points` ShaderMaterial pool (220) for drift smoke, grass dust and hit
  bursts (`hitBurst` in `spinOut`), plus a 360-quad ring buffer of skid marks at y 0.05; emitted only for karts
  within 45 m with rear wheels down. Dizzy stars (`k.stars`) while spun out. `fx.reset()` on race start / menu.
  GPU programs: 16, all compiled by `warmUpShaders`.
- **Engine sound (build 22):** user: "the same brrr the whole race... uncomfortable because the gas is pressed
  all the time". Was pitch = speed only (one fixed ~138 Hz sawtooth drone at top speed). Now `engineRevs`: 4
  virtual gears (`GEARS`, revs drop on upshift + brief dip), revs sag off the gas and rise free in the air
  (`mix.player.air`), slow pitch wobble, putt tremolo kept at speed, softer custom wave (harmonics 1/k^1.5), and
  "presence": ~60% volume after ~1.5 s of steady revs, full when they change. User: "much better, not too present".
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
- **More items (build 25, 2026-10-16; user wanted a pure protection item "so the chances balance out for every
  player"):** `ITEM_TYPES` = mushroom, banana, green, red, **shield** (bubble `k.bubble`: `BUBBLE_MAT` shader, fresnel rim +
  thin-film rainbow + highlights + wobble, elastic pop-in, flickers out; user found the flat additive sphere "cheap"; blocks the next hit of
  any kind, `shieldTime` 10 s, blinks at the end), **star** (`k.star` 6 s: immune, +`starSpeed` top speed,
  rainbow emissive on `k.bodyMesh`; AIs get the speed through their pace in `updateAI`), **triple** (3 mushrooms,
  `k.itemCount`, `tripleGap`, `k.orbit` meshes circle the kart, x3 badge = `data-count` on the item button),
  **blue** (one at a time: `rollItem` zeroes it while one is out or held; flies over the road centre at
  `blueSpeed` 55 to the leader (`blueTarget`, never its owner), dives within `blueHome`, `blueBlast` 5 m blast,
  `blueSpin` 1.9 s; thrown from 1st it flies backwards to 2nd (`s.dir`)), **bullet** (`k.bullet` 4 s: on rails,
  `bulletGuide` in preStep steers the velocity to 38 m/s along the road, `collisionResponse` off until nobody
  overlaps, hull mesh `k.hull`, wheels hidden). Star/bullet karts spin out anyone within `bumpRadius` and shove
  them sideways. All protection lives in `spinOut` (returns whether the kart spun). Odds per place in `CFG.items.odds`
  (9 columns): shield for every place (most at the front), star/bullet/blue for the back. The `!` alarm
  (`shellIncoming`) covers the blue shell within 90 m. The roulette already existed (`rollTime`).
  Measured (headless): 15 bullets back to back on the canyon, 0 resets (crest + jump fine); shield blocks one
  hit then the next lands; star top ~115 km/h; GPU programs stay 17 (bubble shader warmed up). 3-lap races with natural odds: 2 flips in
  7 canyon races (both after the jump, idx ~1120, probably boosted/star karts landing badly), 0 on the meadow.
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
- **Places:** `k.progress` = (lap-1)*N + idx + fraction past the sample (build 23), with idx counted negative
  behind the line before halfway. The HUD shows `state.shownPlace`: a new place must hold `PLACE_HOLD` 0.35 s,
  overtake sound at most every `OVERTAKE_GAP` 0.6 s (user: indicator "goes crazy" passing a pack; measured in a
  race: 92 -> 10 shown changes, 47 -> 8 sounds). Game logic (rubber band, items) uses the instant `k.place`.
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
dev/test.sh trace probe.js 40   # autopilot race + your probe script pushing lines to __log
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

## User feedback so far
- Physics stuck bug: fixed. Wants landscape only (done), buttons instead of a joystick (done), PWA (done).
- Steering: "feels slow but much better, let's leave it like that for now". Don't retune unless asked.
- Wants it to feel like a finished game rather than a demo.
- 2026-10-16: new menu/results screens "look good"; player coasting + slide GAS->ITEM "really improved the game
  experience". Plays with rotation unlocked (real landscape), which avoids the iOS portrait strip.
- 2026-10-16 (late): lap counter under the minimap: good. Canyon Run: jump "very realistic", canyon walls and
  theme "perfect", 60 fps on the phone; bumps should feel bumpy (keep); banking "not that relevant" (small grip
  bonus added). New engine sound "much better, not too present" (will say if it annoys again). Steady place
  indicator: good. Asked for auto-rescue when stuck (build 24, 2.5 s): judge after real use.
- 2026-10-16 (night): asked for more power-ups incl. a pure shield "so the chances balance out for every player";
  got shield, star, triple mushroom, blue shell, bullet + per-place odds (build 25). New bubble "awesome". Slide
  steering across both arrows: "bad idea" (reverted in build 27; don't retry without a new design).

## Roadmap (agreed with the user)
**Done (2026-10-15): AI opponents:** 5 AI karts, staggered grid (player starts last), position HUD, results
table, rubber-banding. AI pace knobs if ever needed: `CFG.ai.skill`, `cornerGrip`, `rubberMin/rubberMax/rubberBand`.

**Done and deployed (2026-10-15, sw v4):**
- Perf: baked kart meshes (stutter when karts were close). Sound (sound.js). Items + boost pads + AI item use.
- Physics fixes: brake/spin flips (gotcha 9), boost wheelies (10), perched-kart recovery (11).
- User feedback before this: "it does stutter when the cars are near me"; difficulty: "I always end 1st... keep it
  like is while we add extra functionality that could make it harder". So AI pace is unchanged; items are the lever.
  With items, an autopilot that never dodges finishes anywhere from 1st (by ~1–5 s) to 5th.

**Done 2026-10-16 (local commits 3f17746..62385b3, NOT pushed; GitHub Pages still has the 6109dca diagnostic build):**
menus + results screen, pause, coasting + slide GAS->ITEM, smooth rendering (interpolation, shader warm-up,
continuous rails, shadow snapping), WRONG WAY, lap splits, rocket start, smoke/skids/dust/hit effects, title
music, wider road, racing-line AI with personalities. The user plays with rotation unlocked (real landscape).

**Done 2026-10-16 (local commit 7d561a6, build 18, NOT pushed):** variable road width + new 852 m track with a
12 m hairpin (`dev/track-check.py`), grip cut + rails cost speed (gotcha 13), START fires on pointerup.
User: hairpin "feels more realistic now". AI pace after the grip cut looked weak in one race, but the user then
ended last after item hits: they judged it fine (variance comes from items), no change needed.
Lane changes at top speed after the cut (0.25 s tap 14 -> 9 deg): user says "feels ok... hard but normal at high
speeds". Keep. Nothing open before expansion.

**Builds 20-24 (2026-10-16, committed locally, NOT pushed; GitHub Pages still has the 6109dca diagnostic
build; `git status -sb` shows how far ahead of origin):** build 24 = player auto-rescue (gotcha 11). Canyon Run (hills, bridge, jump, crest,
banking, desert theme with life), track picker, per-track records. User asked for it as the physics test bed
for future tracks. Phone feedback: jump "feels very realistic"; canyon walls and theme "perfect"; 60 fps
(meter's worst-frame stat showed 20 once, not noticed); banked turns "don't help" (expected: the stability
assist caps cornering at `maxLateralAccel` whatever the bank); driving consistent except on the bumps
(likely: the assist only runs with all 4 wheels down); the user said bumps should feel that way: keep.
Build 21: banks now add g * tan(bank) to the assist's grip limit when steering into them (12 deg: 14 -> ~18
m/s^2; AI corner speeds too); user OK'd it as a quick tweak, "not that relevant". Fixed the kart turning ~9 deg
left during the canyon countdown: karts on the grid are pinned (`k.held` in applyStabilityAssist) instead of
held by `brakeForce` 600, whose left/right impulses fought on the grid's 0.1-0.2% slope (meadow: flat, no load).

**Builds 25-27 (2026-10-16, committed locally, NOT pushed; build 27 = slide steering reverted):** shield, star, triple mushroom, blue shell, bullet (see Items).
Build 26: real-looking shield bubble (user: "awesome"). Tried and reverted: steering as one slide pad over both
arrows (finger side of the midpoint = direction, so you change direction without lifting). User: "a bad idea, now
it keeps steering either way all the time" (any touch on the pad, even the gap, steered). Keep two separate hold
buttons (`bindHold`). Phone-tested items: no complaints yet; open questions are item strength / odds balance.
Watch: canyon post-jump flips with the faster items (2 in 7 headless races); balance of the odds.

**Next**, roughly in order (agreed 2026-10-16):
- Another themed track (idea: snowy night with falling snow + an icy section).
- Kart colour picker (body / trim / driver).
- Maybe later: stronger drift as its own experiment (steering feel: ask first), track editor with shareable links, ghost of the best lap, steering-sensitivity setting.
- Push to GitHub only when the user asks.

**Someday maybe (user 2026-10-16: "may never come to life"): online multiplayer.** Sketch discussed: WebRTC via
PeerJS (works from GitHub Pages, no server; some mobile networks need a paid TURN relay) or a small WebSocket
relay. Sync state, not inputs (physics isn't deterministic): each phone sends its kart pose/velocity ~20 Hz,
remote karts are kinematic bodies drawn interpolated ~100 ms in the past. One phone hosts: countdown start time
(clock offset), item box pickups, shell hits, places, and runs the AI filling the grid. Lobby with room codes.
Collisions under 50-150 ms lag are the hard part. Remote player = another driver filling `k.ctl`-style slot.

**Deferred by the user ("ignore for now"):** the speed-feel item. That means a lower/closer camera, speed
lines, camera shake, close trackside objects and a higher top speed.
