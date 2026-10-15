# Kart Rush — handoff notes

Mobile-first 3D kart racer (Mario Kart style). Vanilla JS + Three.js 0.160 + cannon-es 0.20, both from
jsDelivr via the import map in `index.html`. No build step. The user plays it on an iPhone over the LAN.

## Run
```bash
cd kart-racer && python3 -m http.server 8000 --bind 0.0.0.0
# phone (same Wi-Fi): http://<mac LAN IP>:8000   ->  ipconfig getifaddr en0
```
Plain HTTP on the LAN is not a secure context, so the service worker does not register on the phone.
iOS "Add to Home Screen" still gives a fullscreen app with an icon. Offline play and the Android install
prompt need HTTPS. A public tunnel was offered but not set up: ask the user before exposing it.

## Files
- `index.html`: import map, HUD, touch controls, overlay. Everything sits inside `#app`.
- `style.css`: `#app` is always laid out landscape; `.rotated` turns it 90deg in portrait. Sizes use `--app-h`
  and safe-area vars `--edge-l/--edge-r`, which map to the top/bottom insets when rotated.
- `main.js` sections: 0 CONFIG (`CFG`; all tuning lives here) · 1 INITIALIZATION (renderer, world, track,
  kart, state/HUD/minimap) · 2 CONTROL LISTENERS · 3 GAME FLOW (countdown, laps, resets) · 4 PHYSICS STEP
  (+ `applyStabilityAssist` on `preStep`) · 5 RENDERING LOOP (sync meshes <- bodies, camera, effects, HUD).
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
7. Keep track corners at a minimum radius of about 19 m or more (the half-width is 7 m, and the walls sit at
   8.3 m). A 9 m hairpin was unplayable. The track is the `CFG.track.points` Catmull-Rom loop.

## Testing
```bash
dev/test.sh autopilot 80        # full race with button-style autopilot; prints lap log + STUCK events
dev/test.sh tap 0.25 0.6 1.0    # hold RIGHT on open grass at top speed; heading/slip/yaw per hold time
```
Current baseline: autopilot laps of about 21–23 s with 0 STUCK events. `tap 0.6` gives about 35 degrees at
release, slip under 2 degrees, and 95 km/h kept. `dev/test.sh` injects debug globals (`__k` kart, `__s` state,
`__t` track, `__w` world, `__in` input) into a temp copy by replacing the `// ---------- Boot ----------` marker
line in `main.js`. Keep that line. The page can't be tested on a real phone from here: ask the user to
check touch and feel.

## User feedback so far
- Physics stuck bug: fixed. Wants landscape only (done), buttons instead of a joystick (done), PWA (done).
- Steering: "feels slow but much better, let's leave it like that for now". Don't retune unless asked.
- Wants it to feel like a finished game rather than a demo.

## Roadmap (agreed with the user)
**Next: AI opponents.** This is the user's chosen priority.
- 3–5 AI karts following the centre line, each with its own lateral offset, speed variance and occasional
  mistakes. `dev/autopilot.js` already shows pure-pursuit steering on `track.samples`.
- Reuse `buildKart()` (parameterise colour; it currently uses the shared `world` and pushes to the scene) so
  AIs are real raycast vehicles that can bump the player.
- Race position ("2nd / 6") from lap + trackIdx progress, a results screen with placings, and a start grid.
- Rubber-banding so races stay close.

Later, roughly in order:
- Sound: engine pitch from speed via WebAudio (no assets), drift/boost/wall/countdown SFX, music,
  mute toggle.
- Mario Kart identity: item boxes (mushroom/banana/shell), boost pads, a hop-to-drift button with
  mini-turbo levels.
- Visual polish: tyre smoke, skid marks, grass dust, grandstands/flags/tyre stacks, sky gradient,
  WRONG WAY warning, lap split vs best.
- Structure: title screen, kart colour picker, more tracks (just new `points`), best times in
  localStorage, ghost of the best lap, pause menu with a steering sensitivity slider.

**Deferred by the user ("ignore for now"):** the speed-feel item. That means a lower/closer camera, speed
lines, camera shake, close trackside objects and a higher top speed.
