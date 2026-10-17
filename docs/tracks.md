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
