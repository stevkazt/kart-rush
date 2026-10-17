# Kart Rush: screens, camera, iOS

Moved out of CLAUDE.md (2026-10-17). Lobby, pickers, settings, keyboard, camera, the iOS portrait strip saga.

- Overlay = `#menu-screen` (the lobby, build 32: header chips "Hi, <name>" + SETTINGS; logo, race pill, START on
  the left; open middle; RACE SETUP card on the right = track card with map + record footer, then DRIVER | PAINT
  tiles, each opening `#pick-screen`) and `#results-screen` (place, time, best lap, standings with gaps,
  RACE AGAIN / MENU, confetti on a win). `showMenu()` / `showResults()`; `#app.overlay-on` hides HUD + controls.
  Records in localStorage `kartrush.records` `{race, lap}`. Engines duck (`soundMix.duck`) behind menus.
  `#pause-screen` (RESUME / RESTART / MENU): `pauseGame()` from the pause button, Esc/P, or the app going to the
  background; the loop skips physics + render while `state.paused`, audio is suspended. All screens go through
  `showOverlay(screen)`. Lap counter `#lapbox` sits under the minimap (build 19; turns yellow on the final lap). HUD also has WRONG WAY (`updateWrongWay`: facing and moving backwards > 1 s) and a lap
  split under the LAP message (`showSplit`, green/red vs best lap so far).
- **iOS portrait strip (2026-10-16):** with rotation lock on, the installed app got a viewport of 797 of 844pt
  (short by `safe-area-inset-top`, 47pt) and clipped the page there: an empty band at the home-indicator edge.
  Tried and failed (iOS clips the web view itself): `html, body` height + env(safe-area-inset-top), and sizing
  #app from `screen.*`. Now testing status-bar-style `black` instead of `black-translucent` (the page starts below
  the status bar). Real landscape (rotation unlocked) never had the bug. 2026-10-17 phone screenshot (build 37):
  content still runs under the status bar (so the installed app likely kept black-translucent: iOS reads that
  meta at Add to Home Screen time) and the strip is navy = the page background. **Build 38:** `#vp-probe`
  (100lvh) and onResize takes max(innerHeight, lvh); html background is teal (#0e9f8a) as a diagnostic (teal
  strip = iOS draws the page there, our layout is short; navy/black = the web view is clipped); every resize
  posts `{kind: 'viewport', inner, screen, client, visual, lv, inset, app...}` to the telemetry log (skip
  these lines in race analysis). **Result:** phone reported inner 797, lv 844, screen 844, insets top 47 /
  bottom 34, and the strip stayed navy, not teal: iOS clips the web view itself, so no CSS/JS can draw there.
  Teal + lv sizing removed (sizing to 844 just pushed the game's far edge under the strip). Settings -> SCREEN
  Normal / Flipped (`#app.rotated.flipped` = rotate(-90deg), `kartrush.flip`; joystick + stage drag mapped)
  works on the phone but the strip stays at the phone's bottom. Next try needs a reinstall (iOS reads these at
  Add to Home Screen): status-bar-style `black` (already in index.html) + manifest orientation `any` (was
  `landscape`, possibly what makes iOS size the portrait window wrong).
  **Fixed by that reinstall** (2026-10-17, added via Chrome; the phone then reported top inset 0: the page starts
  below the status bar and fits). Reinstalling wipes localStorage (records, profile, settings).
- **In-game keyboard (build 38):** under portrait lock iOS opens its keyboard upright while the game is sideways,
  so the hello fields are `readonly inputmode="none"` and typed from `#kbd` (`buildKeyboard`, `setField`,
  `typeKey`): QWERTY + Ñ for the name (auto Name Case, max 12), a 3x3 digit pad + ABC 0 delete for the age (4 rows like the letters, so the fields never move), LET'S RACE as the enter
  key (moved into the active layout's last row). Keys fire on pointerdown. A physical keyboard works too. The title screen shows `build N · host · app` (bump N with `sw.js` VERSION): if the
  phone shows an old N, it is running a stored copy (the home-screen app once never contacted the server at all).
- **Lobby camera (build 32):** in the menu phase `updateCamera` runs `lobbyCamera` (slow 3/4 turntable of the
  player's kart from the outside of the grid, fov 42) instead of `chaseCamera`; `camera.setViewOffset` shifts the
  view by `lobbyShift` (from `layoutLobby`: middle of the gap between `.lobby-cta` and `.setup`) so the kart sits
  in the open middle. `chaseCamera` clears the offset and resets fov 66 on the first race frame. This is where
  the planned 3D characters get shown off (they ride in the kart). `#overlay.lobby-on` = lighter backdrop.
  Narrow phones: `@container` query on `.lobby-main` (works when #app is rotated).
- **Icons (build 32):** `ui-icons.js` `icon(name)` returns inline SVG (no emoji, no files): biomes (pine,
  cactus, snowflake; `CFG.tracks[].icon`), gear, pencil, speaker, muted, joystick, arrows, items (mushroom,
  banana, shield, star: the item button's innerHTML via `SVG_ITEMS`; shells + bullet stay CSS-drawn), and role
  icons (all-rounder, ace, defender, wild, bully, steady: unused for now, kept for a possible rivals display).
  `<i data-icon>` in HTML filled by `fillIcons()` at boot. No emoji left in the UI.
- **Chase camera (build 33, user: pulled "way too far back at top speed"):** `CFG.camera` distance 7 -> 4.6,
  height 2.6, `speedPull` 0.3 m (was 1.5), and `maxLag` 0.5 m caps the position lag (at top speed it trailed
  ~4.5 m: that was most of the pullback); FOV kick at most +5 deg (`fovSpeed/fovBoost/fovMax`). The kart is the
  same size at 113 km/h as parked. Look-at = 6 m ahead at `lookHeight` -0.9: the user asked for "above the
  head", but that put the kart behind the km/h readout; now only the rear wheels overlap it. Dizzy stars moved
  up to y0 + 2.1.
  **Build 34 (user: "Nova's tall fox ears block the horizon"):** `height` 2.6 -> 3.5, look-at 8 m ahead at
  `lookHeight` -0.1: view centre ~16 deg down, the ear tips' sight line ~19 deg, so the ears sit just below the
  centre. The kart then landed under the km/h readout, so `#speedo` moved just right of the kart
  (`left: 50% + 0.17 * --app-h`).
  `dev/test.sh studio [front,side,back,fast,turn,chase,face,profile]` = lobby close-ups of the player's driver with forced
  poses (the default pick is Nova; for another driver set `kartrush.driver` first).
- **Split stage (build 35, driver + paint pickers):** `#pick-screen.staged` = left `#pick-stage` (42%, open;
  name + flavour tag of the driver or the paint name on top, never a role; user: ALL text goes with the 3D view, so
  the cards are art only, 3 per row, `aria-label` = the name) + right `.pick-panel` (title,
  vertical 2-col driver / 3-col paint grid, DONE); `#overlay.stage-on` = left-light-to-right-dark gradient. The
  track picker keeps the old centred strip (`.pick-panel` is `display: contents` there). `lobbyCamera` blends
  (angle / distance / height / fov / view shift, ease 5/s) between the turntable and the stage view: close 3/4
  front, kart centred in `#pick-stage` (view offset from its offsetLeft), drag on the stage turns it
  (`stage.rot`), after 2.5 s untouched it eases into a slow +-0.45 rad swing. `stageLight` = a directional key
  light, always in the scene (intensity 0 in races, so it never recompiles materials; the race camera zeroes
  it). A pick sets `stage.pop`: bounce of the rider + body mesh. Test: `dev/test.sh pick driver,kart`
  (screenshots, taps the 3rd card). Not phone-tested.
- **Title picks (build 31):** `openPicker('track' | 'driver' | 'kart')` fills `#pick-list` with cards in one
  horizontally swipeable strip (`.pick-grid`, tracks 1 row, drivers / paints 2 rows; edges fade when it
  overflows), so new tracks / drivers just extend it. A tap picks at once; DONE -> `showMenu()`. `onTap` ignores a
  finger that moved > 10 px (swipes), and the global touchmove block exempts `.pick-list`. Track cards: outline
  drawn from the control points (`trackShape`, cached; length), theme tint (`data-theme`), record.
  **Driver:** `CFG.racers` = 6 named drivers (Nova, the old red "YOU" kart, has the default AI style), each with
  `role` + `blurb` for the card. `karts[0]` is still the player; `castDrivers()` makes it the picked driver and
  gives the other five the remaining names + colours. **The AI field's personalities never change** (user: "the
  difficulty shouldn't change based on what racer I pick"): the spare driver (`CFG.racers[0]`, Nova) drives with
  the picked driver's style (`k.style`, used by `newAI` in `placeOnGrid`; telemetry `style`). Pick Rex = Nova
  drives as the ace. AI logic reads only the style, never names. Standings show the player's name. **Kart:** `CFG.paints` = body + accent schemes (`Team` = the driver's own; suit stays the
  driver's). Looks only. `paintKart(k, colors)` recolours the baked mesh in place: `buildKart` tags parts with a
  role ('body' / 'accent' / 'driver', `PAINT_ROLES`) and `bakeMeshes` keeps it per vertex
  (`geometry.userData.paint`). Saved: `kartrush.driver`, `kartrush.paint`; telemetry has `player: {driver, paint}`
  and real driver names (index 0 = player). Kart/driver art on the cards = `kartSvg(colors)` (side view).
- **Hello screen (build 31):** `#hello-screen` asks name + age when `kartrush.profile` (`{name, age}`) isn't saved:
  `showMenu()` sends you there while `profile` is null. `submitHello` checks them (name 1-12 chars, age 3-120) and
  saves. Name = "Hi, <name>!" button on the title (tap to edit) and replaces YOU in the standings (`escapeHtml`).
  Age is stored only, not used yet. Inputs re-enable `user-select` (iOS won't type otherwise) and the game's
  keydown handler ignores keys typed in an input.
- **Settings (build 28):** `#settings-screen`, opened by the `.btn-settings` buttons on the title and pause screens
  (`showSettings`; BACK returns to `settingsFrom`). Only option so far: **steering** `buttons` (the two arrows) or
  `joystick`, saved in localStorage `kartrush.steering` (`setSteering`, `savedSteering`; `#app.steer-joystick`
  swaps `#steer` for `#joystick`). ALL SOUND On/Off (`#mute-pick`, `sound.setMuted`) replaced the
  in-race mute button (build 31); the pause button moved into its corner slot. Joystick = knob in a base where the arrows were; analogue `input.axis` -1..1 from
  the knob's sideways offset only (`CFG.controls.stickDeadZone` 0.12, full lock at `stickFull` 0.85 of the radius),
  springs back on release (`releaseStick`, also on pause). Portrait: screen offsets are turned 90deg back into
  the game's frame. `ctl.steer = clamp(arrows/keys + input.axis)`, so the steering ramp and lock are the same for
  both. Add future options as more `.setting` blocks on that screen.

- **Vertical-view menus (build 64-65):** the overlay is laid out upright (~390 x 800); see 'Builds 64.40-65' in history.md. Default view is vertical (`savedView`). Track picker = `#track-preview` + compact card column (`.tracks`); the 3D track overview later replaces the contents of `#tp-view`. Lobby/picker kart framing in vertical uses `lobbyShiftY` / `shiftY` (view offset Y).
