# Kart Rush: history, race analyses, roadmap

Moved out of CLAUDE.md (2026-10-17). User feedback, per-build notes, analysed races (hit tables, item distribution), plans and ideas awaiting a pick.

## User feedback so far
- Physics stuck bug: fixed. Wants landscape only (done), buttons instead of a joystick (done; the joystick came back
  as an option in Settings, build 28), PWA (done).
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
  steering across both arrows: "bad idea" (reverted in build 27; don't retry without a new design). Instead asked
  for a settings menu with buttons or a normal joystick (build 28): judge the joystick after real use.
- 2026-10-17 (build 29): canyon was "too dark", forced the eyes: now a golden afternoon (sun ~50 deg, blue sky,
  dusty grey road, pale rails): "much better". Item boxes "barely there": 1.5 m, self-lit, bold "?" texture. A rainbow
  glow sphere around them was rejected ("take that off"); the box is "too shiny for the style" but keep it (may move
  the game toward that style). Engine annoying again: softer tone (1/k^2 harmonics, sine tremolo, lower lowpass)
  was enough; Settings got the usual MUSIC + SOUND EFFECTS levels (Off/Low/Mid/Full; effects cover engines) instead
  of an engine slider. Plays with the joystick now. Asked whether portrait could work: not as is (narrow view,
  crowded HUD); a medium job if wanted.

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

**Builds 25-28 (2026-10-16, committed locally, NOT pushed; build 27 = slide steering reverted, build 28 =
Settings screen with buttons / joystick steering; joystick not tried on the phone yet):** shield, star, triple mushroom, blue shell, bullet (see Items).
Build 26: real-looking shield bubble (user: "awesome"). Tried and reverted: steering as one slide pad over both
arrows (finger side of the midpoint = direction, so you change direction without lifting). User: "a bad idea, now
it keeps steering either way all the time" (any touch on the pad, even the gap, steered). Keep two separate hold
buttons (`bindHold`). Phone-tested items: no complaints yet; open questions are item strength / odds balance.
Watch: canyon post-jump flips with the faster items (2 in 7 headless races); balance of the odds.

**Build 29 (2026-10-17, committed locally, NOT pushed):** brighter canyon, bigger item boxes, softer engine,
music / effects volume, race telemetry, rubber band removed, rail reset, AI personalities + racecraft. All
phone-tested and liked.

**Build 30 (2026-10-17, committed locally, NOT pushed):**
- **Respawn ghost** (user asked): `CFG.kart.ghostTime` 2 s after any reset in a race. `setGhost` drops
  `KART_GROUP` from the body's `collisionFilterMask` (walls/road still collide), `spinOut` ignores ghosts, the
  kart flickers see-through (render: `k.alpha`). Solid again only when no kart is within 3.2 m. Tested headless.
- **Mako's bully items** (user picked 1 + 3, NOT red shells hunting the player: "too much"): `itemOdds`
  multipliers in his style (weapons up, shield/speed items down) used by `rollItem(place, k)`; `trap`: holding a
  banana with a corner (`trapCorner`, radius < 45 m) ahead he moves onto the racing line and drops it there.
  Not yet checked in the user's race data (count banana hits by Mako on the player / others).
- **Frost Peak** (`tracks.frost`, theme `snow`, user: "keep it day or well lit, the eyes strain thing"): 932 m.
  Start straight by a frozen lake, banked left sweeper (162), climbing S-bends in pines (237, 263), 13 m hairpin
  at the top (361, y 10.5), ridge, downhill with a crest (600), ice across the lake (`ice: [[712, 905]]`, gentle
  S, tightest ~32 m), back to the line. Soft blue-white snow (not pure white), sun 1.9, mid-grey road, red/white
  rails, blue/white curbs, pale blue ice road. Pines, snow-capped rocks, snowmen, far peaks, light snowfall (450
  points round the camera). Ice = `track.ice[i]` 0..1 (8 m soft edges): x `kart.iceGrip` 0.65 on tyre
  frictionSlip (all 4 wheels, set every step) and on the assist's `maxLateralAccel`; AIs scale `cornerGrip` the
  same. Headless: full race, 0 resets for every kart, laps 32-38 s. Screenshots looked right. NOT tried on the
  phone yet: ask about ice feel (iceGrip), brightness/glare, snowfall, lake width.
- Refactor for it: `makeTerrain(data, shape, colorAt)` (height field, from the desert; shape may return a 4th
  value = rise, the lake uses -0.3), `makeSky(horizon, mid, top, glow)`, `buildChevrons(data)`. Canyon
  screenshot identical after the refactor.

**User's races on build 29 (personalities):** 4th, 3rd, 6th: competitive now; winners vary (Luna twice on the
canyon, Rex on the meadow). Mako hit the user 3x in one race (bully works). The user's big losses are rail hits
while fighting for places (25-32% speed, once a manual reset); user: "I get nervous when they are winning and
I lose control" (normal; offered more forgiving rails, not wanted for now).

**PLAN: personalities that change, but not randomly (user 2026-10-17: rotating roles "sounds good but I don't
think doing it randomly is the way to go"). The user hasn't picked yet: show the options and ask first.**
Each driver keeps their fixed character and name (looks will match it later); what changes is their *form*.
1. **Track specialists** (recommended first, small): `CFG.tracks[id].form = { Luna: {skill: +0.03, cornerGrip:
   +1}, ... }` applied in `newAI` on top of `CFG.ai.styles`. Each driver has a home track, e.g. Luna the canyon,
   Rex the meadow, Bolt Frost Peak (wild on ice fits him), Pip/Mako steady elsewhere. Show it on the track picker
   ("Specialist: Luna") so it's a known fact, not a surprise. Telemetry: add the form to `race.karts`.
2. **Rivalry from results** (next): keep the last ~5 results per device in localStorage (`kartrush.history`:
   track, places by name). The driver who has beaten the player most recently (or most often) becomes the
   **rival** for the next race: aggression toward the player (shells, defending against them, banana traps on
   their line) plus a small pace edge (+1-2%). Shown before the race ("Rival: Rex") and on the results screen.
   Beating the rival clears it. A clear story: "Rex beat me twice, now he's after me".
3. **Championship / cup** (later, bigger): 3-4 races in a row across the tracks, points (10/8/6/4/2/1),
   standings between races; form shifts with the standings (leader cautious-but-fast, bottom drivers desperate:
   more aggression, more mistakes). Would sit on top of 1 + 2.
Suggested order: 1, then 2 after the user plays a few races with 1; 3 only if the user wants a cup mode.

**Build 35 (2026-10-17, NOT committed yet):** Luna (see Drivers). Items again: build 34's 2x was "too big and
low definition" with the smaller kart: `modelScale` green/red 1.4, banana 1.3, blue 1.25, mushroom 1.15; smooth
shading (`flatShading = false`) + 24-28 segment domes, torus rims; `hitRadius` 1.5, `bananaRadius` 1.3 (between
the old and build 34), banana drops 2.5 m behind, shell-vs-banana 1.26 m.

**Hits on the player (user asked 2026-10-17, "I think I am not being hit so often"; races 16-23):**
| builds | races | hits / race | dodgeable (red, green, banana, bullet) / race | blue | time in 1st |
|---|---|---|---|---|---|
| b33 (16, 17, 18, 20) | 4 | 3.0 | 3.0 (9 of 12 were red shells) | 0 | 0-13% |
| b34 (21, 22, 23) | 3 | 2.3 | 1.3 (2 red, 1 banana, 1 red) | 3 | 16-30% |
AI shells thrown per race barely changed (~11 vs ~11); share of AI red/green shells that hit the player 9/43
(21%) -> 2/33 (6%). Likely: the higher camera lets the user see and dodge them, and they lead more (blue shells
now hit them in 1st). Small sample (3 races) and build 34 also grew the hit radius, so it isn't the items
being easier to dodge. Blue in race 22 hit them in 3rd (blast radius 5 m near the leader, or 1 s sample lag).
Keep watching with the build 35 item sizes.

**Build 36 (2026-10-17, builds 34-36 committed locally as d7cb604, NOT pushed; user: "execute those changes that need no extra data"):**
- **Finished karts are immune** to every item (`spinOut` returns false when `k.finished`; shell + banana hit
  checks skip them too). Fixes the red shell hitting Luna 11 s after she finished.
- **Red shells never hit their owner** (Bolt hit by his own); a green bouncing back still can (Mario Kart).
- **Box rows:** meadow [95, 241, 450, 670], canyon [230, 405, 760, 1010, 1185] (longest track: 5 rows), frost
  [60, 298, 420, 760]; new rows on straight, flat spots away from pads, jumps and crests (radius > 300 m).
  `boxRespawn` 3 -> 2 s. Karts holding an item still smash boxes (unchanged, Mario Kart style).
- **No shields in 5th / 6th** (`CFG.items.odds`): their weight went to mushroom (+3) and triple (+2).
- **Banana = a peel** (user: the old one "looks like it was inserted on pavement"): upright cream stub + stem,
  three flat yellow flaps splayed on the road with brown tips (`sweep` now exported from drivers.js).
- **Telemetry:** `ghost` events (`on` true/false, any kart: chase the respawn ghost bug) and `boxmiss` for the
  player: each row passed without an item, `why` = 'holding' | 'empty' (all boxes respawning) | 'missed'.
  Checked headless: forced respawn logged ghost on at 22.1 s, off at 24.1 s.
- Test tool: `studio items` = close-up of a banana, green and red on the road; `window.__tele` exposed.
- **What to check in the next 4-5 races:** boxes per race (was 7-9 with 3 rows), `boxmiss` reasons, longest
  gap without an item (was 15-48 s), hits on the player vs builds 34-35, any `ghost` stuck on for long.
  Still waiting for data (don't change yet): AI shell aggression, softer place odds, rails.

**Item distribution feels inconsistent (user 2026-10-17: "sometimes it is too much, sometimes nothing. I am not
sure. Just take note")** - races 13-24, noted only, nothing changed:
- The player's box count is steady: 7-9 boxes per race (max 9 = 3 rows x 3 laps), held items used in ~2 s
  (shields held longest, 6-12 s). The field uses 32-38 items per race.
- What swings is **when** and **what**: boxes only come at 3 fixed rows per lap, so items arrive in bursts with
  15-48 s gaps; a row the AIs just emptied (`boxRespawn` 3 s) or reached while still holding an item gives
  nothing (race 23 lap 2: 1 box, 36 s gap; race 21: first box at 29 s after a slow start; race 13: 48 s).
  Field item uses per 10 s window range 0-6 (bursts when the pack hits a row together).
- And the type follows the place (`CFG.items.odds`): leading = bananas / greens / shields (races 22-23:
  "nothing" useful), behind = reds, blue, bullet (race 24 in 5th: 3 reds, blue, bullet: "too much").
- Options when the user wants to act: more rows (4-5 per lap, the PENDING "more item boxes"), shorter
  `boxRespawn` so back-markers find full rows, softer place-based odds (fewer extremes), and add "row empty /
  holding item" events to telemetry to measure the misses.

**Build 34 (2026-10-17, NOT committed yet):** compact drawn kart, higher chase camera, km/h readout moved,
bigger items: `CFG.items.modelScale` (green/red 2x, banana 1.8x, blue 1.6x, mushroom 1.4x), item templates
rebased so their bottom is at y 0 (shells ride at road + 0.03, were + 0.15 floating), a faint glow (`emissive`
per kind) and a dark back-face outline (`OUTLINE_MAT`, child mesh made in `spawnModel`). Hit distances grew with
them: `hitRadius` 1.4 -> 1.7, `bananaRadius` 1.2 -> 1.5, shell-vs-banana 1.1 -> 1.4 m; bananas drop 2.8 m behind
(was 2.4). First race on it (race 21, canyon): 3rd, 0.20 s behind the winner (gaps were 7-22 s), 0 rail hits
(first canyon race with none), best lap 40.3 s, 2 bananas landed on Luna. One race: keep watching. Note the
bigger hit radius also makes AI shells easier to land on the player.

**Small fixes still open:** landing after the canyon jump (user and AIs get stuck / flip there, ~idx 1100-1140);
shells keep hitting the player after they cross the line (ignore finished karts as targets / hits).

**Build 31 (2026-10-17, committed locally df1a84f, NOT pushed):** Frost Peak far-peak flicker fixed (snow cap was coplanar with the
rock cone: z-fighting; user confirmed). GUI: title picks (track / driver / kart paint), how-to-play removed, mute
moved into Settings. Not tried on the phone yet.

**Build 32 (2026-10-17, committed locally, NOT pushed):** lobby reorganised (see Files: lobby camera,
icons, driver looks), drivers looks-only with flavour tags, item button icons as SVG, and the replacement AI
takes the picked driver's personality (castDrivers). Checked headless at 667x375, 844x390, 932x430; not tried
on the phone. User: the turntable kart in the lobby "is something good" (keep). Age on the hello screen is for nothing
for now (just stored; don't build on it unless asked). Still to ask: fit around the notch, the driver tag
lines (placeholders). Open idea not chosen: a
Rivals row (the 5 AIs with role icons) on the setup card.

**PENDING (user 2026-10-17, after Nova; analysed from races 12-14, build 32):**
- **Respawn ghost bug** (user: "seem to have had a bug last race", race 14 canyon, 6th). Player resets that race:
  t 50.8 'button' (stuck at 0 km/h for ~2 s after losing 112 km/h at ~106 m into lap 2, no rail/hit event) and
  t 94.5 flip after a 115 km/h rail hit, both ~100 m into the lap (start straight / banked right-hander).
  Acceleration after both resets looked normal. Ghost state is NOT in the telemetry: ask the user what they saw
  (stayed see-through? got hit while ghosted? solid inside a kart?). Suspect: `ghosted` only ends when no kart is
  within 3.2 m, so in a pack it can stay ghost (and item-immune) for long. Add ghost on/off events to telemetry.
- **More item boxes** ("to level out chances"): 3 rows per lap now (`boxRows`), player gets 5-9 boxes per race
  (avg ~7 of 9). Options: a 4th (5th) row per track, and/or `boxRespawn` 3 -> 1.5 s so back-markers find full rows.
- **Shields in last place too often**: player in 6th got 3 shields in 13 boxes (2 in a row in race 14) vs odds
  5/100 (all karts in 6th: 6/72 = 8%): mostly bad luck, but drop shield to 0 for 5th/6th (maybe 4th) in
  `CFG.items.odds`; move that weight to mushroom/triple.
- **Races 15-17 (build 33: Nova, new camera; canyon 4th, meadow 5th, meadow 4th; 4-11 s behind the winner,
  winners Luna / Bolt / Rex):** no player resets at all (so no new ghost data); rail hits down to 1-2 per race
  (were ~4). Hits on the player: 9, of which **7 red shells** (Mako 3, Bolt 3, Pip 1) + Luna's green and
  bullet: AI reds are what costs places now; watch it after the box/odds changes. Shells still hit karts that
  already finished (race 15: the player's red hit Luna 11 s after she finished): the open "ignore finished
  karts" fix. Shield in last place: none this time (6th got star, triple). **Star was weak** (all 41 stars in
  the log): it held ~108 km/h (top + 4 m/s, engine only) and gained ~20 m over its 6 s, rarely a place; a
  mushroom peaks ~130. User asked for more speed + a different sound -> done in build 33 (see Items).
- Also seen: **Bolt hit by his own red shell** (race 14, t 83.7, `hit kart 3 by 3 red`): owner should be immune.

**Note (user 2026-10-17): throw items forwards or backwards.** "I want some powers to give the option to be
thrown backwards or forwards. So the same power will show twice on screen and depending what the user want they
will slide to the proper direction." Not started. Idea as given: a throwable item shows two copies (forward /
backward) and the player slides onto the one they want, like today's slide from GAS onto ITEM (`slideToItem`).
Fits green / red shells and bananas (Mario Kart style: banana thrown ahead, shell dropped behind); the AI would
need to pick a direction too. Ask about layout (where the two copies sit vs GAS / BRAKE / joystick) before building.

**Note (user 2026-10-17): remove the side rails.** They make every track look the same. Not started; the rails
are also the walls karts collide with (+ rail reset, `wallHitLoss`, AI recovery, jump `jumpWallHeight`), so
removing them means deciding what keeps karts on the road instead (off-road slowdown? per-theme edges like snow
banks, rocks, fences, barriers only where needed). Ask before starting.

**Next**, roughly in order (agreed 2026-10-16):
- Another themed track: Frost Peak built (build 30, above); waiting for the phone test.
- **Driver looks matching their personalities** (user, 2026-10-17: will give them styles later): Rex the ace,
  Luna the defender, Mako the bully, Pip the steady one, Bolt the wild card. Each kart + driver should read as
  its character at a glance (colours, shape, maybe a signature part), and the name should show where it
  matters (results, the item warning "MAKO!"). Today they only differ by `CFG.karts` colours.
- Bully items (proposed 2026-10-17, waiting for the user's pick): Mako's odds lean to weapons, his red shells
  hunt the player from much further than `aiTargetPlayer` and he saves them for the player; maybe banana
  traps on the racing line.
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



## Builds 40-44 (2026-10-17, all uncommitted, not pushed, phone-tested: ghost look only)
User asked for game-experience tweaks after the build 39 race analysis (3 races on 38-39, all meadow).
- **Telemetry caveat:** races 1-76 hold only 1 buttons race of 32 (the user says they played buttons more; check
  whether older builds logged `steering` differently). Buttons race 47: 9 rail touches, ~1.8 s lost in total, still
  2nd. Joystick: ~1.4 rail touches/race. **Awaiting the user's own buttons races** before touching button
  steering. Ideas: gentler `steerReturn` (7 -> ~4), softer first ramp, rail assist (slide along the rail).
- **Build 40 instant boosts:** `CFG.kart.boostAccel` 8 -> 150 and `CFG.items.starAccel` 7 -> 150 m/s^2, so boost
  speed (+6, star +8 m/s) is reached in ~4 physics steps. Applies to mushrooms, pads, mini-turbos, star, AIs.
- **Build 41-43 ghost look:** the rider is one baked multi-material mesh; transparent + `depthWrite false` made
  its parts blend through each other. Now depthWrite stays on, alpha 0.4/0.6 at 6 Hz. **Real cause of "nothing
  shown" (build 43):** three bakes OPAQUE into the shader, so `material.transparent` needs `needsUpdate = true`
  or opacity is ignored. Manual reset uses the same ghost path (2 s, confirmed in telemetry).
  Still possible: drop-in pop and spawn flash on respawn, blue ghost tint.
- **Build 42 rocket start:** the instant push was too much from a standing start: `rocketAccel: 8` and
  `k.rocketT` keep the old gradual push for the rocket boost only.
- **Build 44 star:** the star kart now has no kart-vs-kart collision while star > 0 (`k.passT`, solid again once no
  kart is inside it), shove on hit 3 -> 7 m/s, so it drives through rivals instead of stalling behind them.
- Not done: more item boxes (4-5 rows), softer place odds, ghost-bug watch, boxes per race (9-12 in 38-39).
