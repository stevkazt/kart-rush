# Track plans and design lessons (saved 2026-11-02, build 72.16)

Plans for what comes next, and what the night of 2026-11-02 and the first phone feedback taught. The how-to for building a track is 'The recipe for a track' and 'The six tracks' in tracks.md; what happened build by build is in history.md.

## What the user said
- "The new tracks are way better than the old ones." Harbour Run and Temple Run were singled out ("a really good addition").
- Asked for more tracks: "closed spaces in a track and space ambients in other track".
- Asked about alternative paths: "I didn't see anything about alternative paths". None exist yet.
- Canyon's new curve: "feels smoother now". The copied-curve complaint looks answered.

## Waiting on the user
1. **Where the first shortcut goes.** Recommended: Frost's frozen lake. Second choice: Harbour's container yard.
2. ~~Which new track comes first~~: the mine, built.

The shortcut was answered on 2026-11-03: Frost's lake side, built as the frozen stream (76.4, see tracks.md). The moon base is neither approved nor started. The layouts are proposals.

## New track: the mine or cave (BUILT as Deep Shaft, 73.1: tracks.md; these were the notes)
Low ceilings, lamps, rail bridges over deep drops, and bursts into daylight.
- **Dark, but readable (user, overrides the first note):** "the enclosed track calls for darkness but include enough light to be able to see the track and avoid forcing sight too much".
- **Alternate inside and out.** Temple's pyramid and Frost's gallery show short covered stretches work. Daylight bursts also give landmarks somewhere to be seen.
- **Check the chase camera first.** It sits above and behind the kart, so test the ceiling height with it before building scenery. Jumps must fit under the ceiling too.
- **Walls don't save fps by themselves.** three.js only culls what's outside the view, not what's behind a wall. Scenery beyond the rock is still drawn, so build less of it and check `dev/test.sh cost`.
- **Signature corner:** must be new. Don't repeat Green Valley's hairpin, the Carousel, the Summit, the Yard zigzag, the helix or the figure-8.
- **Song:** its own, with drive (see Music below).

## New track: the moon base (proposal)
Black sky with Earth overhead, craters, glass tubes, a road floating over the void.
- **Scenery can be cheap:** there's little of it. The risk is the opposite: it can look empty, and the user wants landmarks integrated with the road. Use the base, tubes and craters to shape the road.
- **Black sky vs. dark scenes:** keep the ground and road bright, so only the sky is black.
- **Lower gravity on the jumps** would make it feel really different, but karts get airborne more easily. Try it with bots first. Not checked: whether gravity can differ per track without touching steering, which must not be retuned. If it can't be done cleanly, drop it.
- **Falling off:** a road over a void needs falls that reset cleanly. Use the logic from the volcano (gotcha 15), and test with bots, since that's where the ~400-reset loop came from.

## Alternative paths (design notes)
Why it isn't quick: the track is one closed spline. Progress, lap counting, WRONG WAY, the minimap, `nearestTrackIndex` and the AI line all assume it.

Cheapest first step:
- One shortcut that rejoins the road soon, as a second road section outside the main spline, with its own colliders.
- Player only at first; AIs stay on the main road.
- It needs a real risk (rough ground, ice, a jump), or it's just the new racing line.
- Progress must not break while on it, and it must not read as WRONG WAY or trigger a reset.
- Run-offs sit only on the outside of bends precisely so they aren't shortcuts; keep that.

Frost's lake suits it because the ice already supplies the danger and the shortcut is visible from the road. The lake's shape changed in 72.16 (`lake` in the snow theme), so re-check the idea against an aerial view. Hilly tracks have no ground beside the road, only a floor 8 m down, so anything off-road there needs ground colliders first.

## Design lessons
**Tracks**
- **Vary the outline (user):** "most of them look like a circle with some disturbances". Check the shape on the minimap before anything else; don't draw another ring. The moon base needs its own outline too.
- Every track gets one signature corner nobody else has. The user spots copies: Canyon's hairpin was "basically a copy" of Green Valley's, and Frost's was too.
- Landmarks over quantity. Theme the barriers and the road surface, shape the land around the road, and put buildings along the street. Random extra trees get rejected.
- Harbour and Temple are the ones the user praised most. Both have a strong sense of place plus layout features no other track has (causeway and container zigzag; figure-8, rope bridge and pyramid). That's the bar for the next ones.
- Anything crossing the road needs a straight approach of 40+ m; anything close to the road and over ~8 m up is out of frame in landscape.

**Surfaces and edges**
- A change of surface must look planned. Frost's cut from tarmac to ice "looks like a bug". Fade through a transition material and make the surroundings agree: the lake ran 40 m past the ice, so tarmac passed through it.
- Decoration painted for one surface can betray another: the grey tyre-wear ribbon showed on the ice.

**Checking visuals**
- Look from the air as well as the road: `shots cam@x/y/z/lx/ly/lz`. The Frost cut was obvious from above.
- `shots idx` isn't quite where the picture is. The kart keeps rolling for the 2.5 s before the capture (60-79 km/h on Frost, so tens of metres further on).
- For anything placed by side, check the sign: `normals` points to the kart's left, while a mesh turned with `atan2(-t.x, -t.z)` has its local +x on the right. That's what swapped the podium steps.

**Cameras**
- "Laggy" doesn't always mean low fps. The first intro was mostly the camera: 82 m/s (3x a kart's top speed), and an aim stepping between road samples. Keep scripted cameras near race speed (26 m/s) and move position and aim along smooth curves.
- Only the chase camera eases `speedFx` and the FOV. Any other camera must clear them itself (gotcha 16).

**Performance**
- Read the log before optimising. On 72.13 the phone held about 60 fps at up to 368k triangles, with `idleFps` 60. The old 30 fps on Canyon was very probably a cap (Low Power Mode), not load; it's unproven because older races have no `idleFps`.
- Keep measuring with `dev/test.sh cost` (keep the worst near 320k) and batch scenery with `propBatch`. House shutters alone cost 40k on Harbour.

**Music**
- The user judges songs on drive and character: Canyon's first song was "too chill and generic". Give each track an unmistakable style, not just a different chord list.
- Claude can't hear the songs; a script only checks the notes are in key. Say so each time and ask about style, speed and volume separately.

**Bots vs. the phone**
- Bots catch breakage (reset loops, snags); only the user can judge feel. Compare builds on the same race mix, since single races vary a lot.
- Spiral is still the weakest track in the bots (4.0 AI resets per race, others 1.2-2.4).

**Reporting**
- List what was deliberately skipped. The shortcut was skipped overnight and left out of the morning report; the user had to ask.

## Open checks when work resumes
- **User's verdict still owed:** the intro on looks (Frost logged 60 fps, worst frame 25 ms, on 72.15), the new Canyon song, the podium and Frost's ice on the phone. Canyon's song is unheard as far as the logs can tell.
- **Brief freezes:** about half a second just after GO on the first race (510 ms on Canyon, 659 ms on 72.1) and near the finish (492 ms Canyon, 524 ms Spiral). Not investigated.
- **Other Canyon caveats:** the user mentioned having more than the copied curve; they've never said what they are.
- **Grand Prix:** `CUP_TRACKS` has five tracks and no Temple Run. Given how much the user likes it, ask whether it should join. New tracks raise the same question.
- **Green Valley and Spiral:** "the new ones are better than the old ones" may mean Green Valley now looks plain. It was left alone because it had been approved; ask before changing it.
