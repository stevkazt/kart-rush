# Kart Rush: tracks

Moved out of CLAUDE.md (2026-10-17). Layouts, heights, Canyon, Meadow. Frost Peak notes are in history.md (Build 30).

- **Tracks (build 20):** `CFG.tracks` = layouts (`meadow` "Green Valley", `canyon` "Canyon Run"), each with
  its theme, box rows and pads. `loadTrack(id)` tears down `trackRoot` (all track meshes) + `trackBodies` and
  rebuilds `track`, `itemVis`, `theme`, the minimap; `track`, `itemVis`, `theme` are `let`. Picker on the title
  screen (TRACK row -> `openPicker`, `selectTrack`), remembered in localStorage `kartrush.track`; `?track=canyon` in the URL
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
- Debug shape-test tracks: tech (1049 m) and flow (1485 m) in CFG.tracks, 70.6 (see tracks sizing rule 1000-1500 m).

## Debug shape-test tracks and track features (builds 70.2-70.20, 2026-10-18; all UNCOMMITTED)
All are `debug: true` (only listed with debug on; no records), theme `meadow`, flat grass ground, `plain: true` = ground only (1400 m plane; no trees / mountains / clouds: the meadow's mountain ring at r 240-280 stood on the big loops). `dbgActive` follows `track.def.debug`.
- Tracks: `lab` (669 m), `tech` Tech Run (1049 m, tightest R12), `flow` Big Flow (1485 m), `long` Long Flow (1782 m), **`spiral` Spiral Run (~1822 m)**: the user's pick ("could work as the only and longest track", keep editing THIS one, don't create new tracks for edits). Sizing rule: 1000-1500 m comfortable, ~1800 m is the cap.
- Spiral Run: ring x0.74 of Big Flow + a 2.5-turn cone helix in the middle (R40 -> R30, three levels 10 m apart, climbs in steps: 2 plateaus + 2 ramps per turn, +5 m per ramp, so coils stay exactly 10 m apart) up to y 25; flat top, wide turn, 70 m straight with 3 RED pads, a 32 m cut in the road (`gaps`), 10 m drop to the receiving edge (y 15) + a ~15% landing ramp to y 11, landing run, one gentle descent. Lip idx 1274, foot ~1310.
- New features in `main.js`: `gaps: [control point]` (the road between that point and the next is cut: no surface, curbs, rails, colliders or safety net; karts fly across, short ones fall = reset 'fell'); `bankRuns: [[from, to, deg, easeInM, easeOutM]]` (one long bank with its own smooth entry/exit; outside raised); pads `[idx, lane, kind]`: `'red'` = 5 m strip across the whole road, top speed +10 m/s and 1.6x longer than the orange (`CFG.items.redPadSpeed/Time`), `'wide'` = orange strip across the whole road; `levelColors: {from, to, step, colors}` (rails AND curbs coloured by height: blue / yellow / red); `axis: [x, z, r, h]` + `signs: [idx...]` (centre piece, visual only: tower, platforms, bridges, yellow chevron boards); meadow banks lift the road by |bank| x (halfWidth + curb) so the low edge stays above the grass.
- Tools: `dev/track-check.py` (length, tightest radius, 3D clearance, heights) for layouts; hole maths (gravity 20): a kart leaving the lip at v m/s is 10 x (32/v)^2 m below it at the receiving edge, so the edge at 10 m below the lip is cleared from 32 m/s (boosted), not from 26.
- Lessons: a 14 m fall onto a flat landing killed ~130 km/h (163 -> 27 km/h in 1 s, no event logged); the receiving edge hit by the user at y 17.3 (needs ~38 m/s). Falling karts respawn ~47 m before the lip at 0 km/h. Open ideas (user said after testing): open outer edge (no rails), obstacles in the inner lane (AI can't avoid statics), narrow the top coil, longer/lattice bridges, more signs. Spiral Run state: user is testing on the phone and will tweak.
