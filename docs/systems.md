# Kart Rush: game systems

Moved out of CLAUDE.md (2026-10-17). Rocket start, effects, sound, items, karts, AI, places.

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
  rainbow emissive on `k.bodyMesh`; AIs get the speed through their pace in `updateAI`; build 33: `starSpeed` 4 -> 8
  plus a `starAccel` 7 m/s^2 centre-of-mass push like the boost, so it reaches ~122 km/h in 0.5 s; sound =
  whoosh + its own looping theme for the whole star on a `starBus` that `starEnd` cuts; user: "should give more
  speed and play a different sound", not phone-tested), **triple** (3 mushrooms,
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
- **Screenshot tool:** `dev/shot.sh` (see Screenshots). `DRIVER=Luna` poses / races as that driver
  (`Page.addScriptToEvaluateOnNewDocument` sets `kartrush.driver`). The first studio view of a run sometimes
  catches the boot warm-up frame (bubbles, items in the karts): put a throwaway view first.
- **Drawn kart smaller than the physics kart (build 34, user: kart "too big, wide, and stretched out" next to
  the driver):** `CFG.kart.look` = `scale` 0.77, `wheelbase` 0.85 (extra on z), `groundY` -0.61 (ground under
  the body origin at rest, measured), `seatDrop` 0.15. `buildKart` models the chassis full size inside a `frame`
  group scaled about the ground; seat back + steering wheel sit unscaled in `cockpit`, lowered by `seatDrop`, and
  the rider is built at `y0 - seatDrop` (drivers keep their size). Wheels are drawn at r 0.31 and `syncMeshes`
  pulls each physics wheel's kart-local spot in (x * scale, z * scale * wheelbase, y - (R - r)). **Physics is
  untouched** (wheel spots, chassis box 1.6 x 2.6, grip, `wheelBase` for the assist), so handling didn't change;
  the collider is now ~0.25 m longer each end than the drawn kart. Shrinking it changes inertia = steering feel:
  ask first.
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
- **AI personalities (build 29), fixed per driver name** (user wants "this guy is so annoying" / "this one is
  really good"; each will get a matching look later, keep them tied to the names): `CFG.ai.styles` over the
  `CFG.ai` defaults, merged in `newAI(lane, name)` into `ai.style` (updateAI reads `A = ai.style`). Rex = ace
  (1.04-1.08 pace, tight line, rare mistakes, overtakes down the inside), Luna = defender (fast, blocks karts
  closing behind on straights: `defendT/defendCool`, hoards shield/banana/red), Mako = bully (shells at anyone
  ahead, bananas for anyone within 20 m behind, crowds karts alongside to 2 m), Pip = steady (slower, very few
  mistakes, hoards), Bolt = wild (fast, `brakeOver` 6 so he runs wide, random lines, wobbles every 3-7 s).
  Racecraft knobs 0..1: `overtake`, `defend`, `aggression`, plus `hoard`, `wild`. First phone race: "so much
  better"; Rex won with a 28.4 s lap (user's best 29.6), field spread ~120 m instead of a pack. Watch: Rex too
  strong? Mako never near the player (slow start, mid pace) so not felt as a bully.
- **Roster of 7, grid of 6 (build 37, user picked "add Koda as 7th driver" + "new drifter style"):** `CFG.racers`
  = Nova + 6 personalities (Koda added); `CFG.grid.karts` 6. Each race one personality sits out, in turn
  (`sitOut` in castDrivers, advanced by startRace, saved in `kartrush.sitOut`), so the field never depends on
  the pick (the picked driver's style still goes to Nova). Telemetry `karts` shows who raced.
  **Koda = drifter** (`ai.styles.Koda`, `drift: true`): where the corner ahead (look-ahead point) is tighter than
  `driftRadius` 100 m and he's above driftMinSpeed + 3, he commits to a slide (`ai.sliding`, wheel held at
  `driftLock` 0.95) until pure pursuit lets go or turns the other way: mini-turbo on the exit. Headless (one race
  per track): 10-14 s drifting, 4-5 mini-turbos (other AIs 5-13 s, 1-5), 0 resets, placed 3rd / 1st / 3rd.
  Watch it in the user's races (style 'Koda').
- **No rubber band (build 29).** The user's races showed AIs ahead holding at 85% pace (rubberMin) waiting for the
  player and all at 1.06 when behind: the field bunched round the player. User: rubber off "feels more natural",
  "leave it off". AI pace now comes from the personalities alone.
- **Rail reset (build 29):** a kart whose centre is within 0.2 m of a rail's road face or beyond (on top of it or
  over it) for 0.3 s is put back (`k.railT`, reset reason 'rail'); pressed flat against a rail the centre stays
  0.8 m inside. User: "I was literally over a rail and it let me run over it".
- **AI:** pure pursuit to a look-ahead point on the AI's lane; target speed = top x skill (no rubber band), capped
  by `track.radius` corner speeds; lane wander, dodging slower karts ahead, random wobble/lift mistakes;
  back-up + reset recovery and a 4 s no-progress watchdog. After the player finishes, the CPU drives their kart.
- **Places:** `k.progress` = (lap-1)*N + idx + fraction past the sample (build 23), with idx counted negative
  behind the line before halfway. The HUD shows `state.shownPlace`: a new place must hold `PLACE_HOLD` 0.35 s,
  overtake sound at most every `OVERTAKE_GAP` 0.6 s (user: indicator "goes crazy" passing a pack; measured in a
  race: 92 -> 10 shown changes, 47 -> 8 sounds). Game logic (rubber band, items) uses the instant `k.place`.
  Finished karts rank by finish time. The results overlay refreshes live as AIs finish.
