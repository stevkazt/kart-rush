# Kart Rush: drivers and 3D characters

Moved out of CLAUDE.md (2026-10-17). Looks, the rig, every character (Nova..Hex), Rex veteran, Pip chibi, Koda goggles.

- **Driver looks (build 32):** `CFG.racers[].look` = helmet, visor, helmet mark + markColor: the driver's
  identity whatever the paint. 3D helmet + visor take it (paint roles 'helmet' / 'visor'; `kartColors(colors,
  look)` = the 5-colour list `paintKart` takes). 2D avatar `driverSvg(r)` (head + shoulders, mark = stripe /
  twin / moon / bolt / fin / dots) on the driver tile and picker. Keep using `look` for the 3D characters.
  **The player's driver is looks only** (user: role labels on your own driver "will create confusion thinking I
  can be a bully but my character behaves the same"): the picker and DRIVER tile show avatar, name and a
  flavour `tag` ("The shark"), never a role or gameplay blurb. No stat bars either. Personalities belong to the
  AI (`ai.styles`; the replacement AI takes the picked driver's, see castDrivers).
  Track maps (`trackShape`): checkered start line + yellow chevron for the direction. Paint cards: spotlight +
  floor so dark paints read; default paint is called "Team" (the driver's own colours).
  Settings: title + groups in a card; ALL SOUND Off dims the volume row (`#volume-row.dim`).
- **Drivers / 3D characters (build 33, `drivers.js`):** the rider is no longer baked into the kart body. Each kart
  has `k.rider` = one **SkinnedMesh with rigid bones** (every part follows one joint; `rig()` joint/part, `bakeRig`
  -> vertex colours + paint roles + an optional gloss group with a Phong material), so an animated character is
  1 draw call (+1 for gloss). `setRider(k, r, colors)` in castDrivers rebuilds it only when the driver changes;
  `paintKart` recolours body + rider; ghost alpha, star emissive and the bullet hull cover it. `animateRider(k, dt)`
  (in updateEffects) feeds `update(dt, {speed 0..1, steer -1..1 +right, drift, boost})`. Registry
  `DRIVERS[name] = { build(R, y0) -> update, avatar(r), kartArt(r) }`; drivers without an entry use `FALLBACK`
  (the old helmet + suit, paint-driven). 2D: `driverSvg` / `kartSvg(colors, driver)` use `driverAvatar` /
  `driverKartArt` when the driver has them. Cost: 92 -> 99 draw calls, GPU programs 17 -> 20 (skinned), warmed up.
  **Character standard (user 2026-10-17, after "too jagged... like stacked snowballs"):** smooth and toy-like:
  `smooth: true` in the registry = MeshStandardMaterial (roughness 0.55) with smooth normals, 12-24 segments,
  continuous shapes (`sweep` = tube along a CatmullRom curve with a radius profile; `teardrop` lathe; `taperZ`;
  `capsuleBetween`), colour gradients per vertex (part colour can be `colorAt(x, y, z)`), gloss = metallic
  Standard with a painted sky env map (`skyEnv`). Driver 1.25x the old size. Nova = ~6.8k triangles, 1 draw
  call + 1 for the visor (budget the user gave: "2,000-3,000 triangles"; the head/tail need the segments).
  **Nova (not phone-tested):** no helmet, smooth oval fox head, tapered two-tone muzzle, nose button, smooth ears
  with cream insides, teardrop cheek tufts, gold metallic visor on a strap, white jacket over cream belly, red
  shoulder stripes + cuffs, paws on the wheel, **static** red scarf collar with short wind-swept ends (the
  flapping version clipped the seat / tail at speed: don't animate it again), one S-curved tail clear above the
  spoiler, tip under head height so the chase camera sees her. Animation: ears twitch idle / fold with speed,
  torso + head lean into turns, tail sways against the lean (no idle wag). Next: Pip.
  **Luna (build 35, the cosmic space yeti, not phone-tested):** same smooth standard; torso + shoulder fur 1.3x
  wide (`LUNA_WIDE`), white shoulder tufts overflow the seat back; pear lathe head (lavender #C4B5FD), white neck
  ruff + round cheek puffs (pointed teardrops read as spikes), heavy white unibrow on its own `brow` joint, dark
  indigo face patch, glowing cyan eyes, two tusks rising from the lower lip (higher up they read as tears),
  glossy cyan ram horns (`sweep`, out/back/up), thick arms + indigo paws, shield pack on the upper back with a
  glowing crescent (`crescent()` extrude) above the seat back. `fluff(g, amp, freq)` = bumpy fur displacement
  (keep amp small: big values look jagged). Animation: slow breathing (torso scale), spring sway with momentum,
  "defender mode" at top speed or right after a kart bump: brow lowers, chin down, glow pulses.
  **Mako (build 37, the street-biker shark, the bully, not phone-tested):** same smooth standard, ~18k triangles,
  2 draw calls (matte + gloss). Head = one deformed sphere (`sharkHead(t, a)`: bullet tapering into a dropped
  snout, flatter belly; teal flanks -> slate crown, white underneath); things stuck on its surface use
  `onSurf(surf, curve, u)` / `surfRibbon(surf, curve, top, bot, lift)` (curve = u -> [t, a]; any head
  surface `surf(t, a)`, bent from a sphere by `surfGeo`; ribbons pick one orientation for the whole strip and
  wind themselves outward: a per-point flip on a flat crown made striped visors): the dark-crimson grin band,
  gill slits (3 a side), and the angular wrap shades (black, + red bridge; `pw()` = piecewise-linear edges for the
  sharp corners). Teeth = flattened cones (`tooth`), upper row on the head, lower row on a `jaw` joint. Fins =
  `finGeo(shape)` (extruded outline, thinner toward the tip): tall dorsal with a V notch on the crown, pectoral
  blades at the elbows, crescent tail on a stalk above the seat back (lower lobe clears the spoiler). Charcoal
  vest open over the white belly (V by colorAt) + red lapel sweeps, popped red collar, shoulder pads with 2
  silver spikes each. `spec.gloss` = per-driver gloss material (Mako: metalness 0.8, roughness 0.1).
  Animation: hard lean, hunch at speed, tail = rudder (trails to the side he steers) + idle swish, head bob while
  accelerating, chomp (jaw + head lunge) on firing an item (rider state `fire`, `k.fireT` set in useItem), on a
  boost, and every 3-7 s while parked (lobby). His team colours changed with him: teal kart 0x0d9488, red
  accent, charcoal suit (green until build 37).
  **Rex, Bolt, Koda (build 37, not phone-tested; all 7 drivers now have characters except Pip, still the helmet
  fallback).** Triangles per rider: Nova 6.8k, Mako 18k, Koda 25k, Luna 26k, Rex 27k, Bolt 33k; draw calls 81 ->
  86 on the grid, GPU programs unchanged (26).
  - **Rex, the cyber-raptor:** `raptorHead` surface (emerald snout -> cobalt crown, mint jaw), thin smile + 2
    fangs, nostrils, glowing cyan -> magenta visor (`surfRibbon`, glow) in a dark gloss frame across the snout,
    orange crest plates (`plateGeo`) down the head + neck, carbon suit with glowing telemetry lines (`chestZ` =
    front of the standard torso capsule), orange collar + shoulder caps, green clawed hands. Tail = two joints
    (`tail`, `tail2`) with armour bands + spine plates, over the engine, swings against the turn (more in a
    drift), tip lags = a whip. Visor + lines pulse with `R.glow`.
    **Grizzled veteran (2026-10-17, user spec):** olive-drab skin with discoloured patches (`wear()` sine noise in
    colorAt), slate crown, sage jaw; visor moved down/forward over the real eye line (bridge of the snout + sides
    at eye height; user: "goggles but his eyes are somewhere else"), dim cobalt, matte frame, two faint eye glows
    behind it, **glow stutters every 2-6 s**; heavy drooping lids + furrowed brow capsules; nostrils painted into
    the head's colorAt at the snout tip (sphere nostrils looked like they floated); yellowed fangs/claws; faded
    chipped terracotta crest (`plateGeo(size, chips)`, `crestAt`); `grime()` on suit, shoulder caps, hands; tail = plain bands + whole plates, bumpy
    tail scales. **Scars, visor cracks/scratches and tail bites/slashes/torn plates were built and then removed**
    (user: they "break the consistency of the design"; see whether the flicker alone reads as old). No textures
    (one baked vertex-coloured mesh, no UVs). `spec.matte` (bakeRig): Rex roughness 0.72. Head turns slowly and
    little when steering, stays level against the torso lean.
  - **Pip chibi (build 39, user: "too small"; from the chase camera only his beanie showed):** body `PIP_SCALE`
    0.85 (was 0.75), head at full standard size (`PIP_HEAD` = 1 / PIP_SCALE), pom-pom `PIP_POM` 1.2, cushion
    0.24 tall (was 0.19), torso 5 cm higher. Head + shoulders now clear the seat back from behind.
  - **Koda goggles (build 39):** dark rubber frames over the eyes, amber gloss lenses with the eye painted through
    (dark disc + glint), bridge; the strap is a `sweep` from one frame's outer rim round the back of the head
    into the other (a full torus crossed the eyes; an arc floated off the frames).
    ~33.7k triangles (was 27k), no gloss group any more (one draw call fewer). Studio views `brow`, `flank`, `flankR`.
  - **Bolt, the TV-bot:** `roundedBox` CRT head (analytic normals; r must be <= half the thinnest side), bezel,
    glossy glass, cyan face glyphs as capsule strokes on joints `happy` (^o^, eyes blink) / `strain` (>_<: bump,
    hard drift / steer, flooring it; held 0.5 s), screen glitch every 3-8 s, knobs + vents. Copper Tesla coil
    (`Helix` tube) spins with speed, 4 spark joints re-rolled every 0.05 s. Red stunt suit, white stripes,
    crash-test quarter-disc markers, hazard belt, 2 batteries + loose wires. Twin booster pipes on the back,
    spark puffs on acceleration / boost. Hidden parts = scale 1e-4, set only in update() (baking a part at a
    tiny scale loses precision). Head on a random-kick spring (wild).
  - **Koda, the red panda:** round rust head, cream muzzle / cheeks / brow spots, dark tear marks, glossy eyes,
    rounded white-rimmed ears (twitch), red headband with knot + 2 fluttering ends, bamboo bomber (stripes),
    knit collar / cuffs / hem, dark paws. Huge fluffy ring-striped tail (`sweep` radius now takes (u, v): fur
    bumps round the tube; rings from the nearest point on the spine) curling up the right side of the seat, on a
    spring that swings out in drifts.
  **Pip, Hex, Mako bulk (build 37, later; not phone-tested). All 8 drivers now have characters (FALLBACK unused).**
  - **Mako bulk:** `MAKO_BULK` 1.15 on his whole rider (S), plus `MAKO_W/MAKO_D` 1.4 / 1.0 torso width / depth
    (was 1.1 / 0.84; user: "his torso to occupy more space"), shoulder pads + arms moved out to match.
  - **Pip, the penguin chick:** `PIP_SCALE` 0.75 of the standard, on a brown corduroy booster cushion (`roundedBox`,
    full size on `root`). Round black chick head + white face mask, oversized brass goggles (gloss) on a strap,
    beak, striped cream/grey knit sweater (body colorAt) with ribbed hem + turtleneck, flipper arms, grey feet,
    pink ribbed beanie + cuff, giant fluffy pom-pom (highest point) on a `pom` spring joint driven by acceleration,
    steering, bumps and road buzz.
  - **Hex, the imp-wizard (8th driver, new `trickster` AI):** no body: a floating hood (`deform()` shapes a sphere
    with the face cut out into a pointed, back-leaning cowl with a wavy hem; an inward-facing lining = the black
    void; rim torus), glowing amber eyes on a blink/squint joint, floppy 3-joint tip (droops parked, windsock at
    speed), two glow rune rings (violet + amber, glyphs) spinning behind him. The wheel turns by itself.
    **Trickster AI** (`slip: true` in `ai.styles.Hex`): finds a kart 3-18 m ahead within 3 m sideways, lines up
    in its wake, gets `tow` +6% pace (+10% behind the leader) while in it, after `slingAt` 0.8-1.8 s pulls out
    3.2 m and slingshots past (1.6 s, tow kept). AI-only: there is no slipstream physics for the player.
    Headless meadow race: Hex towed ~24 s in 1.7 laps, 0 resets.
  - Roster is now Nova + 7 personalities, grid 6: **two** sit out each race (castDrivers handles it generically).
  - Animation hooks must tolerate missing pose fields (`s.bump || 0`): the studio's forced poses omit bump/fire,
    and a NaN made Pip's head vanish. New studio views `low` (small drivers) and `rear` (rear 3/4 on the move).
  **Glow parts (build 35):** `part(..., { glow: true })` = third material group, unlit `MeshBasicMaterial`
  (`R.glow`, its colour multiplies to pulse; eyes and crescent pulse together). Rider state got `bump` (0/1, a
  kart-to-kart contact in the last 0.6 s: `k.bumpT` set in the karts' collide listener).
