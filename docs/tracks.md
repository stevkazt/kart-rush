# Kart Rush: tracks

**Six tracks since the night of 2026-11-02 (build 72.x), each with its own signature corner, place and song; see 'The six tracks' at the end. New tracks planned and design lessons: track-plans.md.**

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
- **Canyon (~1150 m, N 1235, lap ~43 s; layout as of 72.6, see the end):** figure-8, start straight (y 0), banked right-hander, under the bridge
  through a slot canyon, whoops (idx 440/457), the Carousel (idx 513-681), crest on the mesa (idx 745),
  bridge 9 m over the lower road (idx ~930), jump (lip idx 1091, ~0.7 s, lands before the sweeper), banked
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

## Track features (builds 70.2-70.20)
Only `lab` is `debug: true` now (listed on the LAN server, or after 5 taps on the build label on the hosted copy). `dbgActive` follows `track.def.debug`. Sizing rule: 1000-1500 m comfortable, ~1800 m is the cap.
- Features in `main.js`: `gaps: [control point]` (the road between that point and the next is cut: no surface, curbs, rails, colliders or safety net; karts fly across, short ones fall = reset 'fell'); `bankRuns: [[from, to, deg, easeInM, easeOutM]]` (one long bank with its own smooth entry/exit; outside raised); pads `[idx, lane, kind]`: `'red'` = 5 m strip across the whole road, top speed +10 m/s and 1.6x longer than the orange (`CFG.items.redPadSpeed/Time`), `'wide'` = orange strip across the whole road; `levelColors` (rails and curbs coloured by height; no track uses it now).
- Hole maths (gravity 20): a kart leaving the lip at v m/s is 10 x (32/v)^2 m below it at the receiving edge, so the edge at 10 m below the lip is cleared from 32 m/s (boosted), not from 26.
- Lessons: a 14 m fall onto a flat landing killed ~130 km/h (163 -> 27 km/h in 1 s, no event logged); the receiving edge hit by the user at y 17.3 (needs ~38 m/s). Falling karts respawn ~47 m before the lip at 0 km/h.

## Run-off (builds 71.1-71.2, 2026-11-01)
- `openEdges: [[from idx, to idx, side (1 left, -1 right), metres]]`: the rail stands that far back from the curb, with grass between, easing out and back in over `CFG.track.openEase` (28 m). It is the same rail mesh and colliders (`track.oL/oR` per sample), coloured `palette.fence` if the theme has one. Karts can't leave the track, so AI, resets and laps need nothing new. Open only the OUTSIDE of a bend: open on the inside and it would be a shortcut. **Flat tracks only for now:** hilly tracks have no ground beside the road (only a floor 8 m down).
- `railLat(i, lat)` = the rail's road face at sample i on that side: use it (not wL/wR + curb) for anything that treats the rail as a wall (shells, hit motions, the eject, the rail reset).
- Grass: `offroadDrag` (in `applyStabilityAssist`) slows a kart past the curb to `kart.offroadSpeed` 17 m/s (`offroadDrag` 0.9 share/s, full 1.5 m past the curb); a star or boost ignores it. Only runs where the sample has an open edge. Telemetry: `offroad` events (on/off, idx, kmh, dur; every kart).
- Green Valley: open stretch idx 600-690 (left, 14 m, after the pad at 595). Hairpin half width 12 (4th value on the 4 points that `roadWidths` maps to samples ~250-330; it maps by index share, not by position, so check `__t.wL[290]`). First pad at idx 30 (was 200, then 170: don't put a pad on or just before a bend). Chevrons on all non-`plain` meadow-theme tracks.

## Green Valley landmarks (build 71.3, 2026-11-01)
User: the grandstand and windmill of 71.1 looked good, a bunch of trees doesn't make the scenery. `farm: true` = `buildFarm`: 2 grandstands on the main straight, paddock tents at the first bend, 2 windmills (past the hairpin, past the run-off), barn + silo + hay + fence at the chicane, pond + sheep. Trees: 7 groves, 56 trees (`groves`), was 110 scattered.
**Scenery budget:** measure before assuming. Trees are cheap (2 instanced meshes + 2 shadow draws, ~10k triangles); the riders are the big cost (~289k triangles with shadows, 12 draws). Build new static props with `propBatch()` (merged, vertex-coloured): any number of pieces = 1 draw + 1 shadow draw. Don't add a Mesh per piece: clouds and mountains were 82 Meshes until 71.3, now instanced.

Build 71.4 added, all batched (`flat` or the main batch): grass patches, a dirt yard, 3 crop fields with hedges, 2 villages with a church, 2 balloons, telegraph poles along the straights; plus 16 hills in one instanced mesh (none over a village). `FARM_SPOTS` keeps the groves off all of it. Flat pieces must stay clear of the road (`distToTrack`): they sit at about its height.

Build 71.6 (user: less empty, more integrated with the track, not necessarily more things): `farmLand` = `makeTerrain` around the road (faceted green slopes, `floor: 0`, `step: 4.5`), visual only, so it must stay at y = 0 where karts can go (`makeTerrain` now keeps the run-off flat) and at `FARM_SPOTS`, where props stand (`level`). Off a spot, use `land.heightAt` for y. Villages line the road instead of the horizon (`street`), a stone bridge crosses over the road at idx ~235, a stream runs from the pond and stops at each rail, an avenue at idx 826-905, hedges behind the rails on 3 stretches. Far mountains are rounder (all meadow-theme tracks).

Build 71.7 (user: remove the rails, give the track itself a theme): a track's `edges: { 1: [[from, to, kind]...], '-1': [...] }` = what the barrier looks like per side (`fence` by default, `stone`, `hedge`, `tyres`, `boards`), drawn in `buildFarm`'s batch; `buildWalls` then builds only the colliders, so physics, `railLat` and AI don't change. The road-side faces line up with the colliders. `palette` on a track overrides the theme's; `palette.shoulder` = dirt edge past the curb, real curbs only near corners under R26 (`tight`), wear on the racing line through corners (`palette.wear`). Green Valley run-offs: idx 600-690, 124-170, 532-560 (left), 358-398 (right). To port to another theme, `buildFarm`'s barrier loop should become its own function. The outer slopes climb 16 m more (`walls` in `farmLand`).

Build 72.1, Canyon Run: `buildBarriers` is now its own function and follows the road's height (`edgeDefault`, `kindAt`; rails taller than usual around the jump always draw as a wall). Stone walls (pale, or they vanish against the sand), ranch fences on the mesa, rusty steel on the bridge, tyres at the hairpin, boards at the start. Slot half width 7, bridge 7.5 (4th value, by index share: point p covers samples ~34p). Pad at 316 under the bridge. No run-offs: hilly tracks have no ground beside the road. The dirt ribbon past the curb is flat-track only (it would float).

## The recipe for a track (agreed on Green Valley, build 71.7; user: "so much better")
Shape the land around the road first (`makeTerrain`), then put things beside the road, not on the horizon: buildings along the street, something crossing over the road, water passing under it. Replace rails with barriers that suit the place (`edges`, `buildBarriers`), and give the road its own surface (`palette`: `road`, `dash`, `shoulder`, `wear`, `stone`, `wood`). Scenery must stay cheap: batch it (`propBatch`), and measure draw calls and triangles over several frames (the mirror redraws every other frame, so one frame misleads). The user judges by look and feel on the phone: landmarks and integration, not more trees.

## The six tracks (night of 2026-11-02, builds 72.3-72.10; none phone-tested yet)
User: Canyon's tight curve was "basically a copy" of Green Valley's and that can be noticed. So **no two tracks share a signature corner**: check this before adding a corner to a track.
| Track (id) | Length, half width | Signature | Place |
|---|---|---|---|
| Green Valley (`meadow`) | 852 m, 9 | flat 180 hairpin R12 | farm valley (approved, unchanged) |
| Canyon Run (`canyon`) | 1150 m, 9 (7 slot, 7.5 bridge) | the Carousel: climbing, banked, tightens R30 -> R23 round a butte (`basin`) | natural arch (idx 792), western main street on the start straight, water tower, wind pump, hoodoos |
| Frost Peak (`frost`) | 1011 m, 9 | the Summit: two separate 90 degree bends R21 + R26 with a short straight between; ice on the lake | ski resort: chalet street, chairlift over the road (moving chairs), slatted snow gallery (`gallery`), ski jump, rink with skaters, fishing huts |
| Harbour Run (`tech`, was Tech Run) | 1050 m, 7.5 (`halfWidth`) | the Yard: a zigzag R16-26 between container stacks | causeway with water both sides, swing bridge hump (idx 100), lighthouse dead ahead, cranes, ship, old town (cobbles, houses both sides), fish market, moving boats, gulls |
| Spiral Run (`spiral`) | 1539 m, 9 | the helix up the cone + 32 m gap over lava | volcano: cone, basalt columns, lava pit + rivers under the road, geothermal station (pipes over the road), viewing deck, plume, lava bombs |
| Temple Run (`jungle`, new) | 1322 m, 9 (7 rope bridge) | figure-8 with a viaduct over the rope bridge, straight through a pyramid tunnel | S-bends through palms, gorge with a waterfall, stone heads, parrots |
| Deep Shaft (`mine`, 73.1) | 1545 m, 9 (7 trestle) | the Levels: an S folded into a rectangle, three long galleries then one shaft back up; the Chute (16% down) into the banked Sump | surface camp (headframe, conveyor over the start), timber tunnels, trestle over an underground river, drill, crystal gallery, open pit with excavator and haul truck, ore trains |

**Underground (`dark`, 73.1, reworked 73.7):** the user wants enclosed spaces dark, with just enough light to read the road, and rejected fading the scene's lights at the mouths ("doesn't fit the aesthetics of the game"). So the lights and fog never change: `darkZones` gives `dark[i]` (a clean edge at the mouths), `pool[i]` (lamp pools) and `tone[i]` (the road's colour). The tube is unlit, one-sided rock (the chase camera can't be blocked) with lamps baked in, barriers underground are unlit too, and the karts stay bright. A flat mountain top surrounds everything, and terrain inside a tube's footprint is always pushed below it: a height field can't overhang, so going from under a tube to over its roof along the road stretched a wall across the tunnel. Reflectors and lamps show the road ahead. First layout had U-turns of R19 after the Chute: AI 3.5 resets per race, mostly flips in the Sump; R25 with `bankRuns`: 1.1.
Ids stay (`tech`, `spiral`) so records and race logs carry on. New helpers: `besideRoad`, `gable`, `farMassifs` (rough mountains, one draw; plain cones were "just triangles"), `rockArch`, `roadOnStilts` (deck + columns wherever the road stands off the ground, never in a lane of a road below), `movingWater`, `makeTerrain`'s `carve` (cuts even the flat beside the road: rivers pass under it). `buildBarriers` kinds added: `snow`, `ice`, `basalt`, `net`, `concrete`, `quay`. `surfaces: [[from, to, [c1, c2]]]` = road colour per stretch. `intro: [[from idx, to idx, height, lateral]...]` = the opening shots.
**The chase camera looks down:** landmarks close to the road and more than ~8 m up are out of frame in landscape. Something crossing the road needs a straight approach of 40+ m (Canyon's arch on the bend was never seen).
Layout tools: `dev/track-check.py` for radii and clearance. To move a layout, map old sample indices to the new one by nearest position (`geo.py` in `dev/sim/` samples the same curve), then fix `bumps`, `jumps`, `banks`, `bankRuns`, `boxRows`, `pads`, `edges`, `surfaces`, `intro` and the 4th-value widths (by index share).

## Shortcuts (`cut`, 76.2+; `buildCut` in main.js)
Frost's frozen stream is the first and only one: `cut: { points, halfWidth, mouth }` in a track def, one per track. A second piece of road beside the closed spline, with its own trimesh, walls, ice ribbon and banks; the main rail opens by itself wherever the cut's mouth runs through it (`railOpen`), and `makeTerrain` treats the cut as road, so it sits in its own gully and props keep off it. `cutIndex` maps a kart on it evenly onto the main samples it skips (`k.cut`, `k.cutI`), so laps, places and resets carry on; a reset puts the kart on the main road. On the cut there is no rail / fall reset and no WRONG WAY, and `iceUnder(k)` gives the grip. Telemetry: `cut` events (on / off, km/h, `dur`). AIs never aim for it. Items on it are untested: bananas and shells still think in main-road samples.
Measured with a button-style test driver at full throttle (idx 695-845): stream 3.93 s, road 5.30 s, about 1.4 s saved holding ~95 km/h; turning in late hit the main rail and dropped to ~30 km/h. One clean pass, not a tuned result. Bot race on Frost: 0 resets, no AI on the cut.
