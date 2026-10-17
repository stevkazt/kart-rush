import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { sound } from './sound.js';
import { icon, fillIcons } from './ui-icons.js';
import { PAINT_ROLES, buildRider, driverAvatar, driverKartArt, sweep } from './drivers.js';

/* ==========================================================================
 * 0. CONFIG
 * ========================================================================== */
const CFG = {
  physicsStep: 1 / 60,
  maxSubSteps: 5,
  gravity: -20,
  laps: 3,

  track: {
    // Shared road geometry. The layouts themselves are in `tracks` below.
    spacing: 0.93,     // metres between centre-line samples (their count follows from the length)
    halfWidth: 9,      // road half width (was 7: too tight to avoid other karts); a 4th value on a control
                       // point overrides it there. Narrowed automatically on the inside of tight bends.
    innerWallRadius: 3, // the inside rail of a bend never curves tighter than this (m), so it can't fold over
    minHalfWidth: 5,
    curb: 1,           // curb width (between road and wall)
    wallThickness: 0.6,
    wallHeight: 1.2,
    jumpWallHeight: 2.6, // rails around jumps, so an airborne kart can't sail over them
    wallStride: 4,     // samples per wall segment
    roadStride: 2,     // samples per safety-net box under a road with heights (flat roads use one ground plane)
    netDepth: 0.25,    // ...that far below the surface the wheels ride on (see buildRoadBodies)
  },

  // Layouts. Control points are (x, z[, y height[, halfWidth]]) of a closed centripetal Catmull-Rom loop;
  // design them with dev/track-check.py. Everything placed by sample index (items, pads, features) must
  // move when a layout changes. Features: bumps [idx, length m, height m] (a crest: air above
  // ~sqrt(20 * length^2 / (2 pi^2 height)) m/s), jumps [lip idx, ramp length m, rise m] (a kicker with a
  // step down after the lip), banks [idx, half-length m, degrees] (the outside of the bend is raised),
  // ice [from idx, to idx] (low grip, see kart.iceGrip; 8 m soft edges).
  tracks: {
    meadow: {
      name: 'Green Valley', icon: 'pine', theme: 'meadow',
      // ~850 m: main straight, fast right, boost straight, a 12-13 m hairpin (several points along it: a
      // single apex point makes a cusp), flowing chicane, middle S-bends, fast sweeper, a 16 m kink on
      // the left, back to the line. >= 26 m between different parts of the loop.
      points: [
        [-20, -95], [50, -95], [95, -88], [118, -60], [126, -25], [126, 10],
        [124.1, 35.1], [121.5, 39.6], [117.5, 43], [112.6, 44.8], [107.4, 44.8], [102.5, 43],
        [98.5, 39.6], [95.9, 35.1], [95, 30], [92, 10], [84, -8], [62, -22],
        [38, -18], [20, -2], [4, 16], [-6, 36], [-4, 56], [-2, 71.4],
        [-2.9, 78.3], [-6, 84.6], [-10.9, 89.6], [-17.1, 92.9], [-24, 94], [-60, 96],
        [-85, 88], [-105, 62], [-112, 28], [-100, -3], [-112, -35], [-102, -75],
        [-70, -93],
      ],
      boxRows: [95, 241, 450, 670],                      // sample index of each row of item boxes (4th: build 36)
      pads: [[200, 3], [335, -2], [595, 0], [870, 2.5]], // boost pads: [sample index, lane]
    },
    canyon: {
      name: 'Canyon Run', icon: 'cactus', theme: 'desert',
      // ~1130 m figure-8. Start straight (y 0), banked right-hander, under the bridge through a slot
      // canyon, climb with whoops, 12 m uphill hairpin, crest on the mesa (y 9), over the bridge (9 m
      // above the lower road), jump on the way down, banked downhill sweeper to the line.
      points: [
        [181, 20, 0], [180, -15, 0], [174, -50, 0], [160, -78, 0], [138, -96, 0], [110, -104, 0],
        [80, -100, 0], [40, -55, 0], [15, -15, 0], [-15, 15, 0.3], [-45, 45, 1.8], [-80, 75, 3.6],
        [-112, 96, 5], [-140, 103, 5.8], [-165, 104, 6.4], [-177, 99, 7], [-182, 87, 7.6], [-177, 75, 8.2],
        [-165, 70, 8.6], [-145, 68, 9], [-128, 58, 9], [-122, 38, 9], [-122, 10, 9], [-115, -25, 9],
        [-95, -48, 9], [-65, -55, 9], [-40, -42, 9], [-15, -15, 9], [15, 15, 9], [45, 45, 8.8],
        [75, 75, 8], [105, 95, 7.2], [140, 100, 4.5], [165, 95, 1.6], [178, 78, 0.3], [181, 50, 0],
      ],
      bumps: [[440, 14, 0.7], [457, 14, 0.7], [700, 26, 1.9]],
      jumps: [[1074, 9, 1.1]],
      banks: [[110, 45, 12], [1140, 30, 8]],
      boxRows: [230, 405, 760, 1010, 1185], // 5 rows: the longest track (405, 1185 added in build 36)
      pads: [[40, 0], [480, -2], [985, 0]],
    },
    frost: {
      name: 'Frost Peak', icon: 'snowflake', theme: 'snow',
      // ~930 m. Start straight beside the frozen lake (y 0), banked left sweeper, climbing S-bends through
      // the pines, a 13 m hairpin at the top (y 10.5), back along the ridge, a fast downhill with a crest,
      // then across the lake on ice: a gentle S (tightest ~32 m) on two thirds of the grip, back to the line.
      points: [
        [150, -15, 0], [150, 20, 0], [145, 55, 0.3], [128, 82, 0.8], [100, 98, 1.5], [70, 100, 2.5],
        [45, 112, 4], [20, 118, 5.5], [-5, 108, 7], [-30, 112, 8.5], [-55, 115, 9.5], [-70, 112, 10],
        [-80, 104, 10.3], [-84, 94, 10.5], [-81, 84, 10.5], [-73, 77, 10.5], [-62, 74, 10.4], [-35, 74, 10],
        [-10, 72, 9.5], [8, 62, 9], [15, 40, 8], [10, 15, 6.5], [-5, -10, 5], [-30, -35, 3.5],
        [-55, -55, 2], [-70, -78, 1], [-62, -100, 0.3], [-35, -112, 0], [0, -114, 0], [35, -106, 0],
        [70, -114, 0], [105, -112, 0], [130, -100, 0], [146, -82, 0], [150, -55, 0],
      ],
      bumps: [[600, 20, 0.9]],
      banks: [[162, 25, 8]],
      ice: [[712, 905]],
      boxRows: [60, 298, 420, 760],                 // 298 added in build 36
      pads: [[30, -3], [430, 0], [585, 2], [955, 0]],
    },
    // Test Lab (debug builds only, http): flat 669 m loop to test walls, boosts and items. South straight
    // (bump, pads), banked left sweeper (R31), north straight on ice, 90deg R13 corner, S chicane (R12),
    // 90deg R14 corner, R20 corner back to the line. `spots`: control point indices the debug panel jumps to.
    lab: {
      name: 'Test Lab', icon: 'gear', theme: 'meadow', debug: true,
      points: [
        [-20, -80], [30, -80], [80, -80], [115, -65], [130, -30], [130, 10], [130, 30], [125, 41],
        [114, 46], [84, 46], [56, 46], [34, 56], [12, 46], [-10, 36], [-32, 46], [-58, 46],
        [-82, 46], [-95, 40], [-100, 28], [-100, 0], [-100, -48], [-90, -71], [-66, -80], [-42, -80],
      ],
      spots: [['Start', 0], ['Sweeper', 3], ['Straight', 5], ['Corner 90', 7], ['Chicane', 11], ['Corner W', 17], ['Corner SW', 21]],
      bumps: [[60, 14, 0.8]],
      banks: [[165, 35, 10]],
      ice: [[205, 255]],
      boxRows: [80, 215, 310, 470, 600],
      pads: [[20, 0], [230, -2], [300, 2], [560, 0]],
    },
  },

  kart: {
    mass: 150,
    chassisHalf: new CANNON.Vec3(0.8, 0.25, 1.3),
    chassisYOffset: 0.15,   // shape offset above body origin -> lower centre of mass
    wheelRadius: 0.4,
    wheelX: 0.95,
    wheelFrontZ: 1.05,
    wheelRearZ: -1.0,

    engineForce: 650,       // per driven (rear) wheel
    reverseForce: 350,
    brakeForce: 600,        // unused: karts on the grid are pinned in applyStabilityAssist (k.held)
    wheelBrake: 1.5,        // per wheel while braking (cannon-es: an impulse cap per step, not a force)
    brakeDecel: 22,         // m/s^2 through the centre of mass (big wheel brakes flipped the kart)
    coastBrake: 12,         // rolling resistance when no pedal is held (unused while driving now: see playerCoast, ai.coast)
    playerCoast: 3,         // the player's kart rolls on when GAS is released (~5 km/h lost per 0.3 s lift)
    ghostTime: 2,           // after a respawn: drives through other karts, items can't hit it, see-through
                            // (user: "so no one gets taken off guard by the respawn")
    rescueTime: 2.5,        // player held GAS/BRAKE this long while barely moving (stuck on a rail): put back
    rescueSpeed: 2,         // ...below this speed (m/s)
    maxSpeed: 26,           // m/s
    maxReverse: 8,

    maxSteerLow: 0.5,       // rad, at standstill
    maxSteerHigh: 0.1,      // rad, at top speed
    steerRate: 2.0,         // how fast a held button ramps toward full lock (per second)
    steerReturn: 7,         // how fast the wheel recentres on release / direction change
    wheelBase: 2.05,
    // Drawn kart vs physics (build 34, user: the kart looked "too big, wide, and stretched out" next to the
    // driver): the chassis and wheels are DRAWN this much smaller (scaled about the ground under the kart's
    // centre) and the wheelbase a further 15% shorter. Physics (wheel spots, collider, grip) is unchanged, so
    // the handling is the same. The driver keeps their size and sits lower by seatDrop.
    look: { scale: 0.77, wheelbase: 0.85, groundY: -0.61, seatDrop: 0.15 },

    frontGrip: 2.6,
    rearGrip: 2.3,
    driftGrip: 1.7,         // rear grip while drifting -> tail slides out a little
    driftMinSpeed: 15,
    driftYawAssist: 0.5,
    maxLateralAccel: 14,    // stability assist: caps the requested turn rate at this grip (m/s^2)
    iceGrip: 0.65,          // on ice (a track's `ice` stretches): x tyre grip and x maxLateralAccel (AIs: x cornerGrip)
    yawSlack: 0.1,          // stability assist: allowed yaw rate above what steering asks for
    steerYawSlack: 0.15,    // ...plus this much at full lock
    driftYawSlack: 0.2,     // ...plus this much while drifting
    maxYawRate: 3.0,
    wallHitLoss: 0.01,      // rails: share of speed lost per m/s of impact into the rail...
    wallHitMax: 0.15,       // ...capped here (was 0.35; cut in half after a friend said rails brake too hard)
    railPush: 2,            // m/s the solver may still push a kart out of a rail (frees it when sunk in; more = bouncier)
    railGlide: 0.6,         // share of the speed that went into a rail kept as speed along it (0 = a head-on hit stops dead)
    railClimb: 1.0,         // m/s a kart in rail contact may rise beyond the road's own slope (stops it riding up the wall)
    railFree: 7,            // m/s^2 nudge along the road when pinned on a rail with the gas held (below railFreeBelow)
    railFreeBelow: 3,       // m/s
    railTurn: 8,            // rad/s^2 swinging a nose-into-the-rail kart along it (build 45: head-on hits stopped it dead / flipped it)
    wallScrape: 0.2,        // share of speed lost per second sliding along a rail (~9 m/s^2 at top speed,
                            // little when crawling off it; rails had no friction: free to lean on)

    miniTurboTime: 1.1,     // seconds of drift needed for a boost
    boostDuration: 1.0,
    rocketWindow: 1.0,      // rocket start: GAS first pressed within this many s before GO and held through it
    rocketEarly: 1.8,       // ...held since earlier than this before GO = engine stall
    rocketBoost: 0.9,       // boost seconds for a rocket start
    stallTime: 0.8,
    airLevel: 6,            // in the air: turn toward the road's tilt (rad/s per rad off)...
    airDamp: 3,             // ...and damp tumbling (per second)
    boostAccel: 150,        // m/s^2 on top of the engine, pushed through the centre of mass (no wheelie); high = boost speed at once
    boostSpeed: 6,
    rocketAccel: 8,         // the rocket start keeps the old gradual push (a standing start with the instant one is too much)
  },

  // The six drivers. Colours: [body, accent, driver suit]. The player picks one on the title screen (Driver);
  // the other five race as AI with their personality from ai.styles (Nova has the defaults).
  // look = the driver's own identity, whatever paint the kart has: helmet + visor colours (also on the 3D
  // helmet), and a helmet mark for the 2D avatar (stripe / twin / moon / bolt / fin / dots). Meant to carry
  // over to the planned 3D characters. tag = a character line for the picker: flavour only, never a gameplay
  // claim (the player's pick is looks only; the personality goes to the AI that replaces them, see castDrivers).
  // The personalities live in ai.styles.
  racers: [
    { name: 'Nova', colors: [0xe8322f, 0xffd23a, 0x2f6bff], tag: 'The rookie',
      look: { helmet: 0xf2f2f2, visor: 0x2f6bff, mark: 'stripe', markColor: 0xe8322f } },
    { name: 'Rex', colors: [0x2f6bff, 0xffffff, 0xffd23a], tag: 'The veteran',
      look: { helmet: 0x1e2a5a, visor: 0xffc21a, mark: 'twin', markColor: 0xffffff } },
    { name: 'Luna', colors: [0x9b4dff, 0x5cc8ff, 0xffffff], tag: 'Night-sky racer',
      look: { helmet: 0xe9e4ff, visor: 0x5cc8ff, mark: 'moon', markColor: 0x9b4dff } },
    { name: 'Bolt', colors: [0xffd23a, 0x222222, 0xe8322f], tag: 'Born at full throttle',
      look: { helmet: 0x26262c, visor: 0xff5a1f, mark: 'bolt', markColor: 0xffd23a } },
    { name: 'Mako', colors: [0x0d9488, 0xef4444, 0x1e293b], tag: 'The shark', // teal kart to match the shark (green until build 37)
      look: { helmet: 0x334155, visor: 0xef4444, mark: 'fin', markColor: 0xf2f2f2 } },
    { name: 'Pip', colors: [0xff5fb0, 0xffffff, 0x9b4dff], tag: 'Smallest kart in the paddock',
      look: { helmet: 0xffb3d9, visor: 0x9b4dff, mark: 'dots', markColor: 0xffffff } },
    { name: 'Koda', colors: [0xc2410c, 0xfef3c7, 0x6f8f3a], tag: 'The red panda', // build 37: the 7th driver
      look: { helmet: 0xc2410c, visor: 0x1c1917, mark: 'dots', markColor: 0xfef3c7 } },
    { name: 'Hex', colors: [0x3b1f8a, 0xffb21e, 0x2e1f6b], tag: 'Nobody knows what is under the hood', // build 37: the 8th driver
      look: { helmet: 0x2e1f6b, visor: 0xffb21e, mark: 'dots', markColor: 0xffb21e } },
  ],
  // Kart paint for the player (Kart picker): [body, accent]; null = the driver's own colours. Looks only.
  paints: [
    { name: 'Team', colors: null },
    { name: 'Midnight', colors: [0x1d2340, 0x5cc8ff] },
    { name: 'Lime', colors: [0x8cdc2a, 0x1d1d1d] },
    { name: 'Sunset', colors: [0xff7a1f, 0x9b4dff] },
    { name: 'Chrome', colors: [0xc9ced8, 0xe8322f] },
    { name: 'Mint', colors: [0x3fe0c5, 0xffffff] },
    { name: 'Cherry', colors: [0xb0102a, 0xf2f2f2] },
    { name: 'Coal', colors: [0x2a2b33, 0xffa21f] },
  ],

  grid: {
    karts: 6,               // per race: the player + 5 AIs (the roster is bigger: one rival sits each race out)
    firstRow: 8,            // metres behind the start line
    rowGap: 6,
    colOffset: 4,           // lateral offset of the two columns
  },

  ai: {
    skill: [0.97, 1.05],    // fraction of top speed each AI aims for (rolled per race). Was 0.88-0.98 with a
                            // rubber band; with it gone (build 29) the user's clean laps were ~10% quicker
                            // than the AIs' (meadow 29.5-30 s vs 32.3-35), and the player gets boosts on top
    easeFrom: 30, easeFull: 150, // rubber band range; strength per difficulty (DIFF)
    cornerGrip: [20, 25],   // lateral accel (m/s^2) each AI dares in corners (rolled per race; kart limit ~22 at speed)
    laneRange: 2.5,         // how far an AI wanders either side of its own line (m)
    lineUse: [0.15, 0.85],  // how much of the racing line each AI takes (rolled per race; 0 = centre line)
    bias: 4,                // +- m: each AI's preferred side of the road, re-rolled every lap (Mario Kart
                            // chaos instead of an F1 train on one line)
    coast: 4,               // rolling resistance when an AI lifts (the player's coastBrake 12 is ~18 m/s^2:
                            // every small lift looked like slamming the brakes)
    brakeOver: 2.5,         // brake only when this many m/s over the corner speed it wants
    lineMargin: 2.2,        // racing line stays this far inside the road edge (m)
    lookAhead: [8, 15],     // pure-pursuit look-ahead (m), at standstill -> top speed
    steerGain: 2.2,
    mistakeEvery: [6, 15],  // seconds between mistakes (wobble or lift)
    finishedPace: 0.7,      // lap-of-honour speed after crossing the line
    startDelay: [0.05, 0.4],// reaction time at GO (s)
    // racecraft, 0..1: overtake = goes for the inside of the next corner and stays on the gas closer behind;
    // defend = moves across to block a faster kart closing from behind (on straights); aggression = shells
    // at any kart ahead (not only the player), bananas for anyone on its tail, crowds karts alongside.
    // hoard = keeps shield / banana / red until they're needed.
    overtake: 0.5, defend: 0.3, aggression: 0.3, hoard: false, wild: false,
    // Personalities, fixed per driver (user: wants the feeling "this guy is so annoying" / "this one is
    // really good"; each will get a matching look later). Anything left out comes from the defaults above.
    styles: {
      Nova: { role: 'all-rounder' },
      Rex: { role: 'ace', skill: [1.04, 1.08], cornerGrip: [23.5, 25], lineUse: [0.85, 1], bias: 1, laneRange: 1,
        mistakeEvery: [20, 35], startDelay: [0.05, 0.15], overtake: 1, defend: 0.5, aggression: 0.4 },
      Luna: { role: 'defender', skill: [1.02, 1.06], cornerGrip: [23, 24.5], lineUse: [0.75, 0.95], bias: 1.5,
        laneRange: 1.2, mistakeEvery: [18, 30], startDelay: [0.05, 0.2], overtake: 0.7, defend: 1, aggression: 0.2, hoard: true },
      // itemOdds: x the per-place odds, in ITEM_TYPES order (mush ban gre red shld star trip blue bullet bomb):
      // always armed, rarely a shield or a speed item. trap: lays bananas on the racing line at corner entries
      // (user picked these over red shells that hunt the player: "too much")
      Mako: { role: 'bully', skill: [0.98, 1.02], cornerGrip: [21.5, 23.5], lineUse: [0.4, 0.7], bias: 3,
        overtake: 0.8, defend: 0.3, aggression: 1, trap: true,
        itemOdds: [0.4, 2, 1.8, 1.6, 0.3, 0.5, 0.4, 1.3, 0.5, 1.6] },
      Pip: { role: 'steady', skill: [0.95, 0.99], cornerGrip: [21, 23], lineUse: [0.5, 0.7], bias: 2, laneRange: 1.5,
        mistakeEvery: [25, 40], overtake: 0.3, defend: 0.8, aggression: 0, hoard: true },
      // fast, brakes late (brakeOver), wide random lines, wobbles a lot
      Bolt: { role: 'wild', skill: [1.03, 1.08], cornerGrip: [22, 25], lineUse: [0, 1], bias: 5, laneRange: 4,
        brakeOver: 6, mistakeEvery: [3, 7], startDelay: [0, 0.6], overtake: 1, defend: 0, aggression: 0.6, wild: true },
      // build 37: drifts every real corner (holds the wheel past the drift threshold where the corner ahead is
      // tighter than driftRadius m), so he slides and fires mini-turbos on the exits; tidy line, few mistakes
      Koda: { role: 'drifter', skill: [1, 1.04], cornerGrip: [22.5, 24.5], lineUse: [0.7, 0.95], bias: 2, laneRange: 1.5,
        mistakeEvery: [12, 22], overtake: 0.8, defend: 0.3, aggression: 0.3, drift: true, driftRadius: 100, driftLock: 0.95 },
      // build 37: tucks into the wake of the kart ahead (a tow: +tow of his pace while he's in it, more when it's
      // the leader), sits there for slingAt s, then pulls out and slingshots past. Mid pace on his own.
      Hex: { role: 'trickster', skill: [0.98, 1.02], cornerGrip: [22, 24], lineUse: [0.5, 0.85], bias: 2, laneRange: 1.5,
        mistakeEvery: [10, 20], overtake: 0.9, defend: 0.2, aggression: 0.3,
        slip: true, tow: 0.06, towLeader: 0.1, towRange: [3, 18], slingAt: [0.8, 1.8] },
    },
  },

  items: {
    // rows of boxes and boost pads are per track (CFG.tracks)
    boxLanes: [-6, -2, 2, 6],         // lateral offsets of the boxes in a row (m)
    boxRespawn: 2,                    // seconds until a taken box comes back (3 until build 36: back-markers found empty rows)
    pickupRadius: 1.8,
    padLength: 4, padWidth: 3.2,
    rollTime: 0.9,                    // item roulette before an item can be used
    spinTime: 1.1,                    // spin-out after a banana / shell hit
    // Star / bullet hit: the victim is flung sideways to the nearest wall at `speed` m/s (so a kart near the wall gets a gentle
    // shove, one mid-road a hard one), crashes into it for `crash` s, then recovers. Hit time = flight + crash. Scripted, not physics.
    launch: { star: { speed: 26, crash: 0.5, hop: 1 }, bullet: { speed: 38, crash: 0.8, hop: 1.4, splat: 0.9, minDist: 4, splatLat: 2.5 } }, // bullet from straight behind or next to a wall: steamrolled flat for `splat` s
    // Build 64.20 hit motions (scripted like the launches; `time` = how long the kart is out, rarer / nastier items = longer).
    // shove (shells): thrown along the shell's travel (from behind = forward, head-on = back) at `speed` m/s fading out, tumbling `flips` times,
    // `hop` m high, then bouncing. slide (banana): keeps its momentum and slides `lat` m/s sideways while spinning `turns` times, speed fades by `decay`.
    // blast (blue shell, bomb): straight up `up` m in a slow tumble, heavy drop + dust ring; others in the blast get `scale` x the lift and are pushed
    // outward at `push` m/s. The bomb also sets karts on fire for `burn` s.
    hit: {
      banana: { mode: 'slide', time: 1.5, lat: 3.5, decay: 0.45, turns: 3 },
      green: { mode: 'shove', time: 1.7, speed: 34, hop: 3.6, flips: 3 }, // ~23 m thrown (distance = speed x time / 2.5)
      red: { mode: 'shove', time: 2.1, speed: 42, hop: 5, flips: 4 },     // ~35 m
      blue: { mode: 'blast', time: 2.4, up: 7, push: 12, scale: 0.55 },
      bomb: { mode: 'blast', time: 3.2, up: 5.5, push: 14, scale: 0.5, burn: 3.5, eject: { up: 10, side: 5, spin: 9 } }, // eject: the driver leaves the kart (apex m, sideways m/s, spin rad/s)
    },
    bombBlast: 4.5,                   // bomb: karts this close (m) to where it went off are caught in it
    mushroomBoost: 1.3,               // x the mini-turbo duration
    shellSpeed: 38, shellLife: 6, shellBounces: 2, // green shells vanish on their 2nd wall hit
    redSpeed: 40, redLife: 12, redHomeDist: 14,
    aiTargetPlayer: 140,              // AI red shells lock onto the player when they're up to this far ahead (m)
    // Drawn size per kind. Build 34 (user: "way too small on a mobile screen") went to 2x; with the smaller
    // drawn kart that was "too big and low definition" (build 35): now ~1.4x and smooth, higher-res models
    modelScale: { green: 1.4, red: 1.4, banana: 1.3, bomb: 1.35, blue: 1.25, mushroom: 1.15 },
    hitRadius: 1.5, bananaRadius: 1.3, // were 1.4 / 1.2 before build 34, 1.7 / 1.5 in build 34
    shieldTime: 10,                   // bubble that blocks the next hit (any kind), gone after this anyway
    // invincible + faster; karts touched spin out. User (build 33 races): the star "should give more speed": at
    // +4 m/s with engine power only it held ~108 km/h and gained ~20 m over 6 s. Now pushed like a mushroom.
    starTime: 6, starSpeed: 8, starAccel: 150, // + m/s on top speed (~122 km/h), push m/s^2 up to it (high = at once)
    bulletHalfW: 2.2, bulletRear: 3.0, bulletFront: 3.4, // bullet hit zone (m): the hull's width / length plus the other kart's half size, in the bullet kart's frame
    bumpRadius: 2.3,                  // star / bullet kart this close to another one = hit
    tripleGap: 0.25,                  // triple mushroom: min seconds between two boosts
    blueSpeed: 55, blueLife: 30,      // blue shell: along the track to the leader, explodes
    blueHome: 22, blueBlast: 5, blueSpin: 1.9, blueHeight: 1.8,
    bulletTime: 4, bulletSpeed: 38,   // CPU drives at this speed (m/s; top is 26) on rails along the track
    // Item odds by race position (index = place - 1), in ITEM_TYPES order:
    //          mush ban gre red shld star trip blue bullet
    odds: [
      /* 1st */ [5, 40, 30, 0, 25, 0, 0, 0, 0, 0],
      /* 2nd */ [10, 25, 25, 15, 18, 0, 7, 0, 0, 3],
      /* 3rd */ [12, 12, 18, 25, 10, 5, 10, 8, 0, 6],
      /* 4th */ [12, 6, 12, 25, 6, 10, 14, 10, 5, 7],
      /* 5th */ [15, 0, 8, 22, 0, 15, 17, 11, 12, 8], // no shields at the back (build 36): useless there
      /* 6th */ [11, 0, 5, 20, 0, 18, 17, 11, 18, 8],
    ],
  },

  controls: {
    stickDeadZone: 0.12,    // joystick (Settings): this share of the knob's travel either side does nothing...
    stickFull: 0.85,        // ...and full lock is reached here (share of the base's radius)
  },

  camera: {
    // build 33 (user: the camera "pulls way too far back at top speed" to see the driver): 35% closer, and
    // the kart keeps about the same size on screen at any speed (was 7 m + 1.5 m at speed + ~4.5 m of lag)
    distance: 4.6,
    height: 3.5,       // build 34 (user: Nova's ears hid the karts ahead): +35% (was 2.6), looks over the ears
    posLag: 6,
    maxLag: 0.5,       // the trailing position lag can't drift more than this (m) from the ideal spot
    speedPull: 0.3,    // extra distance at top speed (m)
    yawLag: 4,
    lookAhead: 8,      // look-at point down the road: the view centre sits ~16 deg down, so the ear tips (ray
    lookHeight: -0.1,  // ~19 deg down) stay just below it and the road ahead is clear. Lower aims hid the
                       // ears' view line above the centre; higher ones put the kart behind the km/h readout
    fov: 66, fovSpeed: 3, fovBoost: 7, fovMax: 10, // FOV kick: boost gives +7 (was +2) so pads/cannon feel fast; max +10
  },
};

const LOCAL_FWD = new CANNON.Vec3(0, 0, 1);
const LOCAL_UP = new CANNON.Vec3(0, 1, 0);
const AXIS_Y = new CANNON.Vec3(0, 1, 0);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const $ = (id) => document.getElementById(id);

/* ==========================================================================
 * 1. INITIALIZATION
 * ========================================================================== */

// ---------- 1a. Renderer, scene, camera, lights ----------
const app = $('app');
// Debug tools (the DEBUG panel, the Test Lab track): on everywhere for now, the hosted copy too, so testers can use them.
// Set to `location.protocol === 'http:'` to keep them to the LAN server. Races played with them on skip the race log.
const DEBUG = true;
const VERSION_N = '67'; // the build shown on the title screen + in the race log: main number = sw.js VERSION, then +.1 for every change Claude makes (so the user can confirm the latest is running)
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;


// Speed blur (boost / cannon / star): the scene is drawn to a texture, then smeared outward from the screen
// centre, stronger toward the edges, with a touch of colour fringing. Only used while the effect is on, so
// normal racing is drawn straight to the screen as before.
const blurTarget = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
const blurPass = {
  cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
  scene: new THREE.Scene(),
  mat: new THREE.ShaderMaterial({
    uniforms: { tex: { value: blurTarget.texture }, strength: { value: 0 }, aspect: { value: 1.7 } },
    depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tex; uniform float strength; uniform float aspect; varying vec2 vUv;
      void main() {
        vec2 c = vec2(0.5, 0.52);
        vec2 off = vUv - c;
        float d = length(off * vec2(aspect, 1.0));
        float edge = smoothstep(0.18, 0.95, d);
        vec2 dir = -off * edge * strength * 0.16;
        vec3 sum = vec3(0.0);
        float wsum = 0.0;
        for (int i = 0; i < 10; i++) {
          float t = float(i) / 9.0, w = 1.0 - t * 0.55;
          vec2 p = vUv + dir * t;
          vec3 s = vec3(texture2D(tex, p + dir * 0.06 * t).r, texture2D(tex, p).g, texture2D(tex, p - dir * 0.06 * t).b);
          sum += s * w; wsum += w;
        }
        vec3 col = sum / wsum;
        col += vec3(0.05, 0.08, 0.14) * edge * strength; // a cool lift at the rim
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  }),
};
blurPass.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurPass.mat));
blurPass.scene.children[0].frustumCulled = false;
function sizeBlurTarget() {
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  blurTarget.setSize(s.x, s.y);
  blurPass.mat.uniforms.aspect.value = s.x / s.y;
}
sizeBlurTarget();

// Rear-view mirror (build 64.18): a second camera looks back from behind the kart into a small target, drawn flipped
// (like a real mirror) in a scissored box under the TIME/BEST pills; #mirror-frame in the HUD is its border.
const mirror = {
  target: new THREE.WebGLRenderTarget(320, 112, { type: THREE.HalfFloatType }),
  cam: new THREE.PerspectiveCamera(62, 320 / 112, 0.5, 600),
  scene: new THREE.Scene(), rect: { x: 0, y: 0, w: 0, h: 0 }, look: new THREE.Vector3(),
};
mirror.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: { tex: { value: mirror.target.texture } }, depthTest: false, depthWrite: false,
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: 'uniform sampler2D tex; varying vec2 vUv; void main() {\n gl_FragColor = vec4(texture2D(tex, vec2(1.0 - vUv.x, vUv.y)).rgb, 1.0);\n #include <colorspace_fragment>\n}',
})));
mirror.scene.children[0].frustumCulled = false;
function layoutMirror(w) {
  const mw = Math.round(clamp(w * 0.2, 150, 230)), mh = Math.round(mw * 112 / 320);
  mirror.rect = { x: Math.round((w - mw) / 2), y: 10, w: mw, h: mh }; // y = px from the top
  const vert = app.classList.contains('vertical'), top = document.getElementById('hud-top');
  const rowY = Math.round(app.clientHeight * 0.085); // vertical view (64.28): TIME / BEST at this height, the mirror right under them
  if (vert) { // narrow: the mirror sits between the minimap and the buttons, TIME / BEST go in a row under it
    mirror.rect.w = Math.round(clamp(w * 0.36, 110, 150)); mirror.rect.h = Math.round(mirror.rect.w * 112 / 320);
    mirror.rect.x = Math.round((w - mirror.rect.w) / 2);
    app.style.setProperty('--row-y', `${rowY}px`); top.style.gap = ''; top.style.top = ''; mirror.rect.y = rowY + (top.offsetHeight || 40) + 8; app.style.setProperty('--mirror-y', `${mirror.rect.y}px`);
  } else { top.style.gap = `${mw + 16}px`; top.style.top = ''; } // TIME and BEST sit either side of the mirror
  app.style.setProperty('--warn-y', `${mirror.rect.y + mirror.rect.h + 8}px`); // the red incoming-shell warning sits right under the mirror
  const f = document.getElementById('mirror-frame');
  if (f) Object.assign(f.style, { left: `${mirror.rect.x}px`, top: `${mirror.rect.y}px`, width: `${mirror.rect.w}px`, height: `${mirror.rect.h}px` });
}
function renderMirror(bp, yaw) {
  const fx_ = Math.sin(yaw), fz_ = Math.cos(yaw);
  mirror.cam.position.set(bp.x - fx_ * 1.6, bp.y + 1.1, bp.z - fz_ * 1.6);
  mirror.cam.lookAt(mirror.look.set(bp.x - fx_ * 20, bp.y + 1.0, bp.z - fz_ * 20));
  renderer.setRenderTarget(mirror.target);
  renderer.render(scene, mirror.cam);
  renderer.setRenderTarget(null);
  const r = mirror.rect, sz = renderer.getSize(new THREE.Vector2()), H = sz.y;
  renderer.autoClear = false;
  renderer.setScissorTest(true);
  renderer.setViewport(r.x, H - r.y - r.h, r.w, r.h);
  renderer.setScissor(r.x, H - r.y - r.h, r.w, r.h);
  renderer.clearDepth();
  renderer.render(mirror.scene, blurPass.cam);
  renderer.setScissorTest(false);
  renderer.autoClear = true;
  renderer.setViewport(0, 0, sz.x, H);
}
renderer.info.autoReset = false; // the telemetry's draw-call counts cover both passes; reset once per frame in render()

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd8ff);
scene.fog = new THREE.Fog(0x8fd8ff, 90, 330);

// near 0.5 (was 0.1): the camera never gets that close to anything, and depth precision is ~5x better,
// which the flat road markings layered a few cm apart need to not shimmer far down the track
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.5, 600);

// Sky, fog and light colours come from the track's theme (applyTheme)
const hemi = new THREE.HemisphereLight(0xffffff, 0x5c9a3c, 1.3);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
const SUN_OFFSET = new THREE.Vector3(40, 80, 30);
// The shadow camera's orientation (it looks along -SUN_OFFSET), for snapping it to texels in updateCamera
const lightQ = new THREE.Quaternion(), lightQInv = new THREE.Quaternion();
const shadowSnap = new THREE.Vector3();

function applyTheme(th) {
  scene.background = new THREE.Color(th.sky);
  scene.fog = new THREE.Fog(th.fog[0], th.fog[1], th.fog[2]);
  hemi.color.set(th.hemi[0]);
  hemi.groundColor.set(th.hemi[1]);
  hemi.intensity = th.hemi[2];
  sun.color.set(th.sun[0]);
  sun.intensity = th.sun[1];
  SUN_OFFSET.set(...th.sunOffset);
  lightQ.setFromRotationMatrix(new THREE.Matrix4().lookAt(SUN_OFFSET, new THREE.Vector3(), new THREE.Vector3(0, 1, 0)));
  lightQInv.copy(lightQ).invert();
}

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

// ---------- 1b. Physics world ----------
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, CFG.gravity, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = false;
world.defaultContactMaterial.friction = 0.2;
const KART_GROUP = 2; // karts' collision group (a respawned ghost drops it from its mask: setGhost)

const physMats = {
  ground: new CANNON.Material('ground'),
  wall: new CANNON.Material('wall'),
  chassis: new CANNON.Material('chassis'),
};
world.addContactMaterial(new CANNON.ContactMaterial(physMats.chassis, physMats.wall, { friction: 0.0, restitution: 0.02 }));
world.addContactMaterial(new CANNON.ContactMaterial(physMats.chassis, physMats.ground, { friction: 0.2, restitution: 0 }));
world.addContactMaterial(new CANNON.ContactMaterial(physMats.chassis, physMats.chassis, { friction: 0.05, restitution: 0.25 }));

// ---------- 1c. Track (rebuilt by loadTrack when another one is picked) ----------
let track = null;                    // the current layout (see buildTrack)
let itemVis = null;                  // its item boxes, pads and item models (see buildItemVisuals)
let theme = null;                    // its theme's animated scenery: { update(dt) }
const trackRoot = new THREE.Group(); // every mesh that belongs to the current track
scene.add(trackRoot);
let trackBodies = [];                // ...and every static physics body

function addStatic(body) {
  body.updateAABB(); // static bodies never refresh their AABB on their own (gotcha 1)
  world.addBody(body);
  trackBodies.push(body);
  return body;
}

/**
 * Groups static boxes into bodies of up to `per` shapes, in the order they're added (consecutive pieces
 * of road or rail, so each body stays compact). The broadphase compares every body with its neighbours on
 * every step: ~1200 one-box bodies made the canyon's physics step 5x slower than the meadow's.
 */
function staticChunks(material, per = 16) {
  let body = null;
  const flush = () => { if (body) addStatic(body); body = null; };
  return {
    add(shape, pos, quat) {
      if (!body) {
        body = new CANNON.Body({ mass: 0, material });
        body.position.set(pos.x, pos.y, pos.z);
      }
      body.addShape(shape, new CANNON.Vec3(pos.x - body.position.x, pos.y - body.position.y, pos.z - body.position.z),
        new CANNON.Quaternion(quat.x, quat.y, quat.z, quat.w));
      if (body.shapes.length === per) flush();
    },
    done: flush,
  };
}

/** Tears down the current track and builds track `id`: layout, physics, theme, items, minimap. */
function loadTrack(id) {
  if (itemVis) {
    clearItems();
    for (const m of Object.values(itemVis.models)) { m.geo.dispose(); m.outline.dispose(); m.mat.dispose(); }
  }
  trackRoot.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [o.material].flat()) { m?.map?.dispose(); m?.dispose(); }
  });
  trackRoot.clear();
  for (const b of trackBodies) world.removeBody(b);
  trackBodies = [];
  const def = CFG.tracks[id];
  const th = THEMES[def.theme];
  applyTheme(th);
  track = buildTrack(def, th);
  Object.assign(track, { id, def });
  theme = th.build(track);
  itemVis = buildItemVisuals();
  minimap.layout();
}

function buildTrack(def, th) {
  const T = CFG.track;
  const curve = new THREE.CatmullRomCurve3(
    def.points.map(([x, z, y = 0]) => new THREE.Vector3(x, y, z)), true, 'centripetal');
  const N = Math.round(curve.getLength() / T.spacing);

  const samples = curve.getSpacedPoints(N); // N + 1 points, last == first; y = road height
  const tangents = [];
  const normals = [];
  for (let i = 0; i <= N; i++) {
    const t = curve.getTangentAt((i % N) / N);
    t.y = 0;
    t.normalize();
    tangents.push(t);
    normals.push(new THREE.Vector3(t.z, 0, -t.x)); // horizontal, points to the kart's left
  }
  const spacing = curve.getLength() / N; // metres between samples

  // Approximate corner radius at each sample (heading change over a short arc), for AI braking
  const radius = [];
  const K = 6;
  for (let i = 0; i < N; i++) {
    const a = tangents[(i - K / 2 + N) % N], b = tangents[(i + K / 2) % N];
    const ang = Math.acos(clamp(a.dot(b), -1, 1));
    radius.push(ang > 1e-4 ? (K * spacing) / ang : Infinity);
  }
  const { wL, wR } = roadWidths(def, curve, tangents, normals, N, spacing);
  const { bank, wallH, ramp } = shapeTrack(def, samples, tangents, normals, N, spacing);
  const line = racingLine(samples, normals, N, wL, wR);
  // Corner radius along the racing line too: an AI on it takes corners much wider than the centre line
  const lineRadius = [];
  const lp = samples.slice(0, N).map((p, i) => [p.x + normals[i].x * line[i], p.z + normals[i].z * line[i]]);
  for (let i = 0; i < N; i++) {
    const [ax, az] = lp[(i - K + N) % N], [bx, bz] = lp[i], [cx, cz] = lp[(i + K) % N];
    const h1 = Math.atan2(bx - ax, bz - az), h2 = Math.atan2(cx - bx, cz - bz);
    const ang = Math.abs(wrapAngle(h2 - h1));
    lineRadius.push(ang > 1e-4 ? Math.hypot(cx - ax, cz - az) / ang : Infinity); // arc / turn
  }
  const hilly = samples.some((p) => Math.abs(p.y) > 1e-3) || bank.some((b) => b !== 0);
  // Ice: 0..1 per sample, ramping in and out over ~8 m
  const ice = new Float32Array(N + 1);
  const edge = Math.max(1, Math.round(8 / spacing));
  for (const [from, to] of def.ice || []) {
    for (let i = from - edge; i <= to + edge; i++) {
      const v = Math.min(1, (i - from + edge) / edge, (to + edge - i) / edge);
      ice[(i + N) % N] = Math.max(ice[(i + N) % N], v);
    }
  }
  ice[N] = ice[0];
  const data = { N, samples, tangents, normals, spacing, radius, line, lineRadius, wL, wR, bank, wallH, hilly, ice };
  track = data; // the road helpers below (surfaceY, roadPoint...) read the global

  if (hilly) {
    buildRoadBodies(data);
    // a catch-all floor far below, in case a kart ever leaves the road (it is put back: updateKartProgress)
    const floor = new CANNON.Body({ mass: 0, material: physMats.ground, shape: new CANNON.Plane() });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    floor.position.y = Math.min(...samples.map((p) => p.y)) - 8;
    addStatic(floor);
  } else {
    const groundBody = new CANNON.Body({ mass: 0, material: physMats.ground, shape: new CANNON.Plane() });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    // Without updateAABB (in addStatic) the plane keeps the bounds of its un-rotated pose (z <= 0)
    // and the wheel raycasts miss the ground for z > 0.
    addStatic(groundBody);
  }

  // Road surface, centre dashes and curbs (left edge at +wL[i], right edge at -wR[i])
  const P = th.palette;
  trackRoot.add(makeRibbon(data, (i) => -wR[i], (i) => wL[i], 0.02,
    (i) => (ramp[i] ? [0xffd23a, 0x262222][((i / 2) | 0) % 2] : (P.ice && ice[i] > 0.5 ? P.ice : P.road)[((i / 10) | 0) % 2])));
  // Flat layers sit >= 2 cm apart (road 0.02, curbs 0.04, dashes 0.06, pads 0.08, start line 0.10)
  trackRoot.add(makeRibbon(data, -0.18, 0.18, 0.06, (i) => (i % 12 < 6 ? P.dash : null)));
  const curbColor = (i) => P.curb[((i / 3) | 0) % 2];
  trackRoot.add(makeRibbon(data, (i) => wL[i], (i) => wL[i] + T.curb, 0.04, curbColor));
  trackRoot.add(makeRibbon(data, (i) => -wR[i] - T.curb, (i) => -wR[i], 0.04, curbColor));

  buildWalls(data, P);
  buildStartLine(data, P);
  return data;
}

/**
 * Heights and banking on top of the control points' y (already in the samples): bumps (a cosine crest),
 * jump kickers (a ramp that steepens up to the lip, then a short step back down), banking per sample
 * (tan of the angle; + raises the left side) and rail heights (taller around jumps).
 */
function shapeTrack(def, samples, tangents, normals, N, spacing) {
  const T = CFG.track;
  const steps = (m) => Math.max(1, Math.round(m / spacing));
  const around = (idx, from, to, fn) => { for (let d = from; d <= to; d++) fn((idx + d + N) % N, d); };
  for (const [idx, len, h] of def.bumps || []) {
    const half = steps(len / 2);
    around(idx, -half, half, (i, d) => { samples[i].y += (h / 2) * (1 + Math.cos((Math.PI * d) / half)); });
  }
  const wallH = new Float32Array(N + 1).fill(T.wallHeight);
  const ramp = new Uint8Array(N + 1); // jump kickers, painted with hazard stripes
  for (const [idx, run, rise] of def.jumps || []) {
    const n = steps(run);
    around(idx, -n, 0, (i, d) => { samples[i].y += rise * ((d + n) / n) ** 2; ramp[i] = 1; });
    around(idx, 1, 2, (i, d) => { samples[i].y += rise * (1 - d / 3); });
    around(idx, -n - steps(10), steps(45), (i) => { wallH[i] = T.jumpWallHeight; });
  }
  const bank = new Float32Array(N + 1);
  for (const [idx, halfLen, deg] of def.banks || []) {
    const n = steps(halfLen);
    // raise the outside of the bend: a left-hander (the track bends toward the left normal) gets the right side up
    const a = normals[(idx - 4 + N) % N], b = tangents[(idx + 4) % N];
    const sign = b.x * a.x + b.z * a.z > 0 ? -1 : 1;
    around(idx, -n, n, (i, d) => {
      const f = Math.min(1, (1 - Math.abs(d) / n) / 0.4); // full bank in the middle, easing in over the ends
      bank[i] = Math.tan((sign * deg * (0.5 - 0.5 * Math.cos(Math.PI * f)) * Math.PI) / 180);
    });
  }
  samples[N].y = samples[0].y;
  bank[N] = bank[0];
  wallH[N] = wallH[0];
  return { bank, wallH, ramp };
}

/** Road surface height at sample i, `lat` metres left of the centre line (banking tilts it). */
function surfaceY(i, lat = 0) { return track.samples[i].y + lat * track.bank[i]; }

/** World point on the road at sample i, `lat` m left of the centre line, `up` m above the surface. */
function roadPoint(i, lat, up = 0, out = new THREE.Vector3()) {
  const s = track.samples[i], n = track.normals[i];
  return out.set(s.x + n.x * lat, surfaceY(i, lat) + up, s.z + n.z * lat);
}

/** Lateral offset (+ = left) of a world point from the centre line at sample i. */
function lateral(i, p) {
  const s = track.samples[i], n = track.normals[i];
  return (p.x - s.x) * n.x + (p.z - s.z) * n.z;
}

/** The road's frame at sample i as a rotation matrix: x = left (across the banking), y = up, z = forward (up the slope). */
const _bf = new THREE.Vector3(), _bl = new THREE.Vector3(), _bu = new THREE.Vector3();
function roadBasis(i, m = new THREE.Matrix4()) {
  const { samples, tangents, normals, N, spacing, bank } = track;
  const slope = (samples[(i + 1) % N].y - samples[(i - 1 + N) % N].y) / (2 * spacing);
  _bf.set(tangents[i].x, slope, tangents[i].z).normalize();
  _bl.set(normals[i].x, bank[i], normals[i].z).normalize();
  _bu.crossVectors(_bf, _bl).normalize();
  _bl.crossVectors(_bu, _bf);
  return m.makeBasis(_bl, _bu, _bf);
}

/**
 * Road with heights, in two layers:
 * - the surface the wheels ride on: a triangle mesh, one row per sample, exact through slopes, crests and
 *   banking (the wheels are raycasts, and cannon-es raycasts trimeshes fine);
 * - under it, a safety net for the chassis: one thin box per `roadStride` samples, `netDepth` below the
 *   surface (cannon-es has no box-vs-trimesh collision, so a hard landing would drop the chassis straight
 *   through the mesh). Flat boxes can't follow banking that eases in and out: neighbours met with a ~20 cm
 *   step at the road edges, which beached karts when the boxes were the driving surface.
 */
function buildRoadBodies({ N, samples, normals, wL, wR, bank }) {
  const T = CFG.track, k = T.roadStride, thick = 1;
  const edgeL = (i) => wL[i] + T.curb + T.wallThickness, edgeR = (i) => -(wR[i] + T.curb + T.wallThickness);
  const ROWS = 40; // samples per trimesh body
  for (let i0 = 0; i0 < N; i0 += ROWS) {
    const i1 = Math.min(i0 + ROWS, N), o = samples[i0];
    const verts = [], tris = [];
    for (let i = i0; i <= i1; i++) {
      for (const lat of [edgeR(i), edgeL(i)]) {
        const p = roadPoint(i, lat);
        verts.push(p.x - o.x, p.y - o.y, p.z - o.z);
      }
      if (i > i0) {
        const a = (i - i0 - 1) * 2, b = a + 2; // a: right, a+1: left on the previous row
        tris.push(a, b, a + 1, a + 1, b, b + 1); // (b - a) x (c - a) points up: ray tests skip backfaces
      }
    }
    const body = new CANNON.Body({ mass: 0, material: physMats.ground, shape: new CANNON.Trimesh(verts, tris) });
    body.position.set(o.x, o.y, o.z);
    addStatic(body);
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), f = new THREE.Vector3(), l = new THREE.Vector3(), u = new THREE.Vector3();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const chunks = staticChunks(physMats.ground);
  for (let i = 0; i < N; i += k) {
    const j = Math.min(i + k, N);
    a.copy(samples[i]);
    b.copy(samples[j]);
    f.subVectors(b, a);
    const len = f.length();
    f.normalize();
    l.set(normals[i].x + normals[j].x, bank[i] + bank[j], normals[i].z + normals[j].z).normalize();
    u.crossVectors(f, l).normalize();
    l.crossVectors(u, f);
    const left = Math.max(wL[i], wL[j]) + T.curb + T.wallThickness, right = Math.max(wR[i], wR[j]) + T.curb + T.wallThickness;
    // centre: middle of the segment, shifted across to the middle of the (asymmetric) width, half a box down
    a.add(b).multiplyScalar(0.5).addScaledVector(l, (left - right) / 2).addScaledVector(u, -thick / 2 - T.netDepth);
    q.setFromRotationMatrix(m.makeBasis(l, u, f));
    chunks.add(new CANNON.Box(new CANNON.Vec3((left + right) / 2, thick / 2, len / 2 + 0.05)), a, q);
  }
  chunks.done();
}

/**
 * Road half-width on each side of the centre line, per sample (wL = left, the +normal side; wR = right).
 * Starts from halfWidth (or a control point's own width), then on the inside of a bend is capped so the
 * inner rail keeps at least innerWallRadius of curve: otherwise the offset points cross over and the rail
 * folds back into the road (why a 9 m hairpin was unplayable). The cap is spread over the neighbouring
 * samples so the road narrows and widens smoothly.
 */
function roadWidths(def, curve, tangents, normals, N, spacing) {
  const T = CFG.track;
  // width from the control points (4th value), interpolated along the loop by the curve parameter
  const P = def.points.length;
  const base = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const u = (i / N) * P, a = Math.floor(u) % P, b = (a + 1) % P, f = u - Math.floor(u);
    base[i] = lerp(def.points[a][3] ?? T.halfWidth, def.points[b][3] ?? T.halfWidth, f);
  }
  const inner = (sign) => {
    const cap = new Float32Array(N);
    const H = 3; // heading change measured over 2H samples (as track.radius)
    for (let i = 0; i < N; i++) {
      const a = tangents[(i - H + N) % N], b = tangents[(i + H) % N], n = normals[(i - H + N) % N];
      const ang = Math.acos(clamp(a.dot(b), -1, 1));
      const turnsThisWay = (b.x * n.x + b.z * n.z) * sign > 0; // left turn: b leans toward the left normal
      const R = ang > 1e-4 ? (2 * H * spacing) / ang : Infinity;
      cap[i] = turnsThisWay ? R - T.curb - T.wallThickness - T.innerWallRadius : Infinity;
    }
    // spread: min over a window, then a moving average
    const W = 14, out = new Float32Array(N + 1);
    const m = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let v = Infinity;
      for (let d = -W; d <= W; d++) v = Math.min(v, cap[(i + d + N) % N]);
      m[i] = Math.max(T.minHalfWidth, Math.min(base[i], v));
    }
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let d = -W; d <= W; d++) sum += m[(i + d + N) % N];
      out[i] = Math.min(m[i], sum / (2 * W + 1)); // smooth, but never wider than the cap
    }
    out[N] = out[0];
    return out;
  };
  return { wL: inner(1), wR: inner(-1) };
}

/** Clamp a lateral offset at sample i to the road, `margin` metres inside each edge. */
function clampLane(i, x, margin = 1.5) {
  return clamp(x, -track.wR[i] + margin, track.wL[i] - margin);
}

/**
 * Racing line as a lateral offset per sample: the minimum-curvature path inside the road. Starting on the
 * centre line, repeatedly nudge each point against the path's 4th difference (smoothing out how sharply
 * it bends), clamped inside the road. Spreading each corner's turn over as long a path as possible gives
 * the classic line: wide on entry, the inside at the apex, wide on the exit. (Pulling the path tight
 * instead gives the shortest path, which just hugs the inside of the whole loop.)
 */
function racingLine(samples, normals, N, wL, wR) {
  const M = CFG.ai.lineMargin;
  const off = new Float32Array(N);
  const px = new Float32Array(N), pz = new Float32Array(N);
  // coarse stencil first (bends over ~30 m, converges fast), then a finer one to settle the details
  for (let it = 0; it < 3000; it++) {
    const h = it < 2000 ? 10 : 4;
    for (let i = 0; i < N; i++) {
      px[i] = samples[i].x + normals[i].x * off[i];
      pz[i] = samples[i].z + normals[i].z * off[i];
    }
    for (let i = 0; i < N; i++) {
      const i1 = (i - h + N) % N, i2 = (i - 2 * h + N) % N, j1 = (i + h) % N, j2 = (i + 2 * h) % N;
      const dx = px[i2] - 4 * px[i1] + 6 * px[i] - 4 * px[j1] + px[j2];
      const dz = pz[i2] - 4 * pz[i1] + 6 * pz[i] - 4 * pz[j1] + pz[j2];
      off[i] = clamp(off[i] - 0.1 * (dx * normals[i].x + dz * normals[i].z), -wR[i] + M, wL[i] - M);
    }
  }
  return off;
}

/** Builds a strip between two signed lateral offsets along the centre line, `y` above the road surface. */
function makeRibbon({ N, samples, normals, bank }, inner, outer, y, colorAt) {
  // inner / outer: a lateral offset, or a function of the sample index
  const lo = typeof inner === 'function' ? inner : () => inner;
  const hi = typeof outer === 'function' ? outer : () => outer;
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  const p = (i, off) => [samples[i].x + normals[i].x * off, samples[i].y + off * bank[i] + y, samples[i].z + normals[i].z * off];

  for (let i = 0; i < N; i++) {
    const color = colorAt(i);
    if (color === null) continue;
    const a0 = p(i, lo(i)), a1 = p(i, hi(i)), b0 = p(i + 1, lo(i + 1)), b1 = p(i + 1, hi(i + 1));
    pos.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
    c.set(color);
    for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Static box colliders along both track edges, drawn as one continuous striped strip. (Drawing each
 * segment as its own box needed overlaps to close gaps on curves, and the overlapping blue/white faces
 * z-fought: the rails flickered as the camera moved.) Rails follow the road's height and reach 0.5 m
 * below it, so no gap opens under them on slopes.
 */
function buildWalls({ N, samples, normals, wL, wR, wallH }, P) {
  const T = CFG.track;
  const th = T.wallThickness, k = T.wallStride, sink = 0.5;
  const pos = [], col = [];
  const c = new THREE.Color();
  const quad = (a, b, cc, d) => pos.push(...a, ...b, ...cc, ...cc, ...b, ...d);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), f = new THREE.Vector3(), l = new THREE.Vector3(), u = new THREE.Vector3();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const chunks = staticChunks(physMats.wall);

  for (const side of [1, -1]) {
    const w = side > 0 ? wL : wR;
    const off = (i) => w[i] + T.curb + th / 2; // wall centre line
    const base = (i) => surfaceY(i, off(i) * side);
    // corner points at sample i, `o` metres outward from the wall centre line (+- th/2), `y` above its base
    const edge = (i, o, y) => {
      const d = (off(i) + o) * side;
      return [samples[i].x + normals[i].x * d, base(i) + y, samples[i].z + normals[i].z * d];
    };
    for (let i = 0; i < N; i += k) {
      const j = Math.min(i + k, N);
      const inA = -th / 2, outA = th / 2, hi = wallH[i], hj = wallH[j];
      quad(edge(i, inA, -sink), edge(j, inA, -sink), edge(i, inA, hi), edge(j, inA, hj));     // road-side face
      quad(edge(i, outA, hi), edge(j, outA, hj), edge(i, outA, -sink), edge(j, outA, -sink)); // outside face
      quad(edge(i, inA, hi), edge(j, inA, hj), edge(i, outA, hi), edge(j, outA, hj));         // top
      c.set(P.rail[((i / k) | 0) % 2]);
      for (let v = 0; v < 18; v++) col.push(c.r, c.g, c.b);

      // collider: one box per segment (overlap is harmless for physics), from `sink` below to the top,
      // grouped into bodies of 16
      const h = Math.max(hi, hj);
      a.set(...edge(i, 0, 0));
      b.set(...edge(j, 0, 0));
      f.subVectors(b, a);
      const len = f.length() + th;
      f.normalize();
      l.set(0, 1, 0).cross(f).normalize(); // walls stand upright, even on banked road
      u.crossVectors(f, l);
      a.add(b).multiplyScalar(0.5).addScaledVector(u, (h - sink) / 2);
      q.setFromRotationMatrix(m.makeBasis(l, u, f));
      chunks.add(new CANNON.Box(new CANNON.Vec3(th / 2, (h + sink) / 2, len / 2)), a, q);
    }
    chunks.done(); // one side's rail never shares a body with the other's
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals(); // non-indexed: flat normal per face
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  trackRoot.add(mesh);
}

function buildStartLine({ samples, tangents, wL, wR }, P) {
  const T = CFG.track;
  const w = wL[0] + wR[0];

  // Checkered strip
  const c = document.createElement('canvas');
  c.width = 128; c.height = 16;
  const g = c.getContext('2d');
  for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) {
    g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
    g.fillRect(x * 8, y * 8, 8, 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;

  const geo = new THREE.PlaneGeometry(w, 2);
  geo.rotateX(-Math.PI / 2);
  const line = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
  line.position.copy(roadPoint(0, (wL[0] - wR[0]) / 2, 0.1));
  line.quaternion.setFromRotationMatrix(roadBasis(0));
  line.receiveShadow = true;
  trackRoot.add(line);

  // Arch: two posts + banner
  const yaw = Math.atan2(tangents[0].x, tangents[0].z);
  const arch = new THREE.Group();
  const postOff = Math.max(wL[0], wR[0]) + T.curb + T.wallThickness + 0.6;
  const postMat = lambert(P.arch[0]);
  for (const side of [1, -1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 0.8), postMat);
    post.position.set(side * postOff, 2.5, 0); // reaches 2 m below the road: fine on a bank or slope
    post.castShadow = true;
    arch.add(post);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(postOff * 2 + 0.8, 1.4, 0.5), lambert(P.arch[1]));
  banner.position.y = 7;
  banner.castShadow = true;
  arch.add(banner);

  // Arch local X is lateral: align its local Z with the tangent.
  arch.position.set(samples[0].x, samples[0].y, samples[0].z);
  arch.rotation.y = yaw;
  trackRoot.add(arch);
}

/** Deterministic RNG, so the scenery is the same every load. */
function seededRand(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 1c-2. Themes: road colours, sky + light, and the scenery around the track ----------
// build(track) adds the scenery to trackRoot and returns { update(dt) } for anything animated.
const THEMES = {
  meadow: {
    sky: 0x8fd8ff, fog: [0x8fd8ff, 90, 330], hemi: [0xffffff, 0x5c9a3c, 1.3], sun: [0xfff4e0, 2.2], sunOffset: [40, 80, 30],
    palette: {
      road: [0x5b5e66, 0x55585f], dash: 0xf2f2f2, curb: [0xe8322f, 0xffffff],
      rail: [0x2f6bff, 0xffffff], arch: [0xffd23a, 0xe8322f],
    },
    build: buildMeadow,
  },
  desert: {
    // golden afternoon: warm sun ~50 deg up from the west, blue sky, sandy haze at the horizon. Was a sunset
    // (sun 23 deg, orange light, near-black road): the user found it too dark and tiring on the eyes
    sky: 0x9cc8ea, fog: [0xf1d9bb, 90, 380], hemi: [0xfff2e0, 0xc89a72, 1.35], sun: [0xfff0d8, 2.4], sunOffset: [-80, 110, 45],
    palette: {
      road: [0x7a736c, 0x7f7871], dash: 0xfaf0d8, curb: [0xd9472b, 0xf3ead8],
      rail: [0xb98a5e, 0xf2e3c4], arch: [0x7a4a2a, 0xd9472b],
    },
    build: buildDesert,
  },
  snow: {
    // a clear winter day, kept soft: the snow is blue-white, not pure white, and the sun a bit lower in
    // power than the meadow's, so it doesn't glare (user: the dark canyon strained the eyes; bright snow can too)
    sky: 0x9ccaf0, fog: [0xdfe9f3, 110, 420], hemi: [0xf2f6ff, 0x9fb3c8, 1.25], sun: [0xfff6e8, 1.9], sunOffset: [60, 110, 40],
    palette: {
      road: [0x6b7179, 0x70767e], dash: 0xf6f8fb, curb: [0x2f6bff, 0xf3f6fa], ice: [0x9fd2ea, 0xa7d8ee],
      rail: [0xd23a3a, 0xf3f6fa], arch: [0x2f6bff, 0xd23a3a],
    },
    build: buildSnow,
  },
};

function buildMeadow({ N, samples }) {
  const rand = seededRand(1337);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), lambert(0x6cc04a));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  trackRoot.add(ground);

  const distToTrack = (x, z) => {
    let d = Infinity;
    for (let i = 0; i < N; i += 3) {
      const s = samples[i];
      d = Math.min(d, (s.x - x) ** 2 + (s.z - z) ** 2);
    }
    return Math.sqrt(d);
  };

  // Trees (instanced)
  const TREE_COUNT = 110;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.4, 1.6, 6), lambert(0x8a5a2b), TREE_COUNT);
  const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(1.8, 4, 7), lambert(0xffffff), TREE_COUNT);
  trunks.castShadow = leaves.castShadow = true;
  const greens = [0x2e9e44, 0x3fb950, 0x23863a, 0x58c46a];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const color = new THREE.Color();
  let placed = 0;
  for (let tries = 0; tries < 2000 && placed < TREE_COUNT; tries++) {
    const x = (rand() - 0.5) * 320;
    const z = (rand() - 0.5) * 320;
    if (distToTrack(x, z) < CFG.track.halfWidth + 7) continue;
    const sc = 0.8 + rand() * 0.9;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
    s.set(sc, sc, sc);
    m.compose(p.set(x, 0.8 * sc, z), q, s);
    trunks.setMatrixAt(placed, m);
    m.compose(p.set(x, (1.6 + 2) * sc, z), q, s);
    leaves.setMatrixAt(placed, m);
    leaves.setColorAt(placed, color.set(greens[(rand() * greens.length) | 0]));
    placed++;
  }
  trunks.count = leaves.count = placed;
  trackRoot.add(trunks, leaves);

  // Distant low-poly mountains
  const mountainColors = [0x7a8fb8, 0x8aa0c8, 0x6d82ad];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rand() * 0.2;
    const r = 240 + rand() * 40;
    const h = 40 + rand() * 50;
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(30 + rand() * 30, h, 5), lambert(mountainColors[i % 3]));
    mtn.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r);
    mtn.rotation.y = rand() * Math.PI;
    trackRoot.add(mtn);
  }

  // Clouds
  const cloudMat = lambert(0xffffff);
  const cloudGeo = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + ((rand() * 3) | 0);
    for (let j = 0; j < puffs; j++) {
      const puff = new THREE.Mesh(cloudGeo, cloudMat);
      puff.scale.setScalar(3 + rand() * 3);
      puff.position.set(j * 4 - puffs * 2, rand() * 2, rand() * 3);
      cloud.add(puff);
    }
    cloud.position.set((rand() - 0.5) * 400, 45 + rand() * 25, (rand() - 0.5) * 400);
    trackRoot.add(cloud);
  }
  return { update() {} };
}

/** Smooth 2D value noise in [0, 1] (deterministic). */
function makeNoise(rand) {
  const P = 256, grid = new Float32Array(P * P);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const at = (x, z) => grid[(((z % P) + P) % P) * P + (((x % P) + P) % P)];
  return (x, z) => {
    const x0 = Math.floor(x), z0 = Math.floor(z);
    let fx = x - x0, fz = z - z0;
    fx = fx * fx * (3 - 2 * fx);
    fz = fz * fz * (3 - 2 * fz);
    return lerp(lerp(at(x0, z0), at(x0 + 1, z0), fx), lerp(at(x0, z0 + 1), at(x0 + 1, z0 + 1), fx), fz);
  };
}
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * Ground as a height field around a track with heights (canyon, snow). Flat at road height beside the road,
 * then a rise (1.4 m) and a wall / hill of `shape(x, z)` = [height, where it starts, how wide its slope is,
 * rise] (metres beyond the flat floor). Each point takes the lowest of (nearby road height + rise with distance),
 * so where two parts of the track are close at different heights the ground follows the lower one.
 * `colorAt(x, z, h, slope, color)` paints it. Adds the mesh to trackRoot; returns the lookups the scenery uses.
 */
function makeTerrain(data, shape, colorAt) {
  const { N, samples, normals, wL, wR, bank } = data;
  const T = CFG.track;
  const flat = new Float32Array(N); // road + rails + 2.5 m of flat floor, from the centre line
  for (let i = 0; i < N; i++) flat[i] = Math.max(wL[i], wR[i]) + T.curb + T.wallThickness + 2.5;
  const CELL = 20, REACH = 70, R = Math.ceil(REACH / CELL);
  const buckets = new Map();
  const key = (cx, cz) => cx * 4096 + cz;
  for (let i = 0; i < N; i += 2) {
    const k = key(Math.floor(samples[i].x / CELL), Math.floor(samples[i].z / CELL));
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(i);
  }
  /** Calls fn(i, horizontal distance) for every 2nd sample within REACH of (x, z). */
  const nearby = (x, z, fn) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
      const list = buckets.get(key(cx + a, cz + b));
      if (!list) continue;
      for (const i of list) {
        const d = Math.hypot(x - samples[i].x, z - samples[i].z);
        if (d <= REACH) fn(i, d);
      }
    }
  };
  let maxY = -Infinity;
  for (const p of samples) maxY = Math.max(maxY, p.y);
  function heightAt(x, z) {
    const [cliff, start, width, rise = 1.4] = shape(x, z);
    let h = Infinity;
    nearby(x, z, (i, d) => {
      // the road's height across from here (banking tilts it), held level beyond the rails
      const lat = clamp((x - samples[i].x) * normals[i].x + (z - samples[i].z) * normals[i].z, -flat[i], flat[i]);
      const base = samples[i].y + lat * bank[i];
      if (base - 0.35 >= h) return;
      const u = d - flat[i];
      h = Math.min(h, base + (u <= 0 ? -0.35 : rise * smoothstep(0, 6, u) + cliff * smoothstep(start, start + width, u)));
    });
    return h === Infinity ? maxY + 1.4 + cliff : h;
  }
  /** Distance beyond the flat floor of the nearest road part, and that part's sample. */
  const floorDist = (x, z) => {
    let best = Infinity, idx = 0;
    nearby(x, z, (i, d) => { if (d - flat[i] < best) { best = d - flat[i]; idx = i; } });
    return { u: best, idx };
  };

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of samples) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const STEP = 3.5, M = 90;
  const x0 = minX - M, z0 = minZ - M;
  const nx = Math.ceil((maxX - minX + 2 * M) / STEP) + 1, nz = Math.ceil((maxZ - minZ + 2 * M) / STEP) + 1;
  const H = new Float32Array(nx * nz);
  for (let r = 0; r < nz; r++) for (let c = 0; c < nx; c++) H[r * nx + c] = heightAt(x0 + c * STEP, z0 + r * STEP);

  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
  const cc = new THREE.Color();
  for (let r = 0; r < nz; r++) for (let c = 0; c < nx; c++) {
    const v = r * nx + c, x = x0 + c * STEP, z = z0 + r * STEP, h = H[v];
    pos.set([x, h, z], v * 3);
    const gx = (H[r * nx + Math.min(c + 1, nx - 1)] - H[r * nx + Math.max(c - 1, 0)]) / (2 * STEP);
    const gz = (H[Math.min(r + 1, nz - 1) * nx + c] - H[Math.max(r - 1, 0) * nx + c]) / (2 * STEP);
    colorAt(x, z, h, Math.hypot(gx, gz), cc);
    col.set([cc.r, cc.g, cc.b], v * 3);
  }
  const idx = [];
  for (let r = 0; r < nz - 1; r++) for (let c = 0; c < nx - 1; c++) {
    const a = r * nx + c, b = a + 1, d = a + nx, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tgeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tgeo.setIndex(idx);
  tgeo.computeVertexNormals();
  const terrain = new THREE.Mesh(tgeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  terrain.receiveShadow = true;
  trackRoot.add(terrain);
  return { heightAt, floorDist, nearby, maxY, minX, maxX, minZ, maxZ };
}

/**
 * Sky for a theme with a height-field ground: a gradient dome (horizon -> mid -> top) that follows the
 * camera, plus the sun disc and a soft glow in the sun's direction. Call update() every frame.
 */
function makeSky(horizon, mid, top, glow) {
  const skyGeo = new THREE.SphereGeometry(450, 32, 16);
  const skyCol = [], cc = new THREE.Color();
  const HORIZON = new THREE.Color(horizon), MID = new THREE.Color(mid), TOP = new THREE.Color(top);
  for (let i = 0; i < skyGeo.attributes.position.count; i++) {
    const t = Math.max(0, skyGeo.attributes.position.getY(i) / 450);
    cc.copy(HORIZON).lerp(MID, smoothstep(0.02, 0.25, t)).lerp(TOP, smoothstep(0.2, 0.75, t));
    skyCol.push(cc.r, cc.g, cc.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyCol, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  const sunDir = SUN_OFFSET.clone().normalize();
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(22, 24), new THREE.MeshBasicMaterial({ color: 0xfff1c4, fog: false, depthWrite: false }));
  const sunGlow = new THREE.Mesh(new THREE.CircleGeometry(70, 24), new THREE.MeshBasicMaterial({
    color: glow, transparent: true, opacity: 0.35, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  sunDisc.renderOrder = sunGlow.renderOrder = -1;
  trackRoot.add(sky, sunGlow, sunDisc);
  return {
    update() {
      sky.position.copy(camera.position);
      sunDisc.position.copy(camera.position).addScaledVector(sunDir, 420);
      sunGlow.position.copy(camera.position).addScaledVector(sunDir, 425);
      sunDisc.lookAt(camera.position);
      sunGlow.lookAt(camera.position);
    },
  };
}

/** Chevron boards on the rail on the outside of the tight corners (radius < 22 m), arrows the way it turns. */
function buildChevrons({ N, normals, tangents, wL, wR, wallH, radius }) {
  const T = CFG.track;
  const chevTex = (() => {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#1d1a1a'; g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#ffd23a';
    for (const x of [14, 54, 94]) {
      g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 22, 32); g.lineTo(x, 56); g.lineTo(x + 12, 56); g.lineTo(x + 34, 32); g.lineTo(x + 12, 8); g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const boards = [];
  const used = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (radius[i] > 22 || used[i]) continue;
    let lo = i;
    for (let d = -14; d <= 14; d++) if (radius[(i + d + N) % N] < radius[lo]) lo = (i + d + N) % N;
    if (lo !== i) continue; // local tightest point only
    const a = normals[(i - 3 + N) % N], b = tangents[(i + 3) % N];
    const leftTurn = b.x * a.x + b.z * a.z > 0;
    for (let d = -14; d <= 14; d += 4) {
      const k = (i + d + N) % N;
      used[k] = 1;
      const lat = leftTurn ? -(wR[k] + T.curb + T.wallThickness / 2) : wL[k] + T.curb + T.wallThickness / 2;
      boards.push({ k, lat, leftTurn });
    }
  }
  if (boards.length) {
    const geo = new THREE.PlaneGeometry(1.8, 0.9);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ map: chevTex, side: THREE.DoubleSide }), boards.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    boards.forEach(({ k, lat, leftTurn }, n) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(tangents[k].x, tangents[k].z) + Math.PI);
      sc.set(leftTurn ? -1 : 1, 1, 1); // arrows point the way the corner goes
      m.compose(roadPoint(k, lat, wallH[k] + 0.55, p), q, sc);
      mesh.setMatrixAt(n, m);
    });
    trackRoot.add(mesh);
  }
}

/**
 * Snowy mountain on a clear day. Height-field ground (makeTerrain): soft snowy hills, grey rock where it's
 * steep, and a frozen lake (flat, a little below the road, icy blue) around the ice stretch. Snow-capped
 * pines, rocks, snowmen, far mountains, and light snowfall around the camera.
 */
function buildSnow(data) {
  const { N, samples } = data;
  const rand = seededRand(777);
  const noise = makeNoise(rand);

  // The lake: an ellipse round the ice stretch, its shore wobbled by noise. 1 inside, 0 outside.
  const lake = (x, z) => {
    const r = ((x - 40) / 135) ** 2 + ((z + 110) / 58) ** 2 + (noise(x / 25 + 5, z / 25) - 0.5) * 0.5;
    return 1 - smoothstep(0.8, 1, r);
  };
  const SNOW = [0xe9eff6, 0xe2e9f2, 0xeef3f8].map((h) => new THREE.Color(h));
  const SHADE = new THREE.Color(0xc9d6e6), ROCK = new THREE.Color(0x7f8a98), ICE = [0xbfe2f1, 0xb3dbee, 0xcbe8f4].map((h) => new THREE.Color(h));
  const ground = makeTerrain(data,
    (x, z) => {
      const f = lake(x, z);
      return [(4 + 16 * noise(x / 90 + 7, z / 90)) * (1 - f), 6 + 8 * noise(x / 30, z / 30), 12 + 14 * noise(x / 20 + 3, z / 20),
        1.4 * (1 - f) - 0.3 * f];
    },
    (x, z, h, slope, cc) => {
      const f = lake(x, z);
      if (f > 0.5) cc.copy(ICE[(noise(x / 7, z / 7 + 4) * 3) | 0]);
      else if (slope > 0.75) cc.copy(ROCK).lerp(SHADE, 0.35 * noise(x / 5, z / 5));
      else cc.copy(SNOW[(noise(x / 14 + 9, z / 14) * 3) | 0]).lerp(SHADE, smoothstep(0.3, 0.75, slope) * 0.6);
    });
  const { heightAt, floorDist, minX, maxX, minZ, maxZ } = ground;
  // snow beyond the height field's edge, so there's no gap at the horizon
  const plain = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), lambert(0xe6edf5));
  plain.rotation.x = -Math.PI / 2;
  plain.position.set((minX + maxX) / 2, -2, (minZ + maxZ) / 2);
  trackRoot.add(plain);

  const sky = makeSky(0xe8f0f8, 0xb5d6f2, 0x5a9be0, 0xfff4e0);
  buildChevrons(data);

  // ---- Props: pines, rocks, snowmen (instanced, on spots off the road, not on the lake) ----
  const cc = new THREE.Color();
  const spot = (uMin, uMax, tries = 40) => {
    for (let t = 0; t < tries; t++) {
      const x = minX - 60 + rand() * (maxX - minX + 120), z = minZ - 60 + rand() * (maxZ - minZ + 120);
      if (lake(x, z) > 0.1) continue;
      const { u } = floorDist(x, z);
      if (u < uMin || u > uMax) continue;
      const y = heightAt(x, z);
      if (Math.abs(heightAt(x + 1.5, z) - y) > 1 || Math.abs(heightAt(x, z + 1.5) - y) > 1) continue;
      return new THREE.Vector3(x, y, z);
    }
    return null;
  };
  const scatter = (geo, mat, count, uMin, uMax, place, colors) => {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    let n = 0;
    for (let t = 0; t < count; t++) {
      const p = spot(uMin, uMax);
      if (!p) continue;
      q.setFromAxisAngle(_up, rand() * Math.PI * 2);
      place(sc, p);
      mesh.setMatrixAt(n, m.compose(p, q, sc));
      if (colors) mesh.setColorAt(n, cc.set(colors[(rand() * colors.length) | 0]));
      n++;
    }
    mesh.count = n;
    mesh.castShadow = true;
    trackRoot.add(mesh);
  };
  const baked = (build) => {
    const g = new THREE.Group();
    build((geo, color, x, y, z) => {
      const mesh = new THREE.Mesh(geo, lambert(color));
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    });
    return bakeMeshes(g);
  };
  // pine: trunk, three green tiers, each with snow on top
  const pine = baked((add) => {
    add(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 6), 0x6b4a2f, 0, 0.8, 0);
    [[2.3, 3, 2.6], [1.7, 2.5, 4.2], [1.1, 2, 5.6]].forEach(([r, h, y], i) => {
      add(new THREE.ConeGeometry(r, h, 7), [0x2e6b4c, 0x347756, 0x2a6347][i], 0, y, 0);
      add(new THREE.ConeGeometry(r * 0.62, h * 0.42, 7), 0xf2f6fa, 0, y + h * 0.3, 0);
    });
  });
  scatter(pine.geometry, pine.material, 190, 1, 40, (sc) => sc.setScalar(0.8 + rand() * 0.8));
  const rock = baked((add) => {
    add(new THREE.IcosahedronGeometry(1, 0), 0x7d8794, 0, 0, 0);
    add(new THREE.IcosahedronGeometry(0.75, 0), 0xf0f4f8, 0, 0.45, 0).scale.set(1.15, 0.5, 1.15);
  });
  scatter(rock.geometry, rock.material, 60, 0, 16, (sc) => sc.set(0.7 + rand() * 2, 0.6 + rand() * 1.2, 0.7 + rand() * 2));
  const snowman = baked((add) => {
    add(new THREE.SphereGeometry(0.9, 10, 8), 0xf4f7fb, 0, 0.8, 0);
    add(new THREE.SphereGeometry(0.65, 10, 8), 0xf4f7fb, 0, 2.0, 0);
    add(new THREE.SphereGeometry(0.45, 10, 8), 0xf4f7fb, 0, 2.95, 0);
    add(new THREE.ConeGeometry(0.09, 0.5, 6), 0xff8a1f, 0, 2.95, 0.6).rotation.x = Math.PI / 2;
    add(new THREE.TorusGeometry(0.5, 0.12, 6, 12), 0xd23a3a, 0, 2.5, 0).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 10), 0x222831, 0, 3.32, 0);
    add(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 10), 0x222831, 0, 3.58, 0);
    for (const x of [-0.15, 0.15]) add(new THREE.SphereGeometry(0.06, 5, 4), 0x222831, x, 3.08, 0.4);
  });
  scatter(snowman.geometry, snowman.material, 14, 0.5, 5, (sc) => sc.setScalar(0.9 + rand() * 0.3));

  // ---- Far mountains with snow caps ----
  const peaks = baked((add) => {
    add(new THREE.ConeGeometry(1, 1, 6), 0x8fa3bd, 0, 0.5, 0);
    // cap is a touch wider and taller than the cone it sits on: an exact fit made its faces coplanar with
    // the rock and they z-fought (flickered) at 300+ m
    add(new THREE.ConeGeometry(0.46, 0.44, 6), 0xf2f6fa, 0, 0.80, 0);
  });
  const peakMesh = new THREE.InstancedMesh(peaks.geometry, peaks.material, 18);
  const pm = new THREE.Matrix4(), pq = new THREE.Quaternion(), ps = new THREE.Vector3(), pp = new THREE.Vector3();
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rand() * 0.2, r = 330 + rand() * 50, h = 70 + rand() * 60;
    pq.setFromAxisAngle(_up, rand() * Math.PI);
    peakMesh.setMatrixAt(i, pm.compose(pp.set(cx + Math.cos(a) * r, -2, cz + Math.sin(a) * r), pq, ps.set(45 + rand() * 35, h, 45 + rand() * 35)));
  }
  trackRoot.add(peakMesh);

  // ---- Light snowfall: flakes in a box round the camera, wrapping as it moves ----
  const FLAKES = 450, BOX = 70, TALL = 30;
  const fPos = new Float32Array(FLAKES * 3), fCol = new Float32Array(FLAKES * 3);
  const fAlpha = new Float32Array(FLAKES), fSize = new Float32Array(FLAKES), fPhase = new Float32Array(FLAKES);
  for (let i = 0; i < FLAKES; i++) {
    fPos.set([(rand() - 0.5) * BOX, rand() * TALL, (rand() - 0.5) * BOX], i * 3);
    fCol.set([1, 1, 1], i * 3);
    fAlpha[i] = 0.55 + rand() * 0.35;
    fSize[i] = 0.1 + rand() * 0.12;
    fPhase[i] = rand() * 6.3;
  }
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3).setUsage(THREE.DynamicDrawUsage));
  fGeo.setAttribute('color', new THREE.BufferAttribute(fCol, 3));
  fGeo.setAttribute('alpha', new THREE.BufferAttribute(fAlpha, 1));
  fGeo.setAttribute('size', new THREE.BufferAttribute(fSize, 1));
  const flakes = new THREE.Points(fGeo, particleMaterial());
  flakes.frustumCulled = false;
  trackRoot.add(flakes);
  const wrap = (v, c, span) => c + ((((v - c + span / 2) % span) + span) % span) - span / 2;

  let clock = 0;
  return {
    update(dt) {
      clock += dt;
      sky.update();
      const c = camera.position;
      for (let i = 0; i < FLAKES; i++) {
        const o = i * 3;
        fPos[o] = wrap(fPos[o] + Math.sin(clock * 0.8 + fPhase[i]) * 0.4 * dt, c.x, BOX);
        fPos[o + 1] = wrap(fPos[o + 1] - (1.2 + fSize[i] * 4) * dt, c.y + 8, TALL);
        fPos[o + 2] = wrap(fPos[o + 2] + Math.cos(clock * 0.6 + fPhase[i]) * 0.3 * dt, c.z, BOX);
      }
      fGeo.attributes.position.needsUpdate = true;
    },
  };
}

/**
 * Desert canyon on a golden afternoon. The ground is a height field: flat at road height beside the road, then a sandy
 * slope and red rock walls 13-30 m high. Each point takes the lowest of (nearby road height + rise with
 * distance), so where two parts of the track are close at different heights the ground follows the lower
 * one: the lower road runs through a slot under the bridge, and a higher road on a ridge gets a stone
 * embankment. Life: circling vultures, hot-air balloons, tumbleweeds rolling across the road, dust devils,
 * flags at the start.
 */
function buildDesert(data) {
  const { N, samples, normals, tangents, wL, wR, wallH, spacing, radius, bank } = data;
  const T = CFG.track;
  const rand = seededRand(4242);
  const noise = makeNoise(rand);

  // ---- Ground: sand on the flat, talus on gentle slopes, red rock strata on walls 13-30 m high ----
  const SAND = [0xe3b27a, 0xd9a46c, 0xe8bd88].map((h) => new THREE.Color(h));
  const TALUS = new THREE.Color(0xc57a49);
  const ROCK = [0xb4532e, 0xc8693a, 0x9c4127, 0xd88a52, 0xb85d36, 0xa84a2c].map((h) => new THREE.Color(h));
  const { heightAt, floorDist, nearby, maxY, minX, maxX, minZ, maxZ } = makeTerrain(data,
    (x, z) => [13 + 17 * noise(x / 110 + 31, z / 110 + 17), 5 + 7 * noise(x / 23, z / 23), 5 + 5 * noise(x / 15 + 50, z / 15)],
    (x, z, h, slope, cc) => {
      if (slope > 0.6) cc.copy(ROCK[(((h + noise(x / 9, z / 9) * 2.5) / 2.3) | 0) % ROCK.length]);
      else if (slope > 0.22) cc.copy(TALUS).lerp(SAND[0], 0.3 * noise(x / 6, z / 6));
      else cc.copy(SAND[(noise(x / 12 + 9, z / 12) * 3) | 0]);
    });
  const cc = new THREE.Color();

  const sky = makeSky(0xf1d9bb, 0xb9d8ef, 0x5f9fdc, 0xffe2b0);

  // ---- Bridge: where another part of the track runs > 5 m below within 26 m ----
  const bridge = new Uint8Array(N + 1);
  for (let i = 0; i < N; i++) {
    nearby(samples[i].x, samples[i].z, (j, d) => {
      const along = Math.min(Math.abs(i - j), N - Math.abs(i - j)) * spacing;
      if (d < 26 && along > 60 && samples[i].y - samples[j].y > 5) bridge[i] = 1;
    });
  }
  const parts = new THREE.Group();
  const STEEL = 0xa3402a, STONE = 0xb9774b;
  const beam = (a, b, t, color) => { // a box from point a to point b, t thick
    const len = a.distanceTo(b);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(t, t, len), lambert(color));
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.lookAt(b);
    parts.add(mesh);
  };
  const skirt = []; // stone faces under rails that stand above the ground (embankments, bridge ends)
  for (const side of [1, -1]) {
    const w = side > 0 ? wL : wR;
    const outer = (i) => (w[i] + T.curb + T.wallThickness) * side;
    let post = 0;
    for (let i = 0; i < N; i += 2) {
      const j = Math.min(i + 2, N);
      if (bridge[i] || bridge[j]) {
        // deck edge girder under the rail, and a truss above it every 4 samples
        const a = roadPoint(i, outer(i), -2.2), b = roadPoint(j, outer(j), -2.2);
        beam(a, b, 1.2, STEEL);
        if (post++ % 2 === 0) {
          const top = wallH[i] + 2.6;
          beam(roadPoint(i, outer(i) - side * 0.3, -0.5), roadPoint(i, outer(i) - side * 0.3, top), 0.35, STEEL);
          const k = Math.min(i + 4, N);
          beam(roadPoint(i, outer(i) - side * 0.3, top), roadPoint(k, outer(k) - side * 0.3, top), 0.35, STEEL);
          beam(roadPoint(i, outer(i) - side * 0.3, wallH[i]), roadPoint(k, outer(k) - side * 0.3, top), 0.25, STEEL);
        }
        continue;
      }
      post = 0;
      // stone face from 0.5 m under the rail down to the ground just outside it
      const pa = roadPoint(i, outer(i), -0.5), pb = roadPoint(j, outer(j), -0.5);
      const ga = heightAt(pa.x + normals[i].x * side * 1.5, pa.z + normals[i].z * side * 1.5);
      const gb = heightAt(pb.x + normals[j].x * side * 1.5, pb.z + normals[j].z * side * 1.5);
      if (pa.y - ga < 0.4 && pb.y - gb < 0.4) continue;
      skirt.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, pa.x, ga - 0.5, pa.z, pa.x, ga - 0.5, pa.z, pb.x, pb.y, pb.z, pb.x, gb - 0.5, pb.z);
    }
  }
  if (parts.children.length) {
    bakeMeshes(parts);
    trackRoot.add(parts);
  }
  // the deck's underside across the bridge
  for (let i = 0; i < N; i += 2) {
    const j = Math.min(i + 2, N);
    if (!(bridge[i] || bridge[j])) continue;
    const l = (k) => wL[k] + T.curb + T.wallThickness, r = (k) => -(wR[k] + T.curb + T.wallThickness);
    const a0 = roadPoint(i, r(i), -1.6), a1 = roadPoint(i, l(i), -1.6), b0 = roadPoint(j, r(j), -1.6), b1 = roadPoint(j, l(j), -1.6);
    skirt.push(...a0.toArray(), ...a1.toArray(), ...b0.toArray(), ...b0.toArray(), ...a1.toArray(), ...b1.toArray());
  }
  if (skirt.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(skirt, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: STONE, side: THREE.DoubleSide }));
    mesh.receiveShadow = true;
    trackRoot.add(mesh);
  }

  buildChevrons(data);

  // ---- Props on the canyon floor: cacti, boulders, dry bushes ----
  const spot = (uMin, uMax, tries = 40) => {
    for (let t = 0; t < tries; t++) {
      const x = minX - 40 + rand() * (maxX - minX + 80), z = minZ - 40 + rand() * (maxZ - minZ + 80);
      const { u } = floorDist(x, z);
      if (u < uMin || u > uMax) continue;
      const y = heightAt(x, z);
      if (Math.abs(heightAt(x + 1.5, z) - y) > 0.8 || Math.abs(heightAt(x, z + 1.5) - y) > 0.8) continue;
      return new THREE.Vector3(x, y, z);
    }
    return null;
  };
  const scatter = (mesh, count, uMin, uMax, place) => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    let n = 0;
    for (let t = 0; t < count; t++) {
      const p = spot(uMin, uMax);
      if (!p) continue;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
      place(s, p);
      mesh.setMatrixAt(n, m.compose(p, q, s));
      if (mesh.userData.colors) mesh.setColorAt(n, cc.set(mesh.userData.colors[(rand() * mesh.userData.colors.length) | 0]));
      n++;
    }
    mesh.count = n;
    mesh.castShadow = true;
    trackRoot.add(mesh);
  };
  const cactusGroup = new THREE.Group();
  const cactusPart = (geo, x, y, z, rz = 0) => {
    const mesh = new THREE.Mesh(geo, lambert(0x4f8a3c));
    mesh.position.set(x, y, z);
    mesh.rotation.z = rz;
    cactusGroup.add(mesh);
  };
  cactusPart(new THREE.CylinderGeometry(0.32, 0.38, 4.2, 7), 0, 2.1, 0);
  cactusPart(new THREE.SphereGeometry(0.32, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0, 4.2, 0);
  cactusPart(new THREE.CylinderGeometry(0.2, 0.2, 0.8, 6), 0.5, 1.9, 0, Math.PI / 2);
  cactusPart(new THREE.CylinderGeometry(0.22, 0.24, 1.5, 6), 0.9, 2.6, 0);
  cactusPart(new THREE.CylinderGeometry(0.18, 0.18, 0.7, 6), -0.45, 1.5, 0, Math.PI / 2);
  cactusPart(new THREE.CylinderGeometry(0.2, 0.22, 1.1, 6), -0.8, 2.0, 0);
  const cactusMesh = bakeMeshes(cactusGroup);
  const cacti = new THREE.InstancedMesh(cactusMesh.geometry, cactusMesh.material, 70);
  scatter(cacti, 70, 0.5, 9, (s) => s.setScalar(0.75 + rand() * 0.6));

  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), lambert(0xffffff), 90);
  rocks.userData.colors = [0xa9532f, 0xbf6a3f, 0x8f4a2c, 0xc98a5a];
  scatter(rocks, 90, 0, 14, (s) => s.set(0.7 + rand() * 2.6, 0.5 + rand() * 1.6, 0.7 + rand() * 2.6));

  const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.6, 0), lambert(0xffffff), 80);
  bushes.userData.colors = [0x8d8248, 0x9e8f55, 0x7a6f3e];
  scatter(bushes, 80, 0, 7, (s) => s.set(1 + rand() * 0.8, 0.6 + rand() * 0.4, 1 + rand() * 0.8));

  // ---- Flags on poles along the start straight, waving ----
  const flagSpots = [];
  for (let d = -60; d <= 50; d += 14) {
    const k = (d + N) % N;
    for (const side of [1, -1]) flagSpots.push({ k, side, lat: side > 0 ? wL[k] + T.curb + T.wallThickness + 0.8 : -(wR[k] + T.curb + T.wallThickness + 0.8) });
  }
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 6, 5);
  poleGeo.translate(0, 3, 0);
  const poles = new THREE.InstancedMesh(poleGeo, lambert(0xdddddd), flagSpots.length);
  const flagGeo = new THREE.PlaneGeometry(1.6, 1);
  flagGeo.translate(0.8, 0, 0); // hinged on the pole
  const flags = new THREE.InstancedMesh(flagGeo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), flagSpots.length);
  const flagColors = [0xe8322f, 0xffd23a, 0x2f6bff, 0x2fbf4a, 0xff5fb0, 0xffffff];
  const fm = new THREE.Matrix4(), fq = new THREE.Quaternion(), fs = new THREE.Vector3(1, 1, 1), fp = new THREE.Vector3();
  flagSpots.forEach((f, n) => {
    f.base = roadPoint(f.k, f.lat, -0.3);
    poles.setMatrixAt(n, fm.compose(f.base, fq.identity(), fs));
    flags.setColorAt(n, cc.set(flagColors[n % flagColors.length]));
    f.phase = rand() * 6;
  });
  poles.castShadow = true;
  trackRoot.add(poles, flags);

  // ---- Vultures circling over the canyon ----
  const birdMat = lambert(0x2b2220);
  const birds = [];
  const birdSpots = [[0, 0], [-160, 80], [170, -60], [-120, -40], [100, 90]];
  for (const [bx, bz] of birdSpots) {
    const g = new THREE.Group();
    const bodyGeo = new THREE.ConeGeometry(0.3, 1.5, 5);
    bodyGeo.rotateX(Math.PI / 2);
    g.add(new THREE.Mesh(bodyGeo, birdMat));
    const wings = [1, -1].map((side) => {
      const wg = new THREE.BoxGeometry(2.1, 0.05, 0.75);
      wg.translate(side * 1.05, 0, 0);
      const w = new THREE.Mesh(wg, birdMat);
      g.add(w);
      return w;
    });
    trackRoot.add(g);
    birds.push({ g, wings, cx: bx + (rand() - 0.5) * 40, cz: bz + (rand() - 0.5) * 40, r: 18 + rand() * 30,
      y: maxY + 22 + rand() * 22, w: (0.18 + rand() * 0.15) * (rand() < 0.5 ? -1 : 1), a: rand() * 6, t: rand() * 10 });
  }

  // ---- Hot-air balloons drifting far off ----
  const balloons = [];
  const stripes = [[0xe8322f, 0xffd23a], [0x2f6bff, 0xffffff], [0x9b4dff, 0xff8a00]];
  const profile = [[0.6, -4.4], [1.7, -3.6], [3.2, -1.9], [4.1, 0.3], [4.2, 2], [3.7, 3.7], [2.6, 5], [1, 5.7], [0, 5.8]].map(([r, y]) => new THREE.Vector2(r, y));
  stripes.forEach((pair, n) => {
    const g = new THREE.Group();
    for (let k = 0; k < 12; k++) {
      g.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 2, (k / 12) * Math.PI * 2, Math.PI / 6), lambert(pair[k % 2])));
    }
    const basket = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 1.2), lambert(0x7a4a2a));
    basket.position.y = -6.4;
    g.add(basket);
    for (const [x, z] of [[0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]]) {
      const rope = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.6, 0.05), lambert(0x3a2a1a));
      rope.position.set(x, -5.3, z);
      g.add(rope);
    }
    bakeMeshes(g);
    g.scale.setScalar(1.6);
    trackRoot.add(g);
    const a = (n / 3) * Math.PI * 2 + 0.6;
    balloons.push({ g, cx: (minX + maxX) / 2 + Math.cos(a) * 190, cz: (minZ + maxZ) / 2 + Math.sin(a) * 150,
      y: 55 + n * 14, a: rand() * 6, t: rand() * 10 });
  });

  // ---- Tumbleweeds rolling across the road ahead of the player ----
  const weedMat = new THREE.MeshLambertMaterial({ color: 0xb48c58, wireframe: true });
  const weedCore = lambert(0x8a6a3c);
  const weeds = [];
  for (let n = 0; n < 5; n++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), weedMat));
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), weedCore));
    g.visible = false;
    trackRoot.add(g);
    weeds.push({ g, wait: 1 + n * 2.5, t: 0, life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), axis: new THREE.Vector3() });
  }
  const spawnWeed = (w) => {
    const k = (kart.trackIdx + 45 + ((rand() * 90) | 0)) % N;
    const side = rand() < 0.5 ? 1 : -1;
    const lat = side * ((side > 0 ? wL[k] : wR[k]) + 7);
    const speed = 3.5 + rand() * 3;
    w.pos.copy(roadPoint(k, lat));
    w.vel.set(-normals[k].x * side, 0, -normals[k].z * side).multiplyScalar(speed)
      .addScaledVector(tangents[k], (rand() - 0.5) * 2);
    w.axis.set(w.vel.z, 0, -w.vel.x).normalize();
    w.k = k;
    w.life = (Math.abs(lat) * 2) / speed;
    w.t = 0;
    w.g.visible = true;
  };

  // ---- Dust devils: spiralling columns of sand on the canyon floor ----
  const DEVILS = 2, PER = 60;
  const dPos = new Float32Array(DEVILS * PER * 3), dCol = new Float32Array(DEVILS * PER * 3);
  const dAlpha = new Float32Array(DEVILS * PER), dSize = new Float32Array(DEVILS * PER);
  const dGeo = new THREE.BufferGeometry();
  const dyn = (a, n) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
  dGeo.setAttribute('position', dyn(dPos, 3));
  dGeo.setAttribute('color', dyn(dCol, 3));
  dGeo.setAttribute('alpha', dyn(dAlpha, 1));
  dGeo.setAttribute('size', dyn(dSize, 1));
  const dMat = particleMaterial();
  const devilPoints = new THREE.Points(dGeo, dMat);
  devilPoints.frustumCulled = false;
  trackRoot.add(devilPoints);
  const devils = Array.from({ length: DEVILS }, () => ({ p: null, t: 0, life: 0, drift: new THREE.Vector3(),
    h: Float32Array.from({ length: PER }, () => rand() * 9), th: Float32Array.from({ length: PER }, () => rand() * 6.3) }));
  for (let i = 0; i < DEVILS * PER; i++) dCol.set([0.86, 0.66, 0.44], i * 3);
  const placeDevil = (dv) => {
    // somewhere on the floor beside the road ahead of the player
    const k = (kart.trackIdx + 30 + ((rand() * 120) | 0)) % N;
    const side = rand() < 0.5 ? 1 : -1;
    dv.p = roadPoint(k, side * ((side > 0 ? wL[k] : wR[k]) + T.curb + T.wallThickness + 2 + rand() * 3));
    dv.drift.set((rand() - 0.5) * 1.2, 0, (rand() - 0.5) * 1.2);
    dv.t = 0;
    dv.life = 10 + rand() * 8;
  };

  let clock = 0;
  const tq = new THREE.Quaternion();
  return {
    update(dt) {
      clock += dt;
      sky.update();

      flagSpots.forEach((f, n) => {
        const yaw = Math.atan2(tangents[f.k].x, tangents[f.k].z) + Math.PI + Math.sin(clock * 3 + f.phase) * 0.35;
        fq.setFromAxisAngle(_up, yaw);
        fp.copy(f.base).y += 5.4;
        flags.setMatrixAt(n, fm.compose(fp, fq, fs));
      });
      flags.instanceMatrix.needsUpdate = true;

      for (const b of birds) {
        b.a += b.w * dt;
        b.t += dt;
        b.g.position.set(b.cx + Math.cos(b.a) * b.r, b.y + Math.sin(b.t * 0.5) * 1.5, b.cz + Math.sin(b.a) * b.r);
        b.g.rotation.set(0, Math.atan2(-Math.sin(b.a) * b.w, Math.cos(b.a) * b.w), 0);
        b.g.rotateZ(-Math.sign(b.w) * 0.35); // lean into the circle
        const flap = Math.sin(b.t * 0.35) > 0.4 ? Math.sin(b.t * 7) * 0.5 : 0.08; // glide most of the time
        b.wings[0].rotation.z = flap;
        b.wings[1].rotation.z = -flap;
      }
      for (const b of balloons) {
        b.a += dt * 0.012;
        b.t += dt;
        b.g.position.set(b.cx + Math.cos(b.a) * 40, b.y + Math.sin(b.t * 0.3) * 2, b.cz + Math.sin(b.a) * 40);
      }
      for (const w of weeds) {
        if (!w.g.visible) {
          w.wait -= dt;
          if (w.wait <= 0 && state.phase !== 'menu') spawnWeed(w);
          continue;
        }
        w.t += dt;
        w.pos.addScaledVector(w.vel, dt);
        const k = nearestTrackIndex(w.pos, w.k);
        w.k = k;
        w.g.position.set(w.pos.x, surfaceY(k, clampLane(k, lateral(k, w.pos), 0)) + 0.85 + Math.abs(Math.sin(w.t * 2.6)) * 1.1, w.pos.z);
        tq.setFromAxisAngle(w.axis, (w.vel.length() / 0.85) * dt);
        w.g.quaternion.premultiply(tq);
        if (w.t > w.life) { w.g.visible = false; w.wait = 1.5 + rand() * 4; }
      }
      dMat.uniforms.scale.value = fx.points.material.uniforms.scale.value;
      devils.forEach((dv, d) => {
        if (!dv.p || dv.t > dv.life) placeDevil(dv);
        dv.t += dt;
        dv.p.addScaledVector(dv.drift, dt);
        const fade = Math.min(1, dv.t / 2, (dv.life - dv.t) / 2);
        for (let n = 0; n < PER; n++) {
          const i = d * PER + n;
          dv.h[n] += dt * 1.6;
          if (dv.h[n] > 9) dv.h[n] = 0;
          const h = dv.h[n], r = 0.35 + h * 0.22;
          dv.th[n] += dt * (4.5 - h * 0.25);
          dPos.set([dv.p.x + Math.cos(dv.th[n]) * r, dv.p.y + h, dv.p.z + Math.sin(dv.th[n]) * r], i * 3);
          dAlpha[i] = 0.3 * fade * Math.min(1, h) * (1 - h / 9);
          dSize[i] = 0.8 + h * 0.15;
        }
      });
      for (const a of ['position', 'alpha', 'size']) dGeo.attributes[a].needsUpdate = true;
    },
  };
}
const _up = new THREE.Vector3(0, 1, 0);

// ---------- 1d. Karts (physics + visuals). karts[0] is the player. ----------
// shared by every kart's dizzy stars (see buildKart)
const STAR_GEO = new THREE.OctahedronGeometry(0.17, 0);
const STAR_MAT = new THREE.MeshBasicMaterial({ color: 0xffe14a });
// Shield bubble: clear in the middle, bright at the rim (fresnel), a thin-film rainbow sheen that drifts
// over the surface, two highlights, and a soft wobble. One material per kart (its own fade); one program.
const BUBBLE_GEO = new THREE.SphereGeometry(1, 32, 20);
const BUBBLE_SCALE = new THREE.Vector3(1.6, 1.35, 2.05);
const BUBBLE_MAT = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { time: { value: 0 }, fade: { value: 1 } },
  vertexShader: `
    uniform float time;
    varying vec3 vN, vV, vP;
    void main() {
      vec3 p = position;
      float w = sin(time * 3.1 + p.y * 4.0 + p.x * 2.0) * 0.025 + sin(time * 2.3 - p.z * 3.5) * 0.02;
      p += normal * w;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      vP = position;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform float time, fade;
    varying vec3 vN, vV, vP;
    void main() {
      vec3 n = normalize(vN), v = normalize(vV);
      float ndv = abs(dot(n, v));
      float rim = pow(1.0 - ndv, 2.2);
      // thin film: hue shifts with the viewing angle and swirls slowly across the surface
      float film = ndv * 1.6 + sin(vP.y * 3.0 + vP.x * 2.0 + time * 0.9) * 0.25 + time * 0.05;
      vec3 rainbow = 0.55 + 0.45 * cos(6.2832 * (film + vec3(0.0, 0.33, 0.67)));
      vec3 col = mix(vec3(0.75, 0.92, 1.0), rainbow, 0.75);
      vec3 l1 = normalize(vec3(-0.5, 0.7, 0.6)), l2 = normalize(vec3(0.6, -0.3, 0.7));
      float spec = pow(max(dot(reflect(-l1, n), v), 0.0), 60.0) + 0.4 * pow(max(dot(reflect(-l2, n), v), 0.0), 25.0);
      float a = 0.05 + rim * 0.7 + spec;
      gl_FragColor = vec4(col * (0.6 + rim * 0.6) + spec, clamp(a, 0.0, 0.95) * fade);
    }`,
});

const SVG_ITEMS = { mushroom: icon('mushroom'), triple: icon('mushroom'), banana: icon('banana'), shield: icon('shield'), star: icon('star') };
const karts = CFG.racers.slice(0, CFG.grid.karts).map((r, i) => makeRacer(r, i === 0)); // castDrivers recasts them
const kart = karts[0];
world.addEventListener('preStep', () => karts.forEach(applyStabilityAssist));
// Rails cost speed. 'collide' fires per contact point, before the solver (true impact speed); keep the
// hardest one and let applyStabilityAssist apply it once, right after the solver in the same step.
for (const k of karts) {
  k.body.addEventListener('collide', (e) => {
    if (e.body.material === physMats.chassis) { k.bumpT = 0.6; return; } // kart-to-kart: riders react (Luna)
    if (e.body.material !== physMats.wall) return;
    k.wallTouch = true;
    const imp = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (imp >= k.wallHit) { // the hardest hit this step: the way out of the rail (flat) and the velocity going in
      const sg = e.contact.bi === k.body ? -1 : 1, nx = e.contact.ni.x * sg, nz = e.contact.ni.z * sg, nl = Math.hypot(nx, nz);
      if (nl > 0.3) { k.wallNx = nx / nl; k.wallNz = nz / nl; k.wallVx = k.body.velocity.x; k.wallVz = k.body.velocity.z; }
    }
    k.wallHit = Math.max(k.wallHit, imp);
  });
}

/** [body, accent, suit] + the driver's helmet and visor: the full colour list paintKart takes. */
function kartColors(colors, look) { return [...colors, look.helmet, look.visor]; }

function makeRacer({ name, colors, look }, isPlayer) {
  return Object.assign(buildKart(kartColors(colors, look)), {
    skid: [{ x: 0, y: 0, z: 0, on: false }, { x: 0, y: 0, z: 0, on: false }], // last skid-mark point per rear wheel
    name, isPlayer,
    color: cssHex(colors[0]),
    ctl: { steer: 0, gas: false, brake: false }, // steer -1..1, positive = right
    topMult: 1,
    orbit: [], // triple mushroom meshes circling the kart
    ai: isPlayer ? null : {},
    ...freshDriveState(),
  });
}

function cssHex(n) { return '#' + n.toString(16).padStart(6, '0'); }

/** Recolours a baked kart + its rider in place: colors = [body, accent, suit, helmet, visor] (kartColors). */
function paintKart(k, colors) {
  const c = new THREE.Color();
  for (const mesh of [k.bodyMesh, k.rider?.mesh]) {
    if (!mesh) continue;
    const attr = mesh.geometry.attributes.color, roles = mesh.geometry.userData.paint;
    for (let i = 0; i < roles.length; i++) {
      if (roles[i] < 0) continue;
      c.setHex(colors[roles[i]]);
      attr.setXYZ(i, c.r, c.g, c.b);
    }
    attr.needsUpdate = true;
  }
  k.color = cssHex(colors[0]);
}

/** Seats driver r in kart k: each driver has their own rider mesh + animation (drivers.js; others = the
 * helmeted fallback). Rebuilt only when the driver changes (the karts are reused, castDrivers recasts them). */
function setRider(k, r, colors) {
  if (k.rider?.name === r.name) return;
  if (k.rider) { k.rider.mesh.removeFromParent(); k.rider.dispose(); }
  k.rider = buildRider(r, colors, CFG.kart.chassisYOffset - CFG.kart.look.seatDrop); // snug in the small frame
  k.group.add(k.rider.mesh);
  k.alpha = undefined; // re-apply the ghost look to the new materials
}

const riderState = { speed: 0, steer: 0, drift: 0, boost: 0, bump: 0, fire: 0 };
/** Feeds a kart's driving state to its rider's animation hook (ears, scarf, tail, lean...). */
function animateRider(k, dt) {
  if (!k.rider?.update) return;
  riderState.speed = k.speed / CFG.kart.maxSpeed;
  riderState.steer = k.spin > 0 ? 0 : k.steerSmooth;
  riderState.drift = k.driftAmt;
  riderState.boost = k.boost > 0 || k.star > 0 ? 1 : 0;
  riderState.bump = k.bumpT > 0 ? 1 : 0; // touched another kart in the last 0.6 s
  k.bumpT = Math.max(0, (k.bumpT || 0) - dt);
  riderState.fire = k.fireT > 0 ? 1 : 0; // used an item in the last 0.4 s (Mako chomps)
  k.fireT = Math.max(0, (k.fireT || 0) - dt);
  k.rider.update(dt, riderState);
}

/** The player (karts[0]) becomes the picked driver in the picked paint; five others race as AI.
 * The AI field never depends on who you pick (user: "the difficulty shouldn't change based on what racer I
 * pick"): the personalities are CFG.racers[1..] (7 since build 37, two more than the 5 AI seats), and each race
 * two of them sit out, in turn (`sitOut`, advanced by startRace, saved). Each style is driven by its own driver,
 * except the picked one's, which the spare driver (CFG.racers[0], Nova) takes over.
 * k.style = the CFG.ai.styles key newAI uses in placeOnGrid. */
const SITOUT_KEY = 'kartrush.sitOut';
let sitOut = (() => { try { return +localStorage.getItem(SITOUT_KEY) || 0; } catch { return 0; } })();
function castDrivers() {
  const me = playerDriver(), spare = CFG.racers[0], styles = CFG.racers.slice(1);
  const out = new Set(Array.from({ length: Math.max(0, styles.length - (karts.length - 1)) }, (_, i) => styles[(sitOut + i) % styles.length]));
  const field = styles.filter((r) => !out.has(r)).map((r) => ({ driver: r === me ? spare : r, style: r.name }));
  [{ driver: me, style: me.name }, ...field].forEach(({ driver: r, style }, i) => {
    karts[i].name = r.name;
    karts[i].style = style;
    const colors = i === 0 ? playerColors() : kartColors(r.colors, r.look);
    setRider(karts[i], r, colors);
    paintKart(karts[i], colors);
  });
}

/** Per-kart driving + race-progress state, reset at every race start. */
function freshDriveState() {
  return {
    speed: 0, steerSmooth: 0, steerAngle: 0, driftAmt: 0, drifting: false, driftCharge: 0,
    passT: false, boost: 0, flipTimer: 0, fallT: 0, airT: 0, padT: 0, stall: 0, wallTouch: false, wallHit: 0, wallNx: 0, wallNz: 0, wallVx: 0, wallVz: 0,
    item: null, itemRoll: 0, itemCount: 0, tripleT: 0, spin: 0, spinTotal: 1, burn: 0, shield: 0, star: 0, bullet: 0, bulletLane: 0,
    trackIdx: 0, lap: 1, halfway: false, progress: 0, place: 1, finished: false, finishTime: 0,
    boxAt: -9, rowCheckIdx: undefined, bumpT: 0,
  };
}

function buildKart(colors) {
  const K = CFG.kart;

  // --- Physics: chassis + raycast vehicle ---
  const body = new CANNON.Body({ mass: K.mass, material: physMats.chassis });
  body.collisionFilterGroup = KART_GROUP; // a ghost (just respawned) drops this from its mask: see setGhost
  body.addShape(new CANNON.Box(K.chassisHalf), new CANNON.Vec3(0, K.chassisYOffset, 0));
  body.angularDamping = 0.5;
  body.linearDamping = 0.05;

  // Kart faces +Z, up is +Y, axles lie along X.
  const vehicle = new CANNON.RaycastVehicle({
    chassisBody: body,
    indexRightAxis: 0,
    indexUpAxis: 1,
    indexForwardAxis: 2,
  });

  // Wheel order: 0 FL, 1 FR, 2 RL, 3 RR  (left = +X when facing +Z)
  const layout = [
    [K.wheelX, K.wheelFrontZ, K.frontGrip],
    [-K.wheelX, K.wheelFrontZ, K.frontGrip],
    [K.wheelX, K.wheelRearZ, K.rearGrip],
    [-K.wheelX, K.wheelRearZ, K.rearGrip],
  ];
  for (const [x, z, grip] of layout) {
    vehicle.addWheel({
      radius: K.wheelRadius,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(x, 0, z),
      suspensionStiffness: 35,
      suspensionRestLength: 0.35,
      maxSuspensionTravel: 0.3,
      maxSuspensionForce: 100000,
      dampingRelaxation: 2.3,
      dampingCompression: 4.4,
      frictionSlip: grip,
      rollInfluence: 0.02,
      useCustomSlidingRotationalSpeed: true,
      customSlidingRotationalSpeed: -30,
    });
  }
  vehicle.addToWorld(world);

  // --- Visuals: chassis group ---
  const group = new THREE.Group();
  // color is a number, or a paint role ('body' / 'accent' / 'driver') that paintKart can change later
  const add = (geo, color, x, y, z, parent = group) => {
    const role = PAINT_ROLES.indexOf(color);
    const mesh = new THREE.Mesh(geo, lambert(role < 0 ? color : colors[role]));
    mesh.userData.paint = role;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const y0 = K.chassisYOffset;
  // The chassis is modelled at full size in `frame`, which draws it smaller (K.look, scaled about the ground);
  // the seat back + steering wheel fit the driver, so they keep their size in `cockpit` (lowered with the driver)
  const L = K.look;
  const frame = new THREE.Group(), cockpit = new THREE.Group();
  frame.scale.set(L.scale, L.scale, L.scale * L.wheelbase);
  frame.position.y = L.groundY * (1 - L.scale);
  cockpit.position.y = -L.seatDrop;
  group.add(frame, cockpit);
  add(new THREE.BoxGeometry(1.5, 0.22, 2.6), 'body', 0, y0 - 0.1, 0, frame);      // floor pan
  add(new THREE.BoxGeometry(1.15, 0.32, 0.7), 'body', 0, y0 + 0.05, 1.1, frame);  // nose
  add(new THREE.BoxGeometry(1.9, 0.16, 0.25), 0x333333, 0, y0 - 0.12, 1.5, frame);   // bumper
  add(new THREE.BoxGeometry(0.28, 0.3, 1.1), 'accent', 0.72, y0 + 0.05, 0, frame); // side pods
  add(new THREE.BoxGeometry(0.28, 0.3, 1.1), 'accent', -0.72, y0 + 0.05, 0, frame);
  add(new THREE.BoxGeometry(0.75, 0.38, 0.5), 0x777a85, 0, y0 + 0.12, -1.05, frame); // engine
  add(new THREE.BoxGeometry(0.06, 0.45, 0.06), 0x222222, 0.6, y0 + 0.35, -1.35, frame);  // spoiler struts
  add(new THREE.BoxGeometry(0.06, 0.45, 0.06), 0x222222, -0.6, y0 + 0.35, -1.35, frame);
  add(new THREE.BoxGeometry(1.7, 0.08, 0.42), 'accent', 0, y0 + 0.6, -1.4, frame);    // spoiler
  add(new THREE.BoxGeometry(0.9, 0.65, 0.22), 0x2a2a3a, 0, y0 + 0.3, -0.6, cockpit);   // seat back
  // (the driver is a separate rider mesh, per driver: setRider / drivers.js; its paws hold this wheel)
  const wheel = add(new THREE.TorusGeometry(0.18, 0.04, 6, 12), 0x222222, 0, y0 + 0.48, 0.2, cockpit);
  wheel.rotation.x = -0.9;

  // Exhaust + boost flame
  const pipeGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 6);
  pipeGeo.rotateX(Math.PI / 2);
  add(pipeGeo, 0x444444, 0.22, y0 + 0.1, -1.4, frame);
  add(pipeGeo, 0x444444, -0.22, y0 + 0.1, -1.4, frame);
  const flameGeo = new THREE.ConeGeometry(0.16, 0.9, 6);
  flameGeo.rotateX(-Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x66d9ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = [0.22, -0.22].map((x) => {
    const f = new THREE.Mesh(flameGeo, flameMat);
    f.position.set(x, y0 + 0.1, -1.95);
    f.visible = false;
    frame.add(f);
    return f;
  });

  // Drift sparks behind the rear wheels
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0x5cc8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks = [K.wheelX, -K.wheelX].map((x) => {
    const sp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), sparkMat);
    sp.position.set(x, -0.45, K.wheelRearZ - 0.45);
    sp.visible = false;
    frame.add(sp);
    return sp;
  });

  // One draw call for the whole body instead of ~20 (each one is drawn twice: shadow + screen)
  const bodyMesh = bakeMeshes(group, [...flames, ...sparks]);
  bodyMesh.material.emissive = new THREE.Color(0); // the star flashes it through the rainbow
  scene.add(group);

  // Shield bubble and bullet hull (added after baking: they toggle)
  const bubble = new THREE.Mesh(BUBBLE_GEO, BUBBLE_MAT.clone());
  bubble.renderOrder = 2; // after the kart and road, so it sits over them
  bubble.scale.copy(BUBBLE_SCALE);
  bubble.position.set(0, y0 + 0.35, -0.15);
  bubble.visible = false;
  group.add(bubble);
  const hull = buildBulletHull(y0);
  hull.visible = false;
  group.add(hull);

  // Dizzy stars circling over the driver while spun out (added after baking: they toggle)
  const stars = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const st = new THREE.Mesh(STAR_GEO, STAR_MAT);
    const a = (i / 3) * Math.PI * 2;
    st.position.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
    stars.add(st);
  }
  stars.position.set(0, y0 + 2.1 - L.seatDrop, -0.3); // over the drivers' heads (Nova's ears reach ~1.9)
  stars.visible = false;
  group.add(stars);

  // --- Visuals: wheels (positioned from the physics wheel transforms, pulled in to the drawn frame: syncMeshes) ---
  const tireMat = lambert(0x1f1f24);
  const hubMat = lambert(0xdddddd);
  const wheelMeshes = layout.map((_, i) => {
    const width = (i < 2 ? 0.34 : 0.44) * L.scale, r = K.wheelRadius * L.scale;
    const g = new THREE.Group();
    const tireGeo = new THREE.CylinderGeometry(r, r, width, 12);
    tireGeo.rotateZ(Math.PI / 2); // cylinder axis Y -> axle axis X
    const tire = new THREE.Mesh(tireGeo, tireMat);
    const hubGeo = new THREE.CylinderGeometry(0.18 * L.scale, 0.18 * L.scale, width + 0.02, 6);
    hubGeo.rotateZ(Math.PI / 2);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    g.add(tire, hub);
    bakeMeshes(g);
    scene.add(g);
    return g;
  });

  return { body, vehicle, group, wheelMeshes, sparks, sparkMat, flames, stars, bodyMesh, bubble, hull };
}

/** The bullet: a black slug round the kart with a chrome nose ring, eyes and red fins. */
function buildBulletHull(y0) {
  const hull = new THREE.Group();
  const add = (geo, color, x, y, z) => {
    const m = new THREE.Mesh(geo, lambert(color));
    m.position.set(x, y, z);
    hull.add(m);
    return m;
  };
  const bodyGeo = new THREE.CylinderGeometry(1.05, 1.05, 2.6, 14);
  bodyGeo.rotateX(Math.PI / 2);
  add(bodyGeo, 0x22232a, 0, y0 + 0.35, -0.3);
  const noseGeo = new THREE.SphereGeometry(1.05, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  noseGeo.rotateX(Math.PI / 2);
  noseGeo.scale(1, 1, 1.1);
  add(noseGeo, 0x22232a, 0, y0 + 0.35, 1.0);
  const ringGeo = new THREE.TorusGeometry(1.06, 0.08, 6, 16);
  add(ringGeo, 0xcfd3dc, 0, y0 + 0.35, 0.95);
  const eyeGeo = new THREE.SphereGeometry(0.2, 8, 6);
  add(eyeGeo, 0xffffff, 0.4, y0 + 0.75, 1.55);
  add(eyeGeo, 0xffffff, -0.4, y0 + 0.75, 1.55);
  const pupilGeo = new THREE.SphereGeometry(0.1, 6, 4);
  add(pupilGeo, 0x000000, 0.42, y0 + 0.78, 1.72);
  add(pupilGeo, 0x000000, -0.42, y0 + 0.78, 1.72);
  const finGeo = new THREE.BoxGeometry(0.1, 0.7, 0.8);
  for (const [x, y, rz] of [[0, 1.2, 0], [0.95, 0.35, Math.PI / 2], [-0.95, 0.35, Math.PI / 2]]) {
    add(finGeo, 0xe8322f, x, y0 + y, -1.4).rotation.z = rz;
  }
  bakeMeshes(hull);
  return hull;
}

/**
 * Merges every plain-coloured mesh under `group` (except `keep`) into a single vertex-coloured,
 * shadow-casting mesh. `group` must still be at the origin with no transform.
 */
function bakeMeshes(group, keep = []) {
  group.updateMatrixWorld(true);
  const parts = [];
  group.traverse((o) => { if (o.isMesh && !keep.includes(o)) parts.push(o); });
  const pos = [], nor = [], col = [], paint = [];
  for (const m of parts) {
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    const flat = g.index ? g.toNonIndexed() : g;
    pos.push(...flat.attributes.position.array);
    nor.push(...flat.attributes.normal.array);
    const { r, g: gr, b } = m.material.color;
    for (let i = 0; i < flat.attributes.position.count; i++) { col.push(r, gr, b); paint.push(m.userData.paint ?? -1); }
  }
  for (const m of parts) m.removeFromParent();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.userData.paint = paint; // per vertex: index into PAINT_ROLES, -1 = fixed colour (see paintKart)
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

// ---------- 1f. Item boxes, boost pads, banana + shell models (built per track by loadTrack) ----------

// ---------- 1g. Effects: smoke / dust / hit bursts (one particle system) + skid marks ----------
const fx = buildEffects();

/** Soft round sprites with per-particle colour, alpha and size (attributes: color, alpha, size). */
function particleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { scale: { value: 300 } },
    vertexShader: `
      attribute float alpha; attribute float size; attribute vec3 color;
      uniform float scale; varying vec3 vColor; varying float vAlpha;
      void main() {
        vColor = color; vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        gl_FragColor = vec4(vColor, vAlpha * (1.0 - d * d));
      }`,
    transparent: true,
    depthWrite: false,
  });
}

function buildEffects() {
  // Particles: one THREE.Points with a soft round sprite, per-particle colour, alpha and size.
  const MAX = 600; // box pops emit ~55 at once, a bomb ~120
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3);
  const alpha = new Float32Array(MAX), size = new Float32Array(MAX);
  const vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), maxLife = new Float32Array(MAX);
  const size0 = new Float32Array(MAX), grow = new Float32Array(MAX), alpha0 = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  const attr = (a, n) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', attr(pos, 3));
  geo.setAttribute('color', attr(col, 3));
  geo.setAttribute('alpha', attr(alpha, 1));
  geo.setAttribute('size', attr(size, 1));
  const mat = particleMaterial();
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  let next = 0;

  function emit(p, v, color, { life: l = 0.6, size: sz = 0.6, grow: g = 1.5, alpha: a = 0.5 } = {}) {
    const i = next;
    next = (next + 1) % MAX;
    pos.set([p.x, p.y, p.z], i * 3);
    vel.set([v.x, v.y, v.z], i * 3);
    col.set(color, i * 3);
    life[i] = maxLife[i] = l;
    size0[i] = sz; grow[i] = g; alpha0[i] = a;
  }

  // Skid marks: a ring buffer of dark quads on the road, one strip per rear wheel per kart.
  const SKIDS = 360;
  const skidPos = new Float32Array(SKIDS * 4 * 3);
  const skidIdx = [];
  for (let q = 0; q < SKIDS; q++) { const v = q * 4; skidIdx.push(v, v + 1, v + 2, v + 2, v + 1, v + 3); }
  const skidGeo = new THREE.BufferGeometry();
  skidGeo.setAttribute('position', attr(skidPos, 3));
  skidGeo.setIndex(skidIdx);
  const skidMesh = new THREE.Mesh(skidGeo, new THREE.MeshBasicMaterial({
    color: 0x1a1a1f, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide,
  }));
  skidMesh.frustumCulled = false;
  scene.add(skidMesh);
  let skidNext = 0, skidDirty = false;

  // a, b: points on the road surface (+0.05: between curbs at 0.04 and dashes at 0.06)
  function skid(a, b, halfW) {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * halfW, nz = (dx / len) * halfW;
    skidPos.set([a.x + nx, a.y, a.z + nz, a.x - nx, a.y, a.z - nz, b.x + nx, b.y, b.z + nz, b.x - nx, b.y, b.z - nz], skidNext * 12);
    skidNext = (skidNext + 1) % SKIDS;
    skidDirty = true;
  }

  function update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) { alpha[i] = 0; continue; }
      life[i] -= dt;
      const t = Math.max(0, life[i] / maxLife[i]); // 1 -> 0
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      vel[i * 3] *= 0.94; vel[i * 3 + 2] *= 0.94;
      alpha[i] = alpha0[i] * t;
      size[i] = size0[i] * (1 + grow[i] * (1 - t));
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    if (skidDirty) { skidGeo.attributes.position.needsUpdate = true; skidDirty = false; }
    // world size -> pixels: drawing-buffer height / (2 tan(fov / 2))
    mat.uniforms.scale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  }

  function reset() {
    life.fill(0);
    alpha.fill(0);
    skidPos.fill(0);
    skidDirty = true;
  }

  return { emit, skid, update, reset, points, skidMesh };
}


function buildItemVisuals() {
  const I = CFG.items;
  const { boxRows, pads: padSpots } = track.def;
  const canvasTex = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  // Item boxes: one instanced mesh, spun every frame (user: boxes were "barely there" at 1.1 m with a lit
  // texture; the desert light made them blend in). Self-lit so any theme shows them. A rainbow glow sphere
  // around them was tried and removed (user: just the box).
  const boxTex = canvasTex(128, 128, (g) => {
    const grad = g.createLinearGradient(0, 0, 128, 128);
    grad.addColorStop(0, '#ff3fa4'); grad.addColorStop(0.35, '#ffb21a'); grad.addColorStop(0.65, '#3fe07a');
    grad.addColorStop(1, '#2fa8ff');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#fff'; g.lineWidth = 14; g.strokeRect(7, 7, 114, 114);
    g.font = 'bold 92px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = '#3a1d5c'; g.strokeText('?', 64, 70);
    g.fillStyle = '#fff'; g.fillText('?', 64, 70);
  });
  const boxes = [];
  for (const idx of boxRows) for (const lane of I.boxLanes) {
    const l = clampLane(idx, lane, 1.2); // rows on narrower bits squeeze in
    const pos = roadPoint(idx, l, 1.25);
    boxes.push({ pos, baseY: pos.y, idx, lane: l, hidden: 0 });
  }
  const boxMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.5, 1.5, 1.5),
    new THREE.MeshLambertMaterial({ map: boxTex, emissiveMap: boxTex, emissive: 0xffffff, emissiveIntensity: 0.55,
      transparent: true, opacity: 0.95 }),
    boxes.length);
  // Its bounding sphere is computed once, from whatever the instances are at the first draw (the boot
  // warm-up, all at the origin), so culling would hide every box away from there. 1 draw call: never cull.
  boxMesh.frustumCulled = false;
  trackRoot.add(boxMesh);

  // Boost pads: chevrons scrolling toward the driving direction
  const padTex = canvasTex(64, 128, (g) => {
    g.fillStyle = '#ff8a00'; g.fillRect(0, 0, 64, 128);
    g.strokeStyle = '#ffe14a'; g.lineWidth = 12; g.lineJoin = 'miter';
    for (const y of [20, 84]) { g.beginPath(); g.moveTo(6, y + 34); g.lineTo(32, y); g.lineTo(58, y + 34); g.stroke(); }
  });
  padTex.wrapS = padTex.wrapT = THREE.RepeatWrapping;
  padTex.repeat.set(1, 2);
  const padMat = new THREE.MeshBasicMaterial({ map: padTex });
  const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const pads = padSpots.map(([idx, lane]) => {
    const geo = new THREE.PlaneGeometry(I.padWidth, I.padLength);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, padMat);
    mesh.position.copy(roadPoint(idx, lane, 0.08));
    mesh.quaternion.setFromRotationMatrix(roadBasis(idx)).multiply(flip); // on the slope; chevrons point forward
    trackRoot.add(mesh);
    return { idx, lane, len: Math.ceil(I.padLength / track.spacing) };
  });

  // Banana + shell templates (baked to one mesh each; instances share geometry + material). Scaled per kind
  // (I.modelScale) with the bottom at y 0 (they sit on the road), a faint glow of their colour and a dark
  // outline (a slightly bigger back-face copy) so they stand out on grey asphalt at speed.
  const template = (kind, glow, build) => {
    const g = new THREE.Group();
    build((geo, color, x, y, z) => {
      const m = new THREE.Mesh(geo, lambert(color));
      m.position.set(x, y, z);
      g.add(m);
      return m;
    });
    const mesh = bakeMeshes(g);
    mesh.material.flatShading = false; // smooth, like the characters (faceted read as low definition)
    const geo = mesh.geometry, sc = I.modelScale[kind] ?? 1;
    geo.computeBoundingBox();
    geo.translate(0, -geo.boundingBox.min.y, 0);
    geo.scale(sc, sc, sc);
    mesh.material.emissive = new THREE.Color(glow);
    geo.computeBoundingBox();
    const box = geo.boundingBox, size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    const line = 0.05; // outline thickness (m)
    const outline = geo.clone().translate(-mid.x, -mid.y, -mid.z)
      .scale(1 + (2 * line) / size.x, 1 + (2 * line) / size.y, 1 + (2 * line) / size.z).translate(mid.x, mid.y, mid.z);
    return { geo, mat: mesh.material, outline };
  };
  // Banana peel (build 36; the old arch of a banana looked stuck into the asphalt): a short upright stub with three
  // peel flaps splayed out flat on the road, brown tips, so it clearly sits on top of the road
  const banana = template('banana', 0x3a2c00, (add) => {
    const stub = new THREE.CapsuleGeometry(0.11, 0.2, 6, 16);
    add(stub, 0xffe38a, 0, 0.27, 0);                                              // the fruit, warm cream
    add(new THREE.CylinderGeometry(0.03, 0.05, 0.1, 10), 0x5a3a12, 0, 0.5, 0);    // stem
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.3;
      const flap = sweep([[0, 0.34, 0], [0.13, 0.3, 0], [0.26, 0.16, 0], [0.36, 0.05, 0], [0.42, 0.03, 0]],
        (u) => 0.075 * (1 - 0.45 * u) + 0.01, 20, 12);
      flap.scale(1, 0.55, 1.9); // flat and wide
      add(flap, 0xffd23a, 0, 0, 0).rotation.y = a;
      add(new THREE.SphereGeometry(0.045, 10, 8), 0x6b4a1a, Math.cos(a) * 0.42, 0.04, -Math.sin(a) * 0.42); // tip
    }
  });
  const shell = (kind, color, glow) => template(kind, glow, (add) => {
    add(new THREE.SphereGeometry(0.42, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), color, 0, 0.12, 0);
    add(new THREE.TorusGeometry(0.42, 0.07, 10, 32), 0xffffff, 0, 0.1, 0).rotation.x = Math.PI / 2; // rounded rim
  });
  const mushroom = template('mushroom', 0x2a0806, (add) => {
    add(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 16), 0xfff1d6, 0, 0.15, 0);
    add(new THREE.SphereGeometry(0.34, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0xe8322f, 0, 0.28, 0);
    for (const [x, z] of [[0.18, 0.12], [-0.16, 0.14], [0, -0.22]]) add(new THREE.SphereGeometry(0.08, 10, 6), 0xffffff, x, 0.5, z);
  });
  const blue = template('blue', 0x0a2266, (add) => {
    add(new THREE.SphereGeometry(0.5, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0x2a6bff, 0, 0.12, 0);
    add(new THREE.TorusGeometry(0.5, 0.075, 10, 32), 0xffffff, 0, 0.1, 0).rotation.x = Math.PI / 2;
    for (const x of [0.55, -0.55]) add(new THREE.BoxGeometry(0.7, 0.06, 0.35), 0xffffff, x * 1.4, 0.45, 0).rotation.z = x * 0.6;
  });
  const bomb = template('bomb', 0x200808, (add) => {
    add(new THREE.SphereGeometry(0.4, 24, 16), 0x15151c, 0, 0.42, 0);                  // black body
    add(new THREE.TorusGeometry(0.405, 0.055, 10, 32), 0xff3b1f, 0, 0.42, 0).rotation.x = Math.PI / 2; // red warning band
    add(new THREE.SphereGeometry(0.09, 10, 8), 0x8a8a9a, 0.17, 0.62, 0.26);              // shine
    add(new THREE.CylinderGeometry(0.11, 0.14, 0.14, 12), 0x8a8a96, 0, 0.84, 0);         // cap
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 6), 0xe8d8a0, 0.06, 1.0, 0).rotation.z = -0.4; // fuse
    add(new THREE.SphereGeometry(0.1, 10, 8), 0xffd21a, 0.14, 1.13, 0);                  // spark
  });
  return {
    boxes, boxMesh, pads, padTex,
    models: { banana, green: shell('green', 0x2fbf4a, 0x0d4a1a), red: shell('red', 0xe8322f, 0x5a0c0b), mushroom, blue, bomb },
  };
}

// ---------- 1e. Game state, HUD refs, minimap ----------
// Race-wide state. Per-kart driving/lap state lives on each kart (see freshDriveState).
const state = {
  phase: 'menu',          // menu | countdown | race | finished (= the player has finished)
  countdown: 0,
  raceTime: 0,
  lapStart: 0,            // player's lap timing
  bestLap: Infinity,
  finishedCount: 0,
  resultsShown: false,
  paused: false,
  wrongT: 0,             // seconds spent driving the wrong way
};

let viewFov = 66; // the chase camera's base vertical FOV (wider in the vertical view)
const input = { left: false, right: false, axis: 0, gas: false, brake: false, reset: false, item: false, itemAlt: false }; // axis: joystick -1..1

const hud = {
  lap: $('lap'), time: $('time'), best: $('best'), speed: $('speed'),
  place: $('place'), placeNum: $('place-num'), placeSuffix: $('place-suffix'), placeOf: $('place-of'),
  countdown: $('countdown'), message: $('message'),
  driftFill: $('drift-fill'), overlay: $('overlay'),
  menuScreen: $('menu-screen'), resultsScreen: $('results-screen'), menuRecord: $('menu-record'),
  resPlace: $('res-place'), resTime: $('res-time'), resLap: $('res-lap'), resRecord: $('res-record'),
  standings: $('standings'), confetti: $('confetti'),
  item: $('btn-item'), itemB: $('btn-item-b'), warn: $('warn'), perf: $('perf'), split: $('split'), wrongway: $('wrongway'), tip: $('tip'),
  pauseScreen: $('pause-screen'), settingsScreen: $('settings-screen'), debugScreen: $('debug-screen'), helpScreen: $('help-screen'), knob: $('stick-knob'), pickScreen: $('pick-screen'),
  helloScreen: $('hello-screen'),
};

const minimap = buildMinimap();

function buildMinimap() {
  const el = $('minimap');
  const ctx = el.getContext('2d');
  const map = { el, ctx, path: new Path2D(), size: 0, scale: 1, ox: 0, oz: 0, minX: 0, minZ: 0 };

  // on resize and on every track change
  map.layout = () => {
    if (!track) return;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of track.samples) {
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z);
    }
    Object.assign(map, { minX, minZ });
    const dpr = Math.min(window.devicePixelRatio, 2);
    const cssSize = el.clientWidth || 110;
    el.width = el.height = cssSize * dpr;
    map.size = el.width;
    const pad = map.size * 0.12;
    map.scale = (map.size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    map.ox = pad + ((map.size - pad * 2) - (maxX - minX) * map.scale) / 2;
    map.oz = pad + ((map.size - pad * 2) - (maxZ - minZ) * map.scale) / 2;
    map.path = new Path2D();
    track.samples.forEach((s, i) => {
      const [x, y] = map.project(s.x, s.z);
      i === 0 ? map.path.moveTo(x, y) : map.path.lineTo(x, y);
    });
    map.path.closePath();
  };
  map.project = (x, z) => [map.ox + (x - map.minX) * map.scale, map.oz + (z - map.minZ) * map.scale];
  return map;
}

// Menu buttons fire on pointer release over the button, not on 'click': iOS sometimes drops the
// click it synthesises from a tap (slight finger roll, page busy, hover heuristics), so START
// needed a second tap. detail === 0 clicks (keyboard, tests calling .click()) still work.
// A finger that travelled more than 10 px is a swipe (the picker strips scroll), not a tap.
function onTap(el, fn) {
  let down = null, x0 = 0, y0 = 0;
  el.addEventListener('pointerdown', (e) => { down = e.pointerId; x0 = e.clientX; y0 = e.clientY; });
  el.addEventListener('pointerup', (e) => {
    if (down !== e.pointerId) return;
    down = null;
    if (Math.hypot(e.clientX - x0, e.clientY - y0) > 10) return;
    const r = el.getBoundingClientRect();
    if (e.clientX >= r.left - 12 && e.clientX <= r.right + 12 && e.clientY >= r.top - 12 && e.clientY <= r.bottom + 12) fn();
  });
  el.addEventListener('pointercancel', () => { down = null; });
  el.addEventListener('click', (e) => { if (e.detail === 0) fn(); });
}

/* ==========================================================================
 * 2. CONTROL LISTENERS (multi-touch via Pointer Events)
 * ========================================================================== */
initControls();

function initControls() {
  // --- Slide from GAS onto ITEM: fires the item while the gas stays held (GAS keeps the captured pointer) ---
  function slideToItem(el) {
    const over = new Set(); // "pointerId:button" pairs currently over a throw button, so each slide-on fires once
    el.addEventListener('pointermove', (e) => {
      for (const [btn, key] of [[hud.item, 'item'], [hud.itemB, 'itemAlt']]) {
        if (btn.hidden) continue;
        const r = btn.getBoundingClientRect(), pad = 8, id = e.pointerId + key;
        const inside = e.clientX > r.left - pad && e.clientX < r.right + pad && e.clientY > r.top - pad && e.clientY < r.bottom + pad;
        if (inside && !over.has(id)) {
          over.add(id);
          input[key] = true;
          btn.classList.add('pressed');
          setTimeout(() => btn.classList.remove('pressed'), 120);
        } else if (!inside) over.delete(id);
      }
    });
    ['pointerup', 'pointercancel'].forEach((t) => el.addEventListener(t, (e) => { over.delete(e.pointerId + 'item'); over.delete(e.pointerId + 'itemAlt'); }));
  }

  // --- Hold buttons (each tracks its own set of pointers, so multi-touch works) ---
  const bindHold = (el, key) => {
    const ids = new Set();
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ids.add(e.pointerId);
      el.setPointerCapture(e.pointerId);
      input[key] = true;
      el.classList.add('pressed');
    });
    const release = (e) => {
      ids.delete(e.pointerId);
      if (ids.size === 0) { input[key] = false; el.classList.remove('pressed'); }
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => el.addEventListener(t, release));
  };
  bindHold($('btn-left'), 'left');
  bindHold($('btn-right'), 'right');

  // --- Joystick (Settings -> Joystick, replaces the arrows): analogue steering from how far the knob is
  // pushed sideways; up/down does nothing. One finger at a time; the knob springs back on release.
  const stickZone = $('joystick'), stickBase = $('stick-base');
  let stickId = null;
  const moveStick = (e) => {
    const r = stickBase.getBoundingClientRect();
    let sx = e.clientX - (r.left + r.width / 2), sy = e.clientY - (r.top + r.height / 2);
    if (app.classList.contains('rotated')) [sx, sy] = app.classList.contains('flipped') ? [-sy, sx] : [sy, -sx]; // portrait: the game is turned 90deg
    const radius = stickBase.offsetWidth / 2;
    const lim = Math.min(1, radius / (Math.hypot(sx, sy) || 1));
    sx *= lim; sy *= lim;
    hud.knob.style.transform = `translate(${sx}px, ${sy}px)`;
    const C = CFG.controls, x = sx / radius;
    input.axis = Math.sign(x) * clamp((Math.abs(x) - C.stickDeadZone) / (C.stickFull - C.stickDeadZone), 0, 1);
  };
  stickZone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (stickId !== null) return;
    stickId = e.pointerId;
    try { stickZone.setPointerCapture(e.pointerId); } catch { /* synthetic pointer (tests) */ }
    hud.knob.classList.add('held');
    moveStick(e);
  });
  stickZone.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) moveStick(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => stickZone.addEventListener(t, (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    releaseStick();
  }));
  // --- Vertical view: SCREEN HALVES. Touch the left half to steer left, the right half to steer right; the further from the
  // centre line, the harder the turn (dead zone near the line, full lock at 75% of the way to the edge). Sliding the thumb steers live.
  const vz = $('vsteer'), vl = $('vl'), vr = $('vr');
  let vId = null;
  const vSteer = (e) => {
    const r = vz.getBoundingClientRect(), x = (e.clientX - r.left - r.width / 2) / (r.width / 2), C = CFG.controls;
    input.axis = Math.sign(x) * clamp((Math.abs(x) - 0.06) / (0.75 - 0.06), 0, 1);
    vl.style.opacity = input.axis < 0 ? 0.15 + -input.axis * 0.4 : 0;
    vr.style.opacity = input.axis > 0 ? 0.15 + input.axis * 0.4 : 0;
  };
  vz.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (vId !== null) return;
    vId = e.pointerId;
    try { vz.setPointerCapture(e.pointerId); } catch { /* synthetic pointer (tests) */ }
    vSteer(e);
  });
  vz.addEventListener('pointermove', (e) => { if (e.pointerId === vId) vSteer(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => vz.addEventListener(t, (e) => {
    if (e.pointerId !== vId) return;
    vId = null; releaseStick();
  }));
  for (const b of $('view-pick').children) onTap(b, () => { sound.click(); setView(b.dataset.view === '1'); });
  setView(savedView(), false);
  bindHold($('btn-gas'), 'gas');
  slideToItem($('btn-gas'));
  bindHold($('btn-brake'), 'brake');

  $('btn-reset').addEventListener('pointerdown', (e) => { e.preventDefault(); input.reset = true; });
  hud.item.addEventListener('pointerdown', (e) => { e.preventDefault(); input.item = true; hud.item.classList.add('pressed'); });
  hud.itemB.addEventListener('pointerdown', (e) => { e.preventDefault(); input.itemAlt = true; hud.itemB.classList.add('pressed'); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => hud.itemB.addEventListener(t, () => hud.itemB.classList.remove('pressed')));
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => hud.item.addEventListener(t, () => hud.item.classList.remove('pressed')));

  for (const row of document.querySelectorAll('.setup [data-pick]')) onTap(row, () => { sound.click(); openPicker(row.dataset.pick); });
  onTap($('btn-pick-done'), () => { sound.click(); showMenu(); });
  buildKeyboard();
  onTap($('hello-edit'), () => { sound.click(); showHello(); });
  onTap($('btn-start'), () => { dbgClear(); startRace(); }); // the normal start is never a debug race
  onTap($('btn-again'), startRace);
  onTap($('btn-menu'), () => { sound.click(); showMenu(); });
  $('btn-pause').addEventListener('pointerdown', (e) => { e.preventDefault(); pauseGame(); });
  onTap($('btn-resume'), resumeGame);
  onTap($('btn-restart'), () => { state.paused = false; startRace(); });
  onTap($('btn-quit'), () => { state.paused = false; sound.unlock(); showMenu(); });
  document.querySelectorAll('.btn-settings').forEach((b) => onTap(b, () => { sound.click(); showSettings(); }));
  for (const b of $('steer-pick').children) onTap(b, () => { sound.click(); setSteering(b.dataset.steer); });
  for (const b of $('flip-pick').children) onTap(b, () => { sound.click(); setFlip(b.dataset.flip === '1'); });
  setFlip(savedFlip(), false);
  document.querySelectorAll('.btn-help').forEach((b) => onTap(b, () => {
    sound.click();
    helpFrom = state.paused ? hud.pauseScreen : hud.menuScreen;
    showOverlay(hud.helpScreen);
  }));
  onTap($('btn-help-back'), () => { sound.click(); showOverlay(helpFrom); });
  onTap($('btn-settings-back'), () => { sound.click(); showOverlay(settingsFrom); });
  setSteering(savedSteering(), false);
  for (const pick of document.querySelectorAll('.vol-pick')) {
    for (const b of pick.children) onTap(b, () => { setVolume(pick.dataset.bus, +b.dataset.vol); sound.click(); });
    setVolume(pick.dataset.bus, savedVolume(pick.dataset.bus), false);
  }

  // --- Sound: on/off in Settings (sound.js remembers it); any touch re-wakes audio that iOS suspended (calls, app switch)
  const showMute = () => {
    for (const b of $('mute-pick').children) b.classList.toggle('on', (b.dataset.muted === '1') === sound.muted);
    $('volume-row').classList.toggle('dim', sound.muted); // levels don't matter while everything is off
  };
  for (const b of $('mute-pick').children) onTap(b, () => { sound.setMuted(b.dataset.muted === '1'); showMute(); sound.click(); });
  showMute();
  // (also the first tap on the title screen, which starts its music: iOS allows no sound before a tap)
  document.addEventListener('pointerdown', () => { if (!state.paused) sound.unlock(); });

  // --- Block browser gestures (scroll, pinch, double-tap zoom, long-press menu) ---
  const block = (e) => e.preventDefault();
  document.addEventListener('touchmove', (e) => { if (!e.target.closest?.('.pick-list, #debug-card, #settings-screen .settings-card, .help-card, #results-screen')) e.preventDefault(); }, { passive: false });
  // split stage: drag sideways to turn the 3D kart (it swings gently by itself again after a few seconds)
  const stageEl = $('pick-stage');
  stageEl.addEventListener('pointerdown', (e) => {
    stage.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, rot: stage.rot };
    stageEl.setPointerCapture?.(e.pointerId);
  });
  stageEl.addEventListener('pointermove', (e) => {
    if (stage.drag?.id !== e.pointerId) return;
    // #app is turned 90deg in portrait: the screen's vertical is the game's horizontal there
    const dx = app.classList.contains('rotated') ? (e.clientY - stage.drag.y) * (app.classList.contains('flipped') ? -1 : 1) : e.clientX - stage.drag.x;
    stage.rot = stage.drag.rot + (dx / Math.max(1, stageEl.offsetWidth)) * Math.PI * 1.6;
  });
  const endDrag = (e) => { if (stage.drag?.id === e.pointerId) { stage.drag = null; stage.idle = 0; } };
  stageEl.addEventListener('pointerup', endDrag);
  stageEl.addEventListener('pointercancel', endDrag);
  document.addEventListener('gesturestart', block);
  document.addEventListener('gesturechange', block);
  document.addEventListener('gestureend', block);
  // iOS ignores user-scalable=no: cancelling touches on the controls stops double-tap zoom and
  // the long-press magnifier (Pointer Events still fire, so the buttons keep working).
  $('controls').addEventListener('touchstart', block, { passive: false });
  $('controls').addEventListener('touchend', block, { passive: false });
  document.addEventListener('contextmenu', block);
  document.addEventListener('dblclick', block);

  // --- Optional keyboard fallback for desktop testing only ---
  const keys = new Set();
  const updateKeys = () => {
    input.gas = keys.has('ArrowUp') || keys.has('KeyW');
    input.brake = keys.has('ArrowDown') || keys.has('KeyS');
    input.left = keys.has('ArrowLeft') || keys.has('KeyA');
    input.right = keys.has('ArrowRight') || keys.has('KeyD');
  };
  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input')) return; // typing on the hello screen
    keys.add(e.code); updateKeys();
    if (e.code === 'KeyR') input.reset = true;
    if (e.code === 'Space' || e.code === 'KeyE') input.item = true;
    if (e.code === 'KeyQ') input.itemAlt = true;
    if (e.code === 'Escape' || e.code === 'KeyP') (state.paused ? resumeGame : pauseGame)();
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.code); updateKeys(); });

  // --- Viewport ---
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 200));

  // --- Haptic bump on wall / kart hits ---
  kart.body.addEventListener('collide', (e) => {
    if (e.body.material !== physMats.wall && e.body.material !== physMats.chassis) return;
    const impact = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (impact > 2) sound.bump(impact / 10);
    if (e.body.material === physMats.chassis && impact > 2 && !(kart.kbumpT > state.raceTime)) { // log kart-to-kart contacts (was it a bullet / star kart that did not count as a hit?)
      kart.kbumpT = state.raceTime + 0.5;
      const o = karts.find((q) => q.body === e.body);
      teleEvent('kbump', kart, { with: o ? karts.indexOf(o) : -1, imp: +impact.toFixed(1), bullet: o?.bullet > 0, star: o?.star > 0, spin: o?.spin > 0, mine: kart.spin > 0 });
    }
    if (impact > 3 && navigator.vibrate) navigator.vibrate(Math.min(60, impact * 4));
  });
}

/** The game is always laid out landscape; in portrait the #app container is rotated 90deg. */
function onResize() {
  // (iOS portrait strip, build 38: the phone measured 100lvh = 844 but iOS shows only innerHeight 797 of the
  // web view, so the page can't draw there: size to innerHeight, or the game's far edge gets cut off)
  const vw = window.innerWidth, vh = window.innerHeight;
  const vertical = app.classList.contains('vertical'); // Settings -> VIEW Vertical: laid out upright, not turned 90deg
  const rotated = !vertical && vh > vw;
  const w = rotated ? vh : vw;
  const h = rotated ? vw : vh;
  app.classList.toggle('rotated', rotated);
  // portrait is narrow: widen the vertical FOV so the road isn't a keyhole (about 72deg across, at most 100 up and down)
  viewFov = vertical ? clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(36)) / (w / h))), CFG.camera.fov, 100) : CFG.camera.fov;
  app.style.width = `${w}px`;
  app.style.height = `${h}px`;
  app.style.setProperty('--app-h', `${h}px`);
  renderer.setSize(w, h);
  sizeBlurTarget();
  layoutMirror(w);
  camera.aspect = w / h;
  if (camera.view?.enabled) camera.setViewOffset(w, h, lobbyShift, lobbyShiftY, w, h);
  camera.updateProjectionMatrix();
  minimap.layout();
  layoutLobby();
  sendViewport();
}

/** Diagnostic for the iOS portrait strip: the phone's viewport numbers go to the LAN server's telemetry log
 * (dev/telemetry/races.jsonl, a line with kind 'viewport'), once things have settled after a resize. */
let viewportT = 0;
function sendViewport() {
  if (location.protocol !== 'http:') return;
  clearTimeout(viewportT);
  viewportT = setTimeout(() => {
    const css = getComputedStyle(app), probe = $('vp-probe'), vv = window.visualViewport;
    const inset = (side) => { const d = document.createElement('div'); d.style.cssText = `position:fixed;visibility:hidden;height:env(safe-area-inset-${side})`; document.body.append(d); const h = d.offsetHeight; d.remove(); return h; };
    const v = {
      kind: 'viewport', build: VERSION_N, t: new Date().toISOString(), ua: navigator.userAgent, standalone: !!navigator.standalone,
      inner: [innerWidth, innerHeight], screen: [screen.width, screen.height], avail: [screen.availWidth, screen.availHeight],
      client: [document.documentElement.clientWidth, document.documentElement.clientHeight],
      visual: vv && [vv.width, vv.height, vv.offsetTop], lv: probe && [probe.offsetWidth, probe.offsetHeight],
      app: [app.offsetWidth, app.offsetHeight, app.classList.contains('rotated')], dpr: devicePixelRatio,
      inset: { top: inset('top'), bottom: inset('bottom'), left: inset('left'), right: inset('right') },
      orientation: screen.orientation?.type, appEdge: [css.getPropertyValue('--edge-l'), css.getPropertyValue('--edge-r')],
    };
    fetch('/telemetry', { method: 'POST', body: JSON.stringify(v) }).catch(() => {});
  }, 1500);
}

/* ==========================================================================
 * 3. GAME FLOW (race start, grid, laps, positions, reset)
 * ========================================================================== */
function startRace() {
  teleSend('restart'); // a race restarted from pause / results before the AIs were home
  const el = document.documentElement;
  if (el.requestFullscreen && !document.fullscreenElement) {
    el.requestFullscreen().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  }
  hud.overlay.classList.add('hidden');
  app.classList.remove('overlay-on');
  hud.confetti.replaceChildren();
  sound.unlock();
  sound.music(false);

  Object.assign(state, {
    phase: 'countdown', countdown: 3, raceTime: 0, lapStart: 0, finishedCount: 0, resultsShown: false,
    paused: false, wrongT: 0, gasFrom: null,
  });
  clearItems();
  fx.reset();
  sitOut++; // a different personality sits this one out (see castDrivers)
  try { localStorage.setItem(SITOUT_KEY, sitOut); } catch { /* storage blocked */ }
  castDrivers();
  placeOnGrid();
  dbgApplyStart();
  teleStart();
  camState.snap = true;
  showCountdown('3');
  sound.beep();
  if (!app.classList.contains('vertical')) showTip('Press GAS on "1" for a rocket start'); // no rocket start in the vertical view (auto-gas)
}

/** Staggered two-column grid behind the start line. The AIs line up in front; the player starts last. */
function placeOnGrid() {
  const G = CFG.grid;
  [...karts.slice(1), kart].forEach((k, slot) => {
    Object.assign(k, freshDriveState());
    k.ghost = 0;
    setGhost(k, false);
    const back = G.firstRow + Math.floor(slot / 2) * G.rowGap + (slot % 2) * G.rowGap * 0.5;
    const lane = slot % 2 ? -G.colOffset : G.colOffset;
    k.ai = k.isPlayer ? null : newAI(lane, k.style);
    k.topMult = 1;
    resetKart(k, track.N - Math.round(back / track.spacing), lane);
  });
  updatePlaces();
}

/** Puts a kart on the track at sample idx, `lane` metres left of the centre line, facing forward. */
/** Ghost after a respawn: no contact with other karts (walls and road still count). */
function setGhost(k, on) {
  if (!!k.ghosted !== on) teleEvent('ghost', k, { on }); // build 36: to chase the respawn ghost bug
  k.body.collisionFilterMask = on ? -1 & ~KART_GROUP : -1;
  k.ghosted = on;
}

function resetKart(k, idx, lane = 0) {
  const body = k.body;
  const p = roadPoint(idx, lane, 1.2, resetP);
  body.position.set(p.x, p.y, p.z);
  resetQ.setFromRotationMatrix(roadBasis(idx, resetM)); // level with the road: slope and banking
  body.quaternion.set(resetQ.x, resetQ.y, resetQ.z, resetQ.w);
  body.velocity.setZero();
  body.angularVelocity.setZero();
  // teleport: no interpolating from the old spot
  body.previousPosition.copy(body.position);
  body.interpolatedPosition.copy(body.position);
  body.previousQuaternion.copy(body.quaternion);
  body.interpolatedQuaternion.copy(body.quaternion);
  Object.assign(k, { trackIdx: idx, flipTimer: 0, fallT: 0, driftCharge: 0, boost: 0, steerSmooth: 0, spin: 0, burn: 0 });
}

const resetP = new THREE.Vector3(), resetQ = new THREE.Quaternion(), resetM = new THREE.Matrix4();

function updateGameFlow(dt) {
  updateWrongWay(dt);
  if (state.phase === 'countdown') {
    const prev = Math.ceil(state.countdown);
    state.countdown -= dt;
    // remember when GAS went down (time left on the countdown); releasing it forgets
    if (!input.gas) state.gasFrom = null;
    else if (state.gasFrom === null) state.gasFrom = state.countdown;
    const now = Math.ceil(state.countdown);
    if (now !== prev && now > 0) { showCountdown(String(now)); sound.beep(); }
    if (state.countdown <= 0) {
      state.phase = 'race';
      showCountdown('GO!');
      sound.go();
      sound.music('race');
      rocketStart();
    }
  }

  const racing = state.phase === 'race' || state.phase === 'finished';
  if (racing) state.raceTime += dt;
  for (const k of karts) updateKartProgress(k, dt, racing);
  updatePlaces(dt);
  updateItems(dt, racing);
  if (racing) teleSample();
  input.reset = false;
  input.item = false;
  input.itemAlt = false;
}

function updateKartProgress(k, dt, racing) {
  const N = track.N;
  const prevIdx = k.trackIdx;
  const idx = nearestTrackIndex(k.body.position, prevIdx);
  k.trackIdx = idx;

  if (racing && !k.finished) {
    if (Math.abs(idx - N / 2) < N * 0.1) k.halfway = true;
    const crossedForward = prevIdx > N * 0.9 && idx < N * 0.1;
    const crossedBackward = prevIdx < N * 0.1 && idx > N * 0.9;
    if (crossedBackward) k.halfway = false;
    if (crossedForward && k.halfway) completeLap(k);
  }
  // Distance raced in samples. Before the halfway mark, the back half of the loop counts as
  // "behind the line" (the grid at the start, or after crossing it backwards).
  // ...plus how far past that sample it is (-0.5..0.5): whole samples made side-by-side karts swap places
  // back and forth every frame
  const t = track.tangents[idx], s = track.samples[idx];
  const frac = clamp(((k.body.position.x - s.x) * t.x + (k.body.position.z - s.z) * t.z) / track.spacing, -0.5, 0.5);
  k.progress = (k.lap - 1) * N + (k.halfway || idx < N / 2 ? idx : idx - N) + frac;

  // Auto-recover when flipped or beached (no wheel touching anything), on the reset button,
  // or when the AI gives up on getting unstuck
  const up = k.body.quaternion.vmult(LOCAL_UP, tmpVec);
  // Fewer than 3 wheels down for a while = beached (e.g. perched on a wall with the rear in the air)
  const wheelsDown = k.vehicle.wheelInfos.filter((w) => w.raycastResult.hasHit).length;
  k.flipTimer = up.y < 0.3 || wheelsDown < 3 ? k.flipTimer + dt : 0;
  // Off the road (over a rail, off a jump): well below the road surface for a moment
  const below = surfaceY(idx, clampLane(idx, lateral(idx, k.body.position), 0)) - k.body.position.y > 2.5;
  k.fallT = below ? k.fallT + dt : 0;
  // Ghost (after a respawn): solid again once its time is up and no kart is inside it
  if (k.ghost > 0) k.ghost = Math.max(0, k.ghost - dt);
  if (k.ghosted && k.ghost <= 0 &&
    !karts.some((o) => o !== k && o.body.position.distanceSquared(k.body.position) < 3.2 * 3.2)) setGhost(k, false);
  // On top of a rail or past it (user: "I was literally over a rail and it let me run over it"). Pressed
  // flat against a rail the kart's centre stays >= 0.8 m (its half width) inside the rail's road face, so a
  // centre within 0.2 m of that face can only be a kart riding on the rail or gone over: put it back.
  const lat = lateral(idx, k.body.position);
  const railFace = (lat > 0 ? track.wL[idx] : track.wR[idx]) + CFG.track.curb;
  k.railT = Math.abs(lat) > railFace - 0.2 && k.bullet <= 0 ? (k.railT || 0) + dt : 0;
  const onRail = k.railT > 0.3;
  // The player trying to get going (a pedal held) but stuck, e.g. nose into a rail on a slope where
  // reversing uphill barely moves: the AIs' watchdog does the same for them
  const trying = k.isPlayer && !k.ai && racing && !k.finished && k.spin <= 0 && (k.ctl.gas || input.brake);
  // ...a pedal released a moment ago still counts: tapping gas/brake alternately never filled the timer (22 s stuck, no reset)
  k.tryT = trying ? 1.5 : Math.max(0, (k.tryT || 0) - dt);
  k.stuckT = k.tryT > 0 && racing && Math.abs(k.speed) < CFG.kart.rescueSpeed ? (k.stuckT || 0) + dt : 0;
  const rescue = k.stuckT > CFG.kart.rescueTime;
  const wantsReset = (k.isPlayer && input.reset) || k.flipTimer > 1.5 || k.fallT > 0.6 || onRail || rescue || k.ai?.resetNow;
  if (wantsReset && state.phase !== 'menu') {
    k.lastReset = k.ai?.resetNow || (onRail ? 'rail' : k.fallT > 0.6 ? 'fell' : k.flipTimer > 1.5 ? `flip up=${up.y.toFixed(2)} wheels=${wheelsDown}` : rescue ? 'stuck' : 'button');
    k.stuckT = 0;
    if (state.phase !== 'countdown') teleEvent('reset', k, { why: k.lastReset });
    const lane = k.ai ? clampLane(k.trackIdx, track.line[k.trackIdx] * k.ai.lineUse + k.ai.lane) : 0;
    resetKart(k, k.trackIdx, lane);
    if (racing) { k.ghost = CFG.kart.ghostTime; setGhost(k, true); }
    if (k.ai) Object.assign(k.ai, { resetNow: false, stuckT: 0, backT: 0, wrongT: 0, watchT: 0, resets: k.ai.resets + 1 });
    if (k.isPlayer) camState.snap = true;
  }
}

function completeLap(k) {
  k.halfway = false;
  teleEvent('lap', k, { lap: k.lap });
  if (k.isPlayer) {
    const lapTime = state.raceTime - state.lapStart;
    showSplit(lapTime, state.bestLap);
    state.bestLap = Math.min(state.bestLap, lapTime);
    state.lapStart = state.raceTime;
    if (k.lap < CFG.laps) {
      const final = k.lap + 1 === CFG.laps;
      showMessage(final ? 'FINAL LAP!' : `LAP ${k.lap + 1}`);
      final ? sound.finalLap() : sound.lap();
    }
  }
  if (k.lap >= CFG.laps) finishKart(k);
  else k.lap++;
  if (k.ai) k.ai.bias = rand(-k.ai.style.bias, k.ai.style.bias); // a new favourite side each lap
}

function finishKart(k) {
  k.finished = true;
  k.finishTime = state.raceTime;
  k.place = ++state.finishedCount;
  teleEvent('finish', k, { place: k.place });
  if (karts.every((o) => o.finished)) teleSend('done');
  if (k.isPlayer) {
    state.phase = 'finished';
    k.ai = newAI(0); // the CPU drives the player's lap of honour
    showMessage(k.place === 1 ? 'YOU WIN!' : `FINISH! ${ordinal(k.place)}`);
    sound.music(false);
    sound.finish(k.place === 1);
    setTimeout(showResults, 1800);
  } else if (state.resultsShown) {
    showResults(); // refresh the table as the AIs come home
  }
}

/** Finished karts by finish time, then everyone else by distance raced. */
function updatePlaces(dt = 0) {
  const order = [...karts].sort((a, b) =>
    (b.finished - a.finished) || (a.finished ? a.finishTime - b.finishTime : b.progress - a.progress));
  order.forEach((k, i) => { k.place = i + 1; });
  updateShownPlace(dt);
}

/**
 * The place on the HUD: a new place has to hold for `PLACE_HOLD` s before it shows (passing a pack, the
 * order flickers for a moment), and the overtake sound plays at most every `OVERTAKE_GAP` s.
 */
const PLACE_HOLD = 0.35, OVERTAKE_GAP = 0.6;
function updateShownPlace(dt) {
  const p = kart.place;
  if (state.phase !== 'race' || kart.finished || !state.shownPlace) {
    Object.assign(state, { shownPlace: p, placeWant: p, placeHold: 0 });
    return;
  }
  if (p !== state.placeWant) Object.assign(state, { placeWant: p, placeHold: 0 });
  state.placeHold += dt;
  state.overtakeT = (state.overtakeT || 0) - dt;
  if (p !== state.shownPlace && state.placeHold >= PLACE_HOLD) {
    if (p < state.shownPlace && state.overtakeT <= 0) {
      sound.overtake();
      state.overtakeT = OVERTAKE_GAP;
    }
    state.shownPlace = p;
  }
}

// Personal bests survive restarts (per device), one { race, lap } per track. Storage can be unavailable
// (private mode): never required.
const RECORD_KEY = 'kartrush.records';
function loadRecords() {
  let all = {};
  try { all = JSON.parse(localStorage.getItem(RECORD_KEY)) || {}; } catch { /* storage blocked */ }
  if (typeof all.race === 'number') all = { meadow: { race: all.race, lap: all.lap } }; // from before tracks
  return all;
}
function saveRecords(all) {
  try { localStorage.setItem(RECORD_KEY, JSON.stringify(all)); } catch { /* storage blocked */ }
}

// The track picked on the title screen, remembered per device. ?track=<id> in the URL wins (tests).
const TRACK_KEY = 'kartrush.track';
function savedTrack() {
  let id = new URLSearchParams(location.search).get('track');
  if (!CFG.tracks[id]) try { id = localStorage.getItem(TRACK_KEY); } catch { /* storage blocked */ }
  return CFG.tracks[id] ? id : 'meadow';
}
function selectTrack(id) {
  if (track.id === id) return;
  try { localStorage.setItem(TRACK_KEY, id); } catch { /* storage blocked */ }
  loadTrack(id);
  placeOnGrid();
  camState.snap = true;
  warmUpShaders(); // the new track's materials, before the race needs them
}

/** Title screen. The karts sit on the grid behind it. */
function showMenu() {
  teleSend('left');
  Object.assign(state, { phase: 'menu', resultsShown: false });
  sound.music('menu');
  clearItems();
  fx.reset();
  placeOnGrid();
  camState.snap = true;
  hud.confetti.replaceChildren();
  refreshPickRows();
  if (!profile) return showHello(); // first launch: name + age before anything else
  $('hello-edit').hidden = false;
  requestAnimationFrame(layoutLobby);
  $('hello-edit').innerHTML = `Hi, ${escapeHtml(profile.name)}!${icon('pencil')}`;
  showOverlay(hud.menuScreen);
}

/** GAS pressed on the "1" and held through GO = boost; held since before "2" = stall. */
function rocketStart() {
  const K = CFG.kart, from = state.gasFrom;
  if (from === null) return;
  if (from <= K.rocketWindow) {
    kart.boost = K.rocketBoost;
    kart.rocketT = K.rocketBoost; // this boost keeps the gentle push (K.rocketAccel)
    showMessage('ROCKET START!');
    sound.boost();
  } else if (from > K.rocketEarly) {
    kart.stall = K.stallTime;
    showMessage('TOO EARLY!');
    sound.stall();
  }
}

/** WRONG WAY after 1 s of facing and moving backwards along the track (reversing is fine). */
function updateWrongWay(dt) {
  const t = track.tangents[kart.trackIdx];
  const fwd = kart.body.quaternion.vmult(LOCAL_FWD, wrongFwd), v = kart.body.velocity;
  const backwards = state.phase === 'race' && !kart.finished && kart.spin <= 0 &&
    fwd.x * t.x + fwd.z * t.z < -0.5 && v.x * t.x + v.z * t.z < -2;
  state.wrongT = backwards ? state.wrongT + dt : 0;
  const show = state.wrongT > 1;
  if (hud.wrongway.hidden === show) hud.wrongway.hidden = !show;
}
const wrongFwd = new CANNON.Vec3();

// ---------- Player profile (per device): name + age, asked once on the hello screen; EDIT from the title ----------
const PROFILE_KEY = 'kartrush.profile';
function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY));
    if (typeof p?.name === 'string' && p.name && Number.isInteger(p.age)) return p;
  } catch { /* storage blocked or bad JSON */ }
  return null;
}
let profile = loadProfile(); // null until the hello screen is filled in (kept in memory if storage is blocked)
function showHello() {
  $('hello-name').value = profile?.name ?? '';
  $('hello-age').value = profile?.age ?? '';
  $('hello-error').textContent = '';
  showOverlay(hud.helloScreen);
  setField(profile ? 'hello-age' : 'hello-name');
}
function submitHello() {
  const name = $('hello-name').value.trim().replace(/\s+/g, ' '), age = parseInt($('hello-age').value, 10);
  const error = !name ? 'Type your name' : !(age >= 3 && age <= 120) ? 'Type your age (a number)' : '';
  $('hello-error').textContent = error;
  if (error) { setField(name ? 'hello-age' : 'hello-name'); return; }
  sound.click();
  profile = { name, age };
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* storage blocked */ }
  showMenu();
}

/* In-game keyboard (build 38): with portrait lock the game is drawn sideways but iOS opens its keyboard upright,
 * so the hello fields are readonly and typed into from #kbd (letters for the name, digits for the age). A tap on
 * a field picks it; a physical keyboard works too while the screen is up. */
const kbdField = () => $('kbd').dataset.field || 'hello-name'; // (state on the element: buildKeyboard runs before this line)
function setField(id) {
  $('kbd').dataset.field = id;
  for (const f of ['hello-name', 'hello-age']) $(f).classList.toggle('active', f === id);
  $('kbd').classList.toggle('digits', id === 'hello-age');
  const mode = id === 'hello-age' ? 'digits' : 'letters';
  for (const row of $('kbd').children) row.hidden = row.dataset.mode !== mode;
}
function typeKey(k) {
  const el = $(kbdField());
  if (k === 'back') el.value = el.value.slice(0, -1);
  else if (k === 'next') return setField(kbdField() === 'hello-name' ? 'hello-age' : 'hello-name');
  else if (el.value.length < el.maxLength) {
    if (kbdField() === 'hello-age') { if (/\d/.test(k)) el.value += k; }
    else if (k === ' ') { if (el.value && !el.value.endsWith(' ')) el.value += ' '; }
    else el.value += !el.value || el.value.endsWith(' ') ? k.toUpperCase() : k.toLowerCase(); // Name Case
  }
  $('hello-error').textContent = '';
}
function buildKeyboard() {
  const kbd = $('kbd');
  const key = (label, k, cls = '') => `<button type="button" class="kbd-key ${cls}" data-k="${k}" aria-label="${k === 'back' ? 'Delete' : k === ' ' ? 'Space' : k === 'next' ? 'Next field' : label}">${label}</button>`;
  const letters = (str) => [...str].map((c) => key(c, c)).join('');
  kbd.innerHTML = [
    ['letters', letters('QWERTYUIOP')],
    ['letters', letters('ASDFGHJKLÑ')],
    ['letters', letters('ZXCVBNM') + key(icon('back'), 'back', 'mid')],
    ['letters', key('123', 'next', 'mid') + key('space', ' ', 'wide')],
    // digits: a 3x3 pad + ABC 0 delete, 4 rows like the letters so the fields above never move
    ['digits', letters('123')],
    ['digits', letters('456')],
    ['digits', letters('789')],
    ['digits', key('ABC', 'next') + key('0', '0') + key(icon('back'), 'back')],
  ].map(([mode, html]) => `<div class="kbd-row" data-mode="${mode}">${html}</div>`).join('');
  // keys react on pointerdown (typing has to feel instant); LET'S RACE is a normal tap
  for (const b of kbd.querySelectorAll('.kbd-key')) {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('down'); typeKey(b.dataset.k); sound.click(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => b.classList.remove('down'));
  }
  onTap($('btn-hello'), submitHello);
  for (const f of ['hello-name', 'hello-age']) onTap($(f), () => setField(f));
  document.addEventListener('keydown', (e) => {
    if (hud.helloScreen.hidden) return;
    if (e.key === 'Enter') { e.preventDefault(); kbdField() === 'hello-name' ? typeKey('next') : submitHello(); }
    else if (e.key === 'Backspace') { e.preventDefault(); typeKey('back'); }
    else if (e.key === 'Tab') { e.preventDefault(); typeKey('next'); }
    else if (e.key.length === 1 && /[\p{L}\d ]/u.test(e.key)) typeKey(e.key);
  });
  setField('hello-name');
}

// ---------- Title screen picks (per device): track, driver (karts[0] races as them), kart paint ----------
const DRIVER_KEY = 'kartrush.driver', PAINT_KEY = 'kartrush.paint';
function savedPick(key, list) {
  let v = null;
  try { v = localStorage.getItem(key); } catch { /* storage blocked */ }
  return list.some((o) => o.name === v) ? v : list[0].name;
}
const picks = { driver: savedPick(DRIVER_KEY, CFG.racers), paint: savedPick(PAINT_KEY, CFG.paints) };
function playerDriver() { return CFG.racers.find((r) => r.name === picks.driver); }
function playerColors(paint = picks.paint) {
  const d = playerDriver(), p = CFG.paints.find((o) => o.name === paint).colors;
  return kartColors(p ? [p[0], p[1], d.colors[2]] : d.colors, d.look);
}

/** Side view of a kart (colours as kartColors), standing on a faint studio floor so dark paints still read. */
function kartSvg([body, accent, suit, helmet = 0xffffff, visor = 0x1c2340], driver = playerDriver()) {
  const [b, a, d, h, v] = [body, accent, suit, helmet, visor].map(cssHex);
  const rider = driverKartArt(driver) ?? `<rect x="28" y="11" width="11" height="12" rx="3" fill="${d}"/>
    <circle cx="34" cy="8" r="6.5" fill="${h}" stroke="#fff" stroke-opacity="0.3" stroke-width="0.6"/><rect x="35" y="6" width="6.5" height="3.5" rx="1.5" fill="${v}"/>`;
  return `<svg class="kart-art" viewBox="0 0 72 46" aria-hidden="true">
    <ellipse cx="36" cy="42" rx="33" ry="3.2" fill="#fff" opacity="0.13"/>
    <rect x="3" y="9" width="15" height="4" rx="1.5" fill="${a}" stroke="#fff" stroke-opacity="0.25" stroke-width="0.6"/><rect x="9" y="12" width="3" height="10" fill="#555"/>
    <path d="M8 22 H50 L64 25 Q67 26 67 29 V32 H6 Q4 32 4 29 V25 Q4 22 8 22 Z" fill="${b}" stroke="#fff" stroke-opacity="0.3" stroke-width="0.7"/>
    <rect x="22" y="20" width="22" height="7" rx="2" fill="${a}"/>
    ${rider}
    <rect x="62" y="29" width="7" height="3" rx="1" fill="#333"/>
    <circle cx="15" cy="34" r="7.5" fill="#222"/><circle cx="15" cy="34" r="3" fill="#888"/>
    <circle cx="55" cy="35" r="6.5" fill="#222"/><circle cx="55" cy="35" r="2.6" fill="#888"/>
  </svg>`;
}

/** Head-and-shoulders avatar: the driver's own (drivers.js), else the generic helmet from their look (suit,
 * helmet, visor and helmet mark) until that driver gets a character. */
function driverSvg(r) {
  const own = driverAvatar(r);
  if (own) return own;
  const L = r.look, [h, v, m, suit] = [L.helmet, L.visor, L.markColor, r.colors[2]].map(cssHex);
  const mark = {
    stripe: `<rect x="21.5" y="7.5" width="5" height="12" rx="1.5" fill="${m}"/>`,
    twin: `<rect x="17" y="8.5" width="3.2" height="11" rx="1.2" fill="${m}"/><rect x="27.8" y="8.5" width="3.2" height="11" rx="1.2" fill="${m}"/>`,
    moon: `<circle cx="18" cy="13" r="4.5" fill="${m}"/><circle cx="20" cy="12" r="4" fill="${h}"/>`,
    bolt: `<path d="M26 6.5 L19 14.5 H23.5 L21 20.5 L29 12 H24.5 Z" fill="${m}"/>`,
    fin: `<path d="M18 9.5 L25 1.5 L29 9.5 Z" fill="${h}" stroke="${m}" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M15 18 l2 2 l2-2 l2 2 l2-2" fill="none" stroke="${m}" stroke-width="1.2"/>`,
    dots: `<circle cx="18" cy="12" r="2" fill="${m}"/><circle cx="24" cy="9" r="2" fill="${m}"/><circle cx="30" cy="12" r="2" fill="${m}"/>`,
  }[L.mark] ?? '';
  return `<svg class="driver-art" viewBox="0 0 48 48" aria-hidden="true">
    <path d="M6 48 C6 38 13 34 24 34 C35 34 42 38 42 48 Z" fill="${suit}" stroke="#fff" stroke-opacity="0.3"/>
    <path d="M19 34.5 L24 40 L29 34.5" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="1.4"/>
    <circle cx="24" cy="20" r="14" fill="${h}" stroke="#fff" stroke-opacity="0.35" stroke-width="0.8"/>
    ${mark}
    <rect x="12.5" y="18.5" width="23" height="9" rx="4.5" fill="${v}"/>
    <path d="M15.5 21 H24" stroke="#fff" stroke-opacity="0.55" stroke-width="1.5" stroke-linecap="round"/>
    <ellipse cx="18" cy="11" rx="3.2" ry="1.8" fill="#fff" opacity="0.35" transform="rotate(-30 18 11)"/>
  </svg>`;
}

/** Outline + length of a layout (cached), from its control points like buildTrack. */
const trackShapes = {};
function trackShape(id) {
  if (trackShapes[id]) return trackShapes[id];
  const curve = new THREE.CatmullRomCurve3(
    CFG.tracks[id].points.map(([x, z, y = 0]) => new THREE.Vector3(x, y, z)), true, 'centripetal');
  const pts = curve.getSpacedPoints(160);
  const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
  const minX = Math.min(...xs), minZ = Math.min(...zs), w = Math.max(...xs) - minX, h = Math.max(...zs) - minZ;
  const W = 100, H = 64, pad = 7, sc = Math.min((W - pad * 2) / w, (H - pad * 2) / h);
  const ox = (W - w * sc) / 2, oz = (H - h * sc) / 2;
  const px = (p) => [ox + (p.x - minX) * sc, oz + (p.z - minZ) * sc];
  const xy = (p) => px(p).map((v) => v.toFixed(1)).join(' ');
  const d = 'M' + pts.map(xy).join(' L') + ' Z';
  // heading (deg) along the loop at sample i, for the start line and the direction arrow
  const heading = (i) => { const [x0, y0] = px(pts[i]), [x1, y1] = px(pts[i + 2]); return (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI; };
  const at = (i, inner) => `<g transform="translate(${xy(pts[i]).replace(' ', ',')}) rotate(${heading(i).toFixed(1)})">${inner}</g>`;
  let checks = '';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
    checks += `<rect x="${c * 1.6 - 1.6}" y="${r * 1.6 - 3.2}" width="1.6" height="1.6" fill="${(r + c) % 2 ? '#111' : '#fff'}"/>`;
  }
  return (trackShapes[id] = {
    length: Math.round(curve.getLength()),
    svg: `<svg class="track-art" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}" class="road-edge"/>
      <path d="${d}" class="road"/>${at(0, checks)}${at(9, '<path d="M-2 -2.6 L1.6 0 L-2 2.6" class="dir"/>')}</svg>`,
  });
}
function recordText(id) {
  const rec = loadRecords()[id];
  return rec?.race ? `Record ${fmtTime(rec.race)}` : 'No record yet';
}

/** RACE SETUP on the lobby: the picked track (with its record), driver and paint. */
function refreshPickRows() {
  const t = CFG.tracks[track.id], d = playerDriver(), card = (kind) => document.querySelector(`.setup [data-pick="${kind}"]`);
  const fill = (kind, art, name, sub) => {
    const el = card(kind);
    el.querySelector('.pick-art').innerHTML = art;
    el.querySelector('b').textContent = name;
    el.querySelector('em').innerHTML = sub;
  };
  fill('track', trackShape(track.id).svg, '', `${trackShape(track.id).length} m · ${CFG.laps} laps`);
  card('track').querySelector('b').innerHTML = `${icon(t.icon)}${t.name}`;
  card('track').dataset.theme = t.theme;
  const rec = loadRecords()[track.id];
  hud.menuRecord.innerHTML = rec?.race
    ? `<span>RECORD</span> ${fmtTime(rec.race)} <span>BEST LAP</span> ${fmtTime(rec.lap)}` : '<span>NO RECORD YET</span>';
  fill('driver', driverSvg(d), d.name, d.tag);
  const c = playerColors();
  fill('kart', kartSvg(c), picks.paint, `<i style="background:${cssHex(c[0])}"></i><i style="background:${cssHex(c[1])}"></i>`);
}

/** Picker screen for 'track' | 'driver' | 'kart': tapping a card picks it straight away; DONE goes back. */
function openPicker(kind) {
  const list = $('pick-list');
  list.className = `pick-list pick-${kind}`;
  const staged = kind !== 'track'; // driver / paint: the live 3D kart on the left (split stage)
  hud.pickScreen.classList.toggle('staged', staged);
  hud.pickScreen.classList.toggle('tracks', kind === 'track');
  $('pick-title').textContent = { track: 'CHOOSE A TRACK', driver: 'CHOOSE YOUR DRIVER', kart: 'PAINT YOUR KART' }[kind];
  const options = {
    track: () => Object.entries(CFG.tracks).filter(([, t]) => !t.debug || DEBUG).map(([id, t]) => ({
      on: () => track.id === id, theme: t.theme, pick: () => selectTrack(id),
      html: `${trackShape(id).svg}<b>${icon(t.icon)}${t.name}</b><small>${trackShape(id).length} m · ${recordText(id)}</small>`,
    })),
    driver: () => CFG.racers.map((r) => ({
      on: () => picks.driver === r.name,
      pick: () => {
        picks.driver = r.name;
        try { localStorage.setItem(DRIVER_KEY, r.name); } catch { /* storage blocked */ }
        castDrivers();
        placeOnGrid();
      },
      label: r.name, html: driverSvg(r), // art only: name + tag show with the 3D driver (user: all text there)
    })),
    kart: () => CFG.paints.map((p) => ({
      on: () => picks.paint === p.name,
      pick: () => {
        picks.paint = p.name;
        try { localStorage.setItem(PAINT_KEY, p.name); } catch { /* storage blocked */ }
        paintKart(kart, playerColors());
      },
      label: p.name, html: kartSvg(playerColors(p.name)), // the paint's name shows with the 3D kart
    })),
  }[kind]();
  const cards = options.map((o) => {
    const b = document.createElement('button');
    b.className = 'pick-card';
    if (o.label) b.setAttribute('aria-label', o.label);
    if (o.theme) b.dataset.theme = o.theme;
    b.innerHTML = o.html;
    onTap(b, () => {
      sound.click();
      o.pick();
      cards.forEach((c, i) => c.classList.toggle('on', options[i].on()));
      if (staged) { stage.pop = 1; stageLabel(kind); }
      if (kind === 'track') trackPreview();
    });
    return b;
  });
  cards.forEach((c, i) => c.classList.toggle('on', options[i].on()));
  // one swipeable strip (tracks: one row; drivers / paints: two), so more tracks and drivers just extend it
  const grid = document.createElement('div');
  grid.className = 'pick-grid';
  grid.append(...cards);
  list.replaceChildren(grid);
  showOverlay(hud.pickScreen);
  if (kind === 'track') trackPreview();
  if (staged) {
    stage.on = true;
    stage.rot = 0;
    stage.idle = 0;
    hud.overlay.classList.add('stage-on');
    stageLabel(kind);
  }
  list.scrollLeft = list.scrollTop = 0;
  list.classList.toggle('scrolls', list.scrollWidth > list.clientWidth + 2);
  cards.find((c) => c.classList.contains('on'))?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

/** Track picker: the selected track big, left (landscape) or on top (vertical). A 2D map for now: the 3D overview
 * replaces what is inside #tp-view later (the info under it stays). */
function trackPreview() {
  const t = CFG.tracks[track.id], s = trackShape(track.id);
  $('track-preview').dataset.theme = t.theme;
  $('tp-view').innerHTML = s.svg;
  $('tp-name').innerHTML = `${icon(t.icon)}${t.name}`;
  $('tp-meta').textContent = `${s.length} m · ${CFG.laps} laps`;
  $('tp-record').textContent = recordText(track.id);
}

/** The name under the 3D kart on the split stage: the driver and their flavour line (never a role: the
 * player's driver is looks only), or the paint. */
function stageLabel(kind) {
  const d = playerDriver();
  $('stage-name').textContent = kind === 'driver' ? d.name : picks.paint;
  $('stage-tag').textContent = kind === 'driver' ? d.tag : `${d.name}'s kart`;
  const el = $('stage-name').parentElement;
  el.classList.remove('pop');
  void el.offsetWidth; // restart the transition
  el.classList.add('pop');
  setTimeout(() => el.classList.remove('pop'), 150);
}

// ---------- Settings (per device). Steering: 'buttons' (the two arrows) or 'joystick' (analogue). ----------
const STEER_KEY = 'kartrush.steering';
let settingsFrom = null; // the screen BACK returns to (title or pause)
let helpFrom = null;     // same for HOW TO PLAY
function savedSteering() {
  try { return localStorage.getItem(STEER_KEY) === 'joystick' ? 'joystick' : 'buttons'; } catch { return 'buttons'; }
}
function setSteering(mode, save = true) {
  if (save) try { localStorage.setItem(STEER_KEY, mode); } catch { /* storage blocked */ }
  app.classList.toggle('steer-joystick', mode === 'joystick');
  for (const b of $('steer-pick').children) b.classList.toggle('on', b.dataset.steer === mode);
  input.left = input.right = false;
  releaseStick();
}
// Difficulty (Settings -> DIFFICULTY, saved in kartrush.diff): Hard = the game before build 45 (AIs at their own pace,
// no rubber band), Medium = AIs far ahead of the player ease off up to 4%, Easy = up to 9% and every AI 4% slower.
const DIFF = { easy: { ease: 0.09, pace: -0.04 }, medium: { ease: 0.04, pace: 0 }, hard: { ease: 0, pace: 0 } };
const DIFF_KEY = 'kartrush.diff';
let difficulty = 'medium';
try { const d = localStorage.getItem(DIFF_KEY); if (DIFF[d]) difficulty = d; } catch { /* storage blocked */ }
/** The difficulty in force: the vertical view is Easy only, unless a debug race is running (build 64.24). */
function effectiveDiff() {
  let dbgOn = false;
  try { dbgOn = dbgActive(); } catch { /* before the debug state exists (boot) */ }
  return app.classList.contains('vertical') && !dbgOn ? 'easy' : difficulty;
}
function showDiff() {
  const e = effectiveDiff(), locked = e !== difficulty || (app.classList.contains('vertical') && e === 'easy');
  for (const b of $('diff-pick').children) b.classList.toggle('on', b.dataset.diff === e);
  $('diff-pick').style.opacity = locked ? 0.55 : '';
}
function setDifficulty(d, save = true) {
  difficulty = d;
  if (save) try { localStorage.setItem(DIFF_KEY, d); } catch { /* storage blocked */ }
  showDiff();
}
for (const b of $('diff-pick').children) onTap(b, () => { sound.click(); setDifficulty(b.dataset.diff); });
setDifficulty(difficulty, false);

// ---------- Debug panel (DEBUG builds: the plain-http LAN server only) ----------
// Menu / pause -> DEBUG. Pick the track (menu only), park the rivals (invisible, no collisions), a start spot
// (applied at the start of a race, or at once when paused), an item you always carry (refilled after each use)
// and one-shot effects. Races played with any of it on are not sent to the telemetry log.
const dbg = { on: false, parked: false, spot: null, items: [], next: 0, laps: 3, aggro: false }; // aggro: bots use weapons on the player; items: the ticked powers, carried in rotation // `on`: this race was started from the panel (or changed from pause)
const dbgActive = () => DEBUG && (track.id === 'lab' || dbg.on);
function dbgClear() { Object.assign(dbg, { on: false, parked: false, spot: null, items: [], next: 0, laps: 3, aggro: false }); CFG.laps = 3; }
let dbgFrom = null;
function dbgSpots() {
  const def = CFG.tracks[track.id], N = track.N;
  if (def.spots) { // control point -> nearest road sample
    return def.spots.map(([name, pi]) => {
      const [px, pz] = def.points[pi];
      let best = 0, bd = Infinity;
      track.samples.forEach((s, i) => { const d = (s.x - px) ** 2 + (s.z - pz) ** 2; if (d < bd) { bd = d; best = i; } });
      return { name, idx: best };
    });
  }
  return [['Start', 0], ['1/4', 0.25], ['1/2', 0.5], ['3/4', 0.75]].map(([name, f]) => ({ name, idx: Math.round(N * f) % N }));
}
function dbgGoto(spot) {
  dbg.spot = spot;
  if (state.phase === 'race' || state.paused) { // in a race: jump now, facing along the road
    resetKart(kart, spot.idx, 0);
    camState.snap = true;
  }
}
function dbgHold(kind) { kart.item = kind; kart.itemRoll = 0; kart.itemCount = kind === 'triple' ? 3 : 1; }
function dbgNextItem() { // the next ticked power in rotation
  dbg.next %= dbg.items.length;
  return dbg.items[dbg.next++];
}
function dbgToggle(kind) { // null = clear all
  if (!kind) dbg.items = [];
  else dbg.items = dbg.items.includes(kind) ? dbg.items.filter((t) => t !== kind) : [...dbg.items, kind];
  if (dbg.items.length && (state.phase === 'race' || state.phase === 'countdown')) dbgHold(dbg.items.includes(kind) ? kind : dbgNextItem());
}
function dbgApplyStart() { // right after the grid is set up for a race
  if (!dbg.on) return;
  CFG.laps = dbg.laps;
  if (dbg.spot) resetKart(kart, dbg.spot.idx, 0);
  if (dbg.items.length) dbgHold(dbgNextItem());
}
function dbgTick() { // every frame
  for (const k of karts) {
    if (k.isPlayer) continue;
    const park = DEBUG && dbg.on && dbg.parked;
    if (k.group.visible === park) k.group.visible = !park;
    // only touch collisionResponse when parking changes: setting it every frame turned the bots' bullets solid again (they shoved the player without a hit)
    if (park && !k.dbgParked) { k.body.collisionResponse = false; k.dbgParked = true; }
    else if (!park && k.dbgParked) { k.body.collisionResponse = !(k.bullet > 0); k.dbgParked = false; }
  }
  if (dbg.on && dbg.items.length && state.phase === 'race' && !kart.item && kart.itemRoll <= 0) dbgHold(dbgNextItem());
}
function dbgRender() {
  const card = $('debug-card'), rows = [];
  const row = (label, opts) => {
    const el = document.createElement('div');
    el.className = 'setting-row';
    el.innerHTML = `<div class="setting"><span class="setting-label">${label}</span><div class="track-pick"></div></div>`;
    const box = el.querySelector('.track-pick');
    for (const o of opts) {
      const b = document.createElement('button');
      b.className = 'trk' + (o.on ? ' on' : '');
      b.textContent = o.text;
      onTap(b, () => { sound.click(); o.pick(); if (racing) dbg.on = true; dbgRender(); });
      box.append(b);
    }
    rows.push(el);
  };
  const racing = state.paused || state.phase === 'race';
  if (!racing) row('TRACK', Object.entries(CFG.tracks).map(([id, t]) => ({ text: t.name, on: track.id === id, pick: () => { dbg.spot = null; selectTrack(id); } })));
  row('AI ITEMS', [{ text: 'Normal', on: !dbg.aggro, pick: () => { dbg.aggro = false; } }, { text: 'Aggressive', on: dbg.aggro, pick: () => { dbg.aggro = true; } }]); // aggressive: weapons only, used on you sooner and from further away
  row('RIVALS', [{ text: 'Race', on: !dbg.parked, pick: () => { dbg.parked = false; } }, { text: 'Parked', on: dbg.parked, pick: () => { dbg.parked = true; } }]);
  row('LAPS', [1, 3].map((n) => ({ text: n === 1 ? '1 lap' : '3 laps', on: dbg.laps === n, pick: () => { dbg.laps = n; CFG.laps = n; } })));
  row(racing ? 'GO TO' : 'START AT', [{ text: 'Grid', on: !dbg.spot, pick: () => { dbg.spot = null; } },
    ...dbgSpots().map((s) => ({ text: s.name, on: dbg.spot?.idx === s.idx, pick: () => dbgGoto(s) }))]);
  row('ITEMS', [{ text: 'Normal', on: !dbg.items.length, pick: () => dbgToggle(null) },
    ...ITEM_TYPES.map((t) => ({ text: t, on: dbg.items.includes(t), pick: () => dbgToggle(t) }))]); // tick several: you carry them in rotation, and the bots' boxes give only these (random)
  if (racing) row('NOW', [
    { text: 'Boost', on: false, pick: () => { kart.boost = CFG.kart.boostDuration * 1.3; } },
    { text: 'Spin out', on: false, pick: () => spinOut(kart, null, 'debug') },
    { text: 'Reset lap time', on: false, pick: () => { state.lapStart = state.raceTime; } },
  ]);
  card.replaceChildren(...rows);
  $('btn-debug-start').hidden = racing;
}
function showDebug() {
  dbgFrom = state.paused ? hud.pauseScreen : hud.menuScreen;
  dbgRender();
  showOverlay(hud.debugScreen);
}
if (DEBUG) {
  document.querySelectorAll('.btn-debug').forEach((b) => { b.hidden = false; onTap(b, () => { sound.click(); showDebug(); }); });
  onTap($('btn-debug-back'), () => { sound.click(); showOverlay(dbgFrom); });
  onTap($('btn-debug-start'), () => { sound.click(); dbg.on = true; startRace(); });
}

// Settings -> VIEW: Landscape (the game turned sideways under portrait lock) or Vertical (upright, drag to steer, auto-gas). kartrush.view
function savedView() { // a first-time player (no view choice, no profile yet) starts vertical, and that is saved; everyone else keeps what they had
  try {
    const v = localStorage.getItem('kartrush.view');
    if (v) return v === 'vertical';
    if (localStorage.getItem('kartrush.profile')) return false; // literal key: PROFILE_KEY is declared later (TDZ at boot)
    localStorage.setItem('kartrush.view', 'vertical');
    return true;
  } catch { return false; }
}
function setView(vertical, save = true) {
  if (save) try { localStorage.setItem('kartrush.view', vertical ? 'vertical' : 'landscape'); } catch { /* storage blocked */ }
  app.classList.toggle('vertical', vertical);
  // vertical: LAP joins TIME and BEST in one top bar (#hud-top); landscape keeps it under the minimap
  if (vertical) $('hud-top').prepend($('lapbox')); else $('hud').append($('lapbox'));
  for (const b of $('view-pick').children) b.classList.toggle('on', (b.dataset.view === '1') === vertical);
  input.left = input.right = false;
  releaseStick();
  if (save) showDiff();
  if (save) onResize(); // (at boot onResize runs anyway, after everything exists)
}
// Screen flip (Settings -> SCREEN): under portrait lock the game is turned 90deg clockwise; flipped turns it
// the other way, for holding the phone the other way round. Saved in kartrush.flip.
const FLIP_KEY = 'kartrush.flip';
function savedFlip() { try { return localStorage.getItem(FLIP_KEY) === '1'; } catch { return false; } }
function setFlip(on, save = true) {
  if (save) try { localStorage.setItem(FLIP_KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
  app.classList.toggle('flipped', on);
  for (const b of $('flip-pick').children) b.classList.toggle('on', (b.dataset.flip === '1') === on);
  releaseStick();
}
// Volume levels: 'music' and 'sfx' (effects + engines + drift squeal), 0..1 in four steps
const volKey = (bus) => `kartrush.volume.${bus}`;
function savedVolume(bus) {
  try { const v = parseFloat(localStorage.getItem(volKey(bus))); return Number.isFinite(v) ? v : 1; } catch { return 1; }
}
function setVolume(bus, v, save = true) {
  if (save) try { localStorage.setItem(volKey(bus), String(v)); } catch { /* storage blocked */ }
  sound.setVolume(bus, v);
  for (const b of document.querySelector(`.vol-pick[data-bus="${bus}"]`).children) b.classList.toggle('on', +b.dataset.vol === v);
}
// ---------- Race telemetry: when the game comes from the Mac's LAN server (dev/serve.py), each race is sent
// there at the end and appended to dev/telemetry/races.jsonl, so tuning can use real races on the phone
// instead of only the headless autopilot. Never sent from GitHub Pages (or any https host).
const tele = { on: location.protocol === 'http:', race: null, nextT: 0 };
function teleStart() {
  if (!tele.on) return; // debug races are logged too, flagged debug: true
  tele.nextT = 0;
  tele.race = {
    build: $('build').textContent.split(' ')[1], at: new Date().toISOString(), track: track.id, ...(dbgActive() && { debug: true }),
    steering: savedSteering(), diff: effectiveDiff(), view: app.classList.contains('vertical') ? 'vertical' : 'landscape', laps: CFG.laps, player: { driver: picks.driver, paint: picks.paint },
    karts: karts.map((k) => ({ name: k.name, ...(k.ai && { style: k.style, role: k.ai.style.role, skill: +k.ai.skill.toFixed(3), grip: +k.ai.grip.toFixed(1),
      lineUse: +k.ai.lineUse.toFixed(2) }) })),
    // every second: t, then per kart [metres raced, km/h, place, AI target speed as % of top], then the player's
    // pedals (g = gas, b = brake, - = none)
    samples: [], events: [],
  };
}
function teleEvent(type, k, data = {}) {
  if (!tele.race) return;
  tele.race.events.push({ t: +state.raceTime.toFixed(2), type, kart: karts.indexOf(k), ...data });
}
window.addEventListener('error', (e) => teleEvent('jserror', kart, { msg: String(e.message).slice(0, 120), line: e.lineno }));
window.addEventListener('unhandledrejection', (e) => teleEvent('jserror', kart, { msg: String(e.reason).slice(0, 120) }));
function teleSample() {
  if (!tele.race || state.raceTime < tele.nextT) return;
  tele.nextT = state.raceTime + 1;
  tele.race.samples.push([+state.raceTime.toFixed(1), ...karts.map((k) => [Math.round(k.progress * track.spacing),
    Math.round(k.speed * 3.6), k.place, k.ai ? Math.round(k.topMult * 100) : 0]),
    karts[0].ctl.gas ? 'g' : input.brake ? 'b' : '-']);
}
function teleSend(end) {
  const race = tele.race;
  tele.race = null;
  if (!race || state.raceTime < 5) return; // quit straight away: nothing worth keeping
  race.end = end;
  race.result = karts.map((k) => ({ finished: k.finished, time: k.finished ? +k.finishTime.toFixed(2) : null, place: k.place }));
  fetch('/telemetry', { method: 'POST', body: JSON.stringify(race) }).catch(() => {});
}

/** The page going to the background (leaving the app, locking the phone) can end it for good on iOS, and a race abandoned like that was never
 * logged. So the race so far is sent as a partial record (end: 'hidden'); the race itself goes on and still sends its normal record at the end. */
function teleHidden() {
  const race = tele.race;
  if (!race || state.raceTime < 5) return;
  const body = JSON.stringify({ ...race, end: 'hidden', partial: true, raceTime: +state.raceTime.toFixed(1),
    result: karts.map((k) => ({ finished: k.finished, time: k.finished ? +k.finishTime.toFixed(2) : null, place: k.place })) });
  if (!(navigator.sendBeacon && navigator.sendBeacon('/telemetry', body))) fetch('/telemetry', { method: 'POST', body, keepalive: true }).catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') teleHidden(); });
window.addEventListener('pagehide', teleHidden);

function showSettings() {
  settingsFrom = state.paused ? hud.pauseScreen : hud.menuScreen;
  showOverlay(hud.settingsScreen);
}
function releaseStick() {
  input.axis = 0;
  $('vl').style.opacity = $('vr').style.opacity = 0;
  hud.knob.style.transform = '';
  hud.knob.classList.remove('held');
}

/** Shows one overlay screen (menu / results / pause / settings) and hides the HUD behind it. */
function showOverlay(screen) {
  for (const el of [hud.menuScreen, hud.helloScreen, hud.pickScreen, hud.resultsScreen, hud.pauseScreen, hud.settingsScreen, hud.helpScreen, hud.debugScreen]) el.hidden = el !== screen;
  hud.wrongway.hidden = true;
  app.classList.add('overlay-on');
  hud.overlay.classList.toggle('lobby-on', screen === hud.menuScreen); // lighter backdrop: the 3D kart shows through
  hud.overlay.classList.remove('stage-on'); // openPicker puts it back for the split stage
  stage.on = false;
  hud.overlay.classList.remove('hidden');
}

function pauseGame() {
  teleEvent('pause', kart);
  if (state.paused || !(state.phase === 'race' || state.phase === 'countdown')) return;
  state.paused = true;
  for (const key of Object.keys(input)) input[key] = false; // held buttons would stay held otherwise
  releaseStick();
  document.querySelectorAll('.ctl.pressed').forEach((el) => el.classList.remove('pressed'));
  sound.suspend();
  showOverlay(hud.pauseScreen);
}

function resumeGame() {
  if (!state.paused) return;
  state.paused = false;
  lastTime = performance.now(); // no catch-up jump
  hud.overlay.classList.add('hidden');
  app.classList.remove('overlay-on');
  sound.unlock();
}

/** Results screen; called again as each AI finishes, to fill in the table. */
function showResults() {
  const first = !state.resultsShown;
  state.resultsShown = true;
  const winner = karts.find((k) => k.place === 1);
  const medal = ['g', 's', 'b'];
  hud.standings.innerHTML = [...karts].sort((a, b) => a.place - b.place).map((k, i) => {
    const gap = !k.finished ? 'racing&hellip;' : k === winner ? fmtTime(k.finishTime) : `+${(k.finishTime - winner.finishTime).toFixed(2)}`;
    // rows only animate the first time, not on every refresh
    return `<tr class="${k.isPlayer ? 'me' : ''}" style="${first ? `animation-delay:${0.15 + i * 0.07}s` : 'animation:none'}">
      <td class="pos ${medal[k.place - 1] || ''}"><i>${k.place}</i></td>
      <td class="name"><i class="swatch" style="background:${k.color}"></i>${k.isPlayer ? escapeHtml(profile?.name || 'YOU') : k.name}</td>
      <td class="gap ${k.finished ? '' : 'wait'}">${gap}</td>
    </tr>`;
  }).join('');
  if (!first) return;
  sound.music('menu');

  const p = kart.place;
  hud.resPlace.className = `big-place p${p}`;
  hud.resPlace.innerHTML = `${p}<sup>${ordinal(p).slice(-2)}</sup>`;
  hud.resTime.textContent = fmtTime(kart.finishTime);
  hud.resLap.textContent = fmtTime(state.bestLap);

  const all = loadRecords();
  const rec = (all[track.id] ||= {});
  const debugRace = dbgActive(); // debug races (a 1-lap race, the Test Lab...) never set records
  const newRace = !debugRace && !(rec.race <= kart.finishTime), newLap = !debugRace && !(rec.lap <= state.bestLap);
  if (newRace) rec.race = kart.finishTime;
  if (newLap) rec.lap = state.bestLap;
  if (!debugRace) saveRecords(all);
  hud.resRecord.innerHTML = newRace || newLap
    ? `<span class="new">&#9733; NEW ${newRace ? 'RECORD' : 'BEST LAP'}</span>`
    : `Record ${fmtTime(rec.race)} &middot; best lap ${fmtTime(rec.lap)}`;

  if (p === 1) {
    const colors = ['#ffe14a', '#5cc8ff', '#ff5fa2', '#7dff9b', '#ffffff'];
    hud.confetti.replaceChildren(...Array.from({ length: 36 }, (_, i) => {
      const c = document.createElement('i');
      c.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % colors.length]};` +
        `animation-duration:${2.2 + Math.random() * 1.8}s;animation-delay:${Math.random() * 1.2}s`;
      return c;
    }));
  }
  showOverlay(hud.resultsScreen);
}

/**
 * Nearest centre-line sample, searched locally around the previous index. Height counts double, so where
 * the track crosses itself the road you're on wins over the one 9 m above or below.
 */
function nearestTrackIndex(pos, hint) {
  const { N, samples } = track;
  let best = hint, bestD = Infinity;
  const scan = (from, to, step = 1) => {
    for (let k = from; k <= to; k += step) {
      const i = ((k % N) + N) % N;
      const s = samples[i];
      const d = (s.x - pos.x) ** 2 + (s.z - pos.z) ** 2 + 4 * (s.y - pos.y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
  };
  scan(hint - 30, hint + 30);
  if (bestD > 20 * 20) scan(0, N - 1); // lost (e.g. after reset): full search
  return best;
}

/* ==========================================================================
 * 3b. AI DRIVERS
 * Pure pursuit toward a point ahead on the AI's racing lane, braking for corners from the
 * track's curvature. Each AI rolls its own pace and corner bravery per race, wanders between
 * lanes, dodges slower karts and makes the odd mistake. No rubber band (removed in build 29: user's races
 * showed AIs ahead holding back at 85% pace so the field bunched up around the player; user wants a level
 * field, every AI at its own pace whatever the player does).
 * ========================================================================== */
const rand = (a, b) => a + Math.random() * (b - a);
const aiFwd = new CANNON.Vec3();

function newAI(lane, name) {
  const st = { ...CFG.ai, ...CFG.ai.styles[name] }; // this driver's personality over the defaults
  return {
    style: st,
    skill: rand(...st.skill), grip: rand(...st.cornerGrip), lineUse: rand(...st.lineUse), bias: rand(-st.bias, st.bias),
    lane, laneTarget: 0, laneTimer: rand(2, 5), // lane = offset from this AI's racing line (starts at its grid slot)
    mistake: null, mistakeTimer: rand(...st.mistakeEvery),
    defendT: 0, defendCool: 0, defendLane: 0,
    towT: 0, towSide: 0, slingT: 0, tow: 0, slingAt: st.slingAt ? rand(...st.slingAt) : 0, // the trickster's slipstream
    startDelay: rand(...st.startDelay), // reaction time at GO
    stuckT: 0, backT: 0, stuckCount: 0, wrongT: 0, resetNow: false, resets: 0,
    watchT: 0, watchProgress: -Infinity,
  };
}

function updateAI(k, dt, canDrive) {
  const K = CFG.kart, ai = k.ai, A = ai.style, ctl = k.ctl, b = k.body;
  const { N, samples, normals, tangents, spacing, radius } = track;
  ctl.steer = 0; ctl.gas = false; ctl.brake = false;
  if (!canDrive) return;
  if (ai.startDelay > 0) { ai.startDelay -= dt; return; }
  if (k.spin > 0) { // spun out: wait it out without the stuck detectors kicking in
    Object.assign(ai, { stuckT: -1, backT: 0, watchT: 0 });
    return;
  }

  const idx = k.trackIdx;
  const n = normals[idx];
  const fwd = b.quaternion.vmult(LOCAL_FWD, aiFwd);
  const myLane = (b.position.x - samples[idx].x) * n.x + (b.position.z - samples[idx].z) * n.z;

  // --- Lateral plan. Each AI follows its own share of the racing line (`base`), wandering a little
  // either side of it. Pads, boxes, bananas and slower karts ahead set an absolute goal instead,
  // and a kart right alongside pushes it away so it doesn't side-swipe.
  const base = (i) => track.line[i] * ai.lineUse + ai.bias;
  ai.laneTimer -= dt;
  if (ai.laneTimer <= 0) {
    ai.laneTarget = rand(-A.laneRange, A.laneRange);
    ai.laneTimer = rand(2.5, 6);
  }
  let goal = null; // absolute lateral offset from the centre line, when something asks for one
  // Head for a boost pad, or (with no item) the nearest item box, when one is coming up
  const stepsTo = (i) => (i - idx + N) % N;
  for (const pad of itemVis.pads) if (stepsTo(pad.idx) * spacing < 35 && stepsTo(pad.idx) > 2) goal = pad.lane;
  if (!k.item) {
    for (const row of track.def.boxRows) {
      const dist = stepsTo(row) * spacing;
      if (dist > 4 && dist < 30) {
        const open = itemVis.boxes.filter((bx) => bx.idx === row && bx.hidden < dist / Math.max(k.speed, 5));
        if (open.length) goal = open.reduce((a, c) => (Math.abs(c.lane - myLane) < Math.abs(a.lane - myLane) ? c : a)).lane;
      }
    }
  }
  // Defending: a faster kart closing in behind on a straight -> move across onto its line for a moment
  // (then a cool-down, so it's a block, not weaving)
  ai.defendT -= dt;
  ai.defendCool -= dt;
  if (A.defend > 0 && ai.defendCool <= 0 && !k.finished) {
    let straight = true;
    for (let s = 5; s * spacing < 35; s += 5) if (radius[(idx + s) % N] < 50) straight = false;
    for (const o of straight ? karts : []) {
      if (o === k || o.spin > 0) continue;
      const dx = o.body.position.x - b.position.x, dz = o.body.position.z - b.position.z;
      const ahead = dx * fwd.x + dz * fwd.z;
      if (ahead < -2.5 && ahead > -12 && o.speed > k.speed + 0.5 && Math.random() < A.defend * dt * 3) {
        ai.defendLane = clampLane(idx, myLane + dx * n.x + dz * n.z);
        ai.defendT = rand(1, 1.8);
        ai.defendCool = rand(4, 7);
        break;
      }
    }
  }
  if (ai.defendT > 0) goal = ai.defendLane;
  // Banana trap (the bully): with a banana in hand and a corner coming, get onto the racing line to drop it
  if (A.trap && (k.item === 'banana' || k.item === 'bomb') && k.itemRoll <= 0 && trapCorner(idx)) goal = clampLane(idx, track.line[idx]);
  // Steer round bananas
  for (const d of drops) {
    const dx = d.pos.x - b.position.x, dz = d.pos.z - b.position.z;
    const dAhead = dx * fwd.x + dz * fwd.z;
    const side = dx * n.x + dz * n.z;
    const heading = goal ?? base(idx) + ai.lane;
    if (dAhead > 0 && dAhead < 18 && Math.abs(myLane + side - heading) < 2.2) {
      goal = clampLane(idx, myLane + side + (myLane + side > 0 ? -2.8 : 2.8));
    }
  }
  let blocked = false, push = 0;
  for (const o of karts) {
    if (o === k) continue;
    const dx = o.body.position.x - b.position.x, dz = o.body.position.z - b.position.z;
    const ahead = dx * fwd.x + dz * fwd.z;
    const side = dx * n.x + dz * n.z; // + = the other kart is to our left
    const closing = k.speed - o.speed;
    if (ahead > 2 && ahead < Math.max(10, closing * 1.2) && Math.abs(side) < 2.6 && closing > -1) {
      let dir = myLane + side > 0 ? -1 : 1; // pass on the roomier side of them...
      if (A.overtake > 0.6) {
        // ...or, for the racers, down the inside of the next corner (the racing line's apex side), if there's room
        const inside = Math.sign(track.line[(idx + Math.round(35 / spacing)) % N]);
        const lane = myLane + side + inside * 3.2;
        if (inside && clampLane(idx, lane) === lane) dir = inside;
      }
      goal = clampLane(idx, myLane + side + dir * 3.2);
      // right on their bumper: ease off (the racers keep the gas on closer in)
      if (ahead < (A.overtake > 0.6 ? 3.5 : 5) && Math.abs(side) < 1.8) blocked = true;
    } else if (Math.abs(ahead) <= 2.5 && Math.abs(side) < 3.2) {
      // side by side: keep ~3 m apart (the bully only ~2 m: leaning on you) unless that would put us into the wall
      const gap = A.aggression > 0.7 ? 2 : 3.2;
      const away = side > 0 ? -1 : 1;
      if (Math.abs(side) < gap && clampLane(idx, myLane + away) === myLane + away) push += away * (gap - Math.abs(side));
    }
  }
  // The trickster: tuck into the wake of the kart ahead (a tow), then pull out and slingshot past
  ai.tow = 0;
  if (A.slip && !k.finished) {
    let wake = null, wakeAhead = Infinity;
    for (const o of karts) {
      if (o === k || o.spin > 0 || o.speed < 10) continue;
      const dx = o.body.position.x - b.position.x, dz = o.body.position.z - b.position.z;
      const ahead = dx * fwd.x + dz * fwd.z, side = dx * n.x + dz * n.z;
      if (ahead > A.towRange[0] && ahead < A.towRange[1] && Math.abs(side) < 3 && ahead < wakeAhead) { wake = { o, side }; wakeAhead = ahead; }
    }
    ai.slingT -= dt;
    if (wake) {
      const lead = wake.o.place === 1 ? A.towLeader : A.tow;
      if (ai.slingT > 0 || ai.towT >= ai.slingAt) { // slingshot: out of the wake and past, keeping the tow a moment
        if (ai.slingT <= 0) { ai.slingT = 1.6; ai.towSide = myLane + wake.side > 0 ? -1 : 1; }
        goal = clampLane(idx, myLane + wake.side + ai.towSide * 3.2);
        ai.tow = lead;
      } else if (Math.abs(wake.side) < 1.2) { // in the wake
        ai.towT += dt;
        ai.tow = lead;
        goal = clampLane(idx, myLane + wake.side);
      } else { // lining up behind it
        goal = clampLane(idx, myLane + wake.side);
      }
      blocked = false;
    } else if (ai.slingT <= 0) {
      ai.towT = 0;
      ai.slingAt = rand(...A.slingAt);
    }
  }
  const relGoal = (goal === null ? ai.laneTarget : goal - base(idx)) + push;
  ai.lane += clamp(relGoal - ai.lane, -4 * dt, 4 * dt);

  // --- Steering: pure pursuit toward a look-ahead point on the lane
  const speedRatio = clamp(k.speed / K.maxSpeed, 0, 1);
  const j = (idx + Math.round(lerp(A.lookAhead[0], A.lookAhead[1], speedRatio) / spacing)) % N;
  const lat = clampLane(j, base(j) + ai.lane);
  const tx = samples[j].x + normals[j].x * lat;
  const tz = samples[j].z + normals[j].z * lat;
  const d = wrapAngle(Math.atan2(tx - b.position.x, tz - b.position.z) - Math.atan2(fwd.x, fwd.z));
  let steer = clamp(-d * A.steerGain, -1, 1);
  // the drifter: in a real corner at speed, commits to a slide (holds the wheel past the drift threshold) and
  // keeps it until pure pursuit lets go or turns the other way (then the mini-turbo fires on the exit)
  if (A.drift) {
    const corner = k.speed > K.driftMinSpeed + 3 && lerp(radius[j], track.lineRadius[j], ai.lineUse) < A.driftRadius;
    const into = Math.sign(steer), keep = ai.sliding && into === ai.sliding && Math.abs(steer) > 0.08;
    ai.sliding = corner && (keep || Math.abs(steer) > 0.15) ? into : 0;
    if (ai.sliding) steer = ai.sliding * Math.max(Math.abs(steer), A.driftLock);
  }

  // --- Speed: own pace, capped so it can still brake for every corner ahead
  // Gentle rubber band (build 45, a friend: the game is hard, nobody should be left far behind): an AI more than
  // easeFrom metres ahead of the player loses up to easeMax of top speed, full at easeFull. Never speeds anyone up.
  const gapAhead = (k.progress - kart.progress) * track.spacing;
  const catchUp = DIFF[effectiveDiff()].pace - DIFF[effectiveDiff()].ease * clamp((gapAhead - CFG.ai.easeFrom) / (CFG.ai.easeFull - CFG.ai.easeFrom), 0, 1);
  const pace = k.star > 0 ? K.maxSpeed + CFG.items.starSpeed : K.maxSpeed * (k.finished ? A.finishedPace : ai.skill + ai.tow + catchUp);
  let corner = Infinity; // fastest speed that still makes every corner in the next 45 m
  const brakeDecel = 10;
  for (let s = 2; s * spacing < 45; s += 2) {
    // this AI's own path is somewhere between the centre line and the racing line: blend the curvatures
    const c = (idx + s) % N, curv = lerp(1 / radius[c], 1 / track.lineRadius[c], ai.lineUse);
    const g = ai.grip * lerp(1, K.iceGrip, track.ice[c]);
    const vCorner = Math.sqrt((g - CFG.gravity * Math.abs(track.bank[c])) / Math.max(curv, 1e-4)); // banks help
    corner = Math.min(corner, Math.sqrt(vCorner * vCorner + 2 * brakeDecel * s * spacing));
  }
  const target = Math.min(pace, corner);
  k.topMult = target / K.maxSpeed;
  ctl.gas = !blocked;          // the engine cuts out above target on its own (driveKart)
  // Brake only for corners. Being over its own pace (after a boost pad) is just a lift:
  // braking for that looked like slamming on the brakes on a straight.
  ctl.brake = k.speed > corner + A.brakeOver && k.boost <= 0; // full brakes against a boost tip the kart over

  // --- Mistakes: a twitch of the wheel, or a lift off the gas
  if (!k.finished) {
    ai.mistakeTimer -= dt;
    if (ai.mistakeTimer <= 0) {
      ai.mistakeTimer = rand(...A.mistakeEvery);
      ai.mistake = Math.random() < (A.wild ? 0.8 : 0.5) // the wild card mostly wobbles, and longer
        ? { t: A.wild ? rand(0.3, 0.7) : rand(0.25, 0.5), steer: Math.random() < 0.5 ? -0.8 : 0.8 }
        : { t: rand(0.5, 1.0), lift: true };
    }
    if (ai.mistake) {
      ai.mistake.t -= dt;
      steer = clamp(steer + (ai.mistake.steer || 0), -1, 1);
      if (ai.mistake.lift) ctl.gas = false;
      if (ai.mistake.t <= 0) ai.mistake = null;
    }
  }

  // --- Unsticking: back up with opposite lock; after repeated failures (or facing the wrong
  // way for a while) get put back on the track like the player's reset button
  if (ai.backT > 0) {
    ai.backT -= dt;
    Object.assign(ctl, { steer: -steer, gas: false, brake: true });
    return;
  }
  if (k.speed > 8) ai.stuckCount = 0;
  ai.stuckT = Math.abs(k.speed) < 1 ? ai.stuckT + dt : 0;
  if (ai.stuckT > 1.2) {
    ai.stuckT = 0;
    ai.backT = 1.0;
    if (++ai.stuckCount >= 3) { ai.resetNow = 'stuck'; ai.stuckCount = 0; }
  }
  // Watchdog for anything the above misses (wedged on a wall, beached at an angle...)
  ai.watchT += dt;
  if (ai.watchT > 4) {
    if (!k.finished && k.progress - ai.watchProgress < 10) ai.resetNow = 'watchdog';
    ai.watchT = 0;
    ai.watchProgress = k.progress;
  }
  const t = tangents[idx];
  ai.wrongT = fwd.x * t.x + fwd.z * t.z < -0.3 ? ai.wrongT + dt : 0;
  if (ai.wrongT > 3) ai.resetNow = 'wrong-way';

  ctl.steer = steer;
  updateAIItem(k, dt);
}

/* ==========================================================================
 * 3c. ITEMS & BOOST PADS
 * Boxes hand out an item rolled from the kart's race position. Bananas and shells are not physics
 * bodies: they move on the track plane and hit karts by distance. A hit kart spins out (see driveKart).
 * ========================================================================== */
const ITEM_TYPES = ['mushroom', 'banana', 'green', 'red', 'shield', 'star', 'triple', 'blue', 'bullet', 'bomb'];
const drops = [];   // bananas on the track: { mesh, pos, owner, age }
const shells = [];  // { kind, mesh, pos, vel, idx, owner, target, age, life, bounces } (+ along, homing: blue)

function clearItems() {
  for (const o of [...drops, ...shells]) scene.remove(o.mesh);
  drops.length = shells.length = 0;
  for (const b of itemVis.boxes) b.hidden = 0;
  for (const k of karts) {
    for (const m of k.orbit || []) scene.remove(m);
    k.orbit = [];
    k.body.collisionResponse = true;
  }
}

function rollItem(place, k) {
  if (k?.ai && dbg.on && dbg.items.length) return dbg.items[Math.floor(Math.random() * dbg.items.length)]; // DEBUG: the bots' boxes only give the ticked items
  const odds = CFG.items.odds[clamp(place, 1, CFG.items.odds.length) - 1].slice();
  if (k?.ai && dbg.on && dbg.aggro) for (const t of ['mushroom', 'shield', 'triple']) odds[ITEM_TYPES.indexOf(t)] = 0; // DEBUG aggressive bots: weapons only
  const tilt = k?.ai?.style.itemOdds; // a personality's item luck (the bully: weapons)
  if (tilt) tilt.forEach((m, i) => { odds[i] *= m; });
  // one blue shell at a time (flying or held)
  if (shells.some((s) => s.kind === 'blue') || karts.some((k) => k.item === 'blue')) odds[ITEM_TYPES.indexOf('blue')] = 0;
  let r = Math.random() * odds.reduce((a, b) => a + b, 0);
  for (let i = 0; i < odds.length; i++) if ((r -= odds[i]) < 0) return ITEM_TYPES[i];
  return 'mushroom';
}

const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x14121c, side: THREE.BackSide });
function spawnModel(kind, pos) {
  const { geo, mat, outline } = itemVis.models[kind];
  const mesh = new THREE.Mesh(geo, mat);
  mesh.add(new THREE.Mesh(outline, OUTLINE_MAT));
  mesh.position.copy(pos);
  mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
}

const THROWABLE = new Set(['green', 'banana', 'bomb']); // items with a second (opposite-direction) button
const itemFwd = new CANNON.Vec3();
function useItem(k, flip = false) { // flip = the opposite throw: green shell backwards, banana/bomb forwards (build 66.1)
  if (!k.item || k.itemRoll > 0 || k.spin > 0 || k.bullet > 0) return;
  const I = CFG.items, b = k.body;
  const fwd = b.quaternion.vmult(LOCAL_FWD, itemFwd);
  const h = Math.hypot(fwd.x, fwd.z) || 1;
  let fx = fwd.x / h, fz = fwd.z / h;
  const item = k.item;
  if (flip && !THROWABLE.has(item)) return;
  teleEvent('use', k, { item, place: k.place });
  k.fireT = 0.4;
  if (item === 'triple') {
    if (k.tripleT > 0) return; // a quick double tap shouldn't burn two
    k.tripleT = I.tripleGap;
    if (--k.itemCount <= 0) k.item = null;
  } else {
    k.item = null;
  }

  if (item === 'mushroom' || item === 'triple') {
    k.boost = CFG.kart.boostDuration * I.mushroomBoost;
    if (k.isPlayer) sound.boost();
  } else if (item === 'shield') {
    k.shield = I.shieldTime;
    if (k.isPlayer) sound.shieldUp();
  } else if (item === 'star') {
    k.star = I.starTime;
    if (k.isPlayer) { showMessage('STAR POWER!'); sound.star(I.starTime); }
  } else if (item === 'bullet') {
    k.bullet = I.bulletTime;
    k.bulletLane = lateral(k.trackIdx, b.position);
    k.boost = 0;
    // Karts in the way get hit by distance (updateItems); letting the solver shove them at 140 km/h
    // would fling them about. Back on once the bullet is over and nobody is inside it.
    b.collisionResponse = false;
    if (k.isPlayer) { showMessage('BULLET!'); sound.bullet(); }
  } else if (item === 'blue') {
    const pos = roadPoint(k.trackIdx, 0, 1.0);
    shells.push({
      kind: 'blue', mesh: spawnModel('blue', pos), pos, vel: new THREE.Vector3(), idx: k.trackIdx,
      along: k.trackIdx, dir: 1, homing: false, owner: k, target: blueTarget(k), age: 0, life: I.blueLife, bounces: 0,
    });
    // forward to the leader; backwards when it's thrown from the front (the 2nd-placed kart is behind)
    const blue = shells[shells.length - 1];
    if (blue.target && blue.target.progress < k.progress) blue.dir = -1;
    showMessage(k.isPlayer ? 'BLUE SHELL!' : `BLUE SHELL FROM ${k.name.toUpperCase()}!`);
    sound.blueLaunch();
  } else if (item === 'banana' || item === 'bomb') {
    const FLY = 0.6, spd = Math.hypot(b.velocity.x, b.velocity.z);
    const dd = flip ? 14 + spd * FLY : -2.5; // flip = lobbed ahead: lands 14 m past where the kart will be by then (build 66.3)
    const pos = new THREE.Vector3(b.position.x + fx * dd, 0, b.position.z + fz * dd); // clear of the banana
    pos.y = surfaceY(k.trackIdx, clampLane(k.trackIdx, lateral(k.trackIdx, pos), 0)) + 0.14; // on the road, even mid-air; lifted so it doesn't look sunk into the asphalt
    const drop = { mesh: spawnModel(item, pos), pos, owner: k, age: 0, kind: item };
    if (flip) { // throw motion: the mesh arcs from the kart's hands to the landing spot, spinning, and only counts once it lands
      drop.fly = { t: 0, dur: FLY, from: new THREE.Vector3(b.position.x + fx * 1.2, b.position.y + 1.6, b.position.z + fz * 1.2) };
      drop.mesh.position.copy(drop.fly.from);
    }
    drops.push(drop);
    if (k.isPlayer || near(k, 25)) sound.drop();
  } else {
    const red = item === 'red';
    const ahead = red ? redShellTarget(k) : null;
    const speed = red ? I.redSpeed : I.shellSpeed;
    const back = flip && item === 'green'; if (back) { fx = -fx; fz = -fz; }
    const pos = new THREE.Vector3(b.position.x + fx * 2.4, 0, b.position.z + fz * 2.4); // fx/fz already flipped for a backward throw
    pos.y = surfaceY(k.trackIdx, clampLane(k.trackIdx, lateral(k.trackIdx, pos), 0)) + 0.03;
    // the player's green shell (build 64.45): aimed at the closest rival ahead (within 28 m, 70 deg of the nose),
    // else along the road's centre line 22 m ahead, so it doesn't just follow wherever the kart happens to point
    let dx = fx, dz = fz;
    if (item === 'green' && k.isPlayer && !back) {
      let aim = null, best = 28 * 28;
      for (const o of karts) {
        if (o === k || o.finished) continue;
        const ox = o.body.position.x - pos.x, oz = o.body.position.z - pos.z, d2 = ox * ox + oz * oz;
        if (d2 < best && d2 > 1 && (ox * fx + oz * fz) / Math.sqrt(d2) > 0.34) { best = d2; aim = o.body.position; }
      }
      if (!aim) aim = track.samples[(k.trackIdx + Math.round(22 / track.spacing)) % track.N];
      const ax = aim.x - pos.x, az = aim.z - pos.z, al = Math.hypot(ax, az) || 1;
      dx = ax / al; dz = az / al;
    }
    shells.push({
      kind: item, mesh: spawnModel(item, pos), pos,
      vel: new THREE.Vector3(dx * speed, 0, dz * speed), idx: k.trackIdx,
      owner: k, target: ahead || null, age: 0, life: red ? I.redLife : I.shellLife, bounces: 0,
    });
    if (k.isPlayer || ahead?.isPlayer || near(k, 25)) (red ? sound.throwRed() : sound.throwShell());
  }
}

/** The kart in front; AIs go for the player instead whenever the player is ahead and within range. */
function redShellTarget(k) {
  if (k.ai && !kart.finished) {
    const gap = (kart.progress - k.progress) * track.spacing;
    if (gap > 0 && gap < CFG.items.aiTargetPlayer) return kart;
  }
  return karts.find((o) => o.place === k.place - 1 && !o.finished) || null;
}

/** The blue shell goes for whoever leads the race (not its owner), and fizzles if they finish. */
function blueTarget(owner) {
  let best = null;
  for (const o of karts) if (o !== owner && !o.finished && (!best || o.place < best.place)) best = o;
  return best;
}

/** Hit sparks per item: yellow peel bits (banana), orange fireball + smoke (shells), blue (blue shell), gold stars (star / bullet). */
const HIT_FX = {
  banana: { n: 22, cols: [[1, 1, 1], [1, 0.86, 0.25]], up: 3, sp: 3.5 },
  green: { n: 30, cols: [[1, 0.55, 0.15], [1, 0.9, 0.3], [0.35, 0.35, 0.35]], up: 4.5, sp: 5 },
  red: { n: 30, cols: [[1, 0.35, 0.15], [1, 0.8, 0.25], [0.35, 0.35, 0.35]], up: 4.5, sp: 5 },
  blue: { n: 40, cols: [[0.35, 0.6, 1], [1, 1, 1], [0.3, 0.3, 0.4]], up: 6, sp: 6 },
  star: { n: 26, cols: [[1, 0.9, 0.3], [1, 1, 1]], up: 4, sp: 5 },
  bullet: { n: 26, cols: [[1, 0.9, 0.3], [1, 1, 1]], up: 4, sp: 5 },
};
function hitBurst(k, what) {
  const p = k.body.position, F = HIT_FX[what] || HIT_FX.banana;
  for (let i = 0; i < F.n; i++) {
    const a = Math.random() * Math.PI * 2, sp = F.sp * (0.7 + Math.random() * 0.8);
    emitP.set(p.x, p.y + 0.7, p.z);
    emitV.set(Math.cos(a) * sp, 1.5 + Math.random() * F.up, Math.sin(a) * sp);
    fx.emit(emitP, emitV, F.cols[i % F.cols.length], { life: 0.5 + Math.random() * 0.3, size: 0.35, grow: 0.4, alpha: 0.95 });
  }
}

/** Ring of cyan shards where a shield bubble took a hit. */
function shieldBurst(k) {
  const p = k.body.position;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2, sp = 5 + Math.random() * 2;
    emitP.set(p.x, p.y + 0.6, p.z);
    emitV.set(Math.cos(a) * sp, 0.5 + Math.random() * 2, Math.sin(a) * sp);
    fx.emit(emitP, emitV, i % 2 ? [1, 1, 1] : [0.5, 0.9, 1], { life: 0.45, size: 0.4, grow: 0.3, alpha: 0.9 });
  }
}

/** Item box popped: a white flash, a flat shockwave ring and a fountain of big coloured sparks. */
function boxBurst(pos, mine) {
  const n = mine ? 36 : 26, cols = [[1, 0.35, 0.35], [1, 0.9, 0.3], [0.4, 1, 0.5], [0.4, 0.8, 1], [0.8, 0.5, 1]];
  const y = pos.y + 0.5;
  for (let i = 0; i < 5; i++) { // flash
    emitP.set(pos.x, y, pos.z);
    emitV.set((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2);
    fx.emit(emitP, emitV, [1, 1, 1], { life: 0.35, size: 1.6, grow: 2.5, alpha: 0.9 });
  }
  for (let i = 0; i < 16; i++) { // ring
    const a = (i / 16) * Math.PI * 2;
    emitP.set(pos.x, y, pos.z);
    emitV.set(Math.cos(a) * 11, 0.3, Math.sin(a) * 11);
    fx.emit(emitP, emitV, [1, 1, 1], { life: 0.4, size: 0.7, grow: 0.5, alpha: 0.9 });
  }
  for (let i = 0; i < n; i++) { // fountain
    const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 6;
    emitP.set(pos.x, y, pos.z);
    emitV.set(Math.cos(a) * sp, 5 + Math.random() * 6, Math.sin(a) * sp);
    fx.emit(emitP, emitV, cols[i % cols.length], { life: 0.9 + Math.random() * 0.4, size: 0.9, grow: 0.2, alpha: 1 });
  }
}

/** A green shell going off (wall limit, banana, kart): a white flash, a green-yellow fireball and sparks. */
function shellExplosion(pos) {
  const y = pos.y + 0.5;
  for (let i = 0; i < 5; i++) {
    emitP.set(pos.x, y, pos.z);
    emitV.set((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2);
    fx.emit(emitP, emitV, [1, 1, 0.9], { life: 0.3, size: 1.8, grow: 3, alpha: 0.9 });
  }
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 8;
    emitP.set(pos.x, y, pos.z);
    emitV.set(Math.cos(a) * sp, 2 + Math.random() * 6, Math.sin(a) * sp);
    fx.emit(emitP, emitV, i % 3 ? [0.5, 1, 0.3] : [1, 0.85, 0.3], { life: 0.5 + Math.random() * 0.4, size: 0.9, grow: 0.8, alpha: 1 });
  }
}

/**
 * Hit by a banana / shell / star / bullet / blast. A star or a bullet makes a kart immune, a shield
 * takes the hit and pops. Returns whether the kart actually spun out.
 */
function spinOut(k, by, what, time = CFG.items.spinTime, ctx = {}) {
  // finished karts are out of it (build 36: a red shell hit Luna 11 s after she had crossed the line)
  if (k.spin > 0 || k.star > 0 || k.bullet > 0 || k.ghosted || k.finished) {
    if (k.isPlayer) teleEvent('hitskip', k, { by: by ? karts.indexOf(by) : -1, what, why: k.spin > 0 ? 'spin' : k.star > 0 ? 'star' : k.bullet > 0 ? 'bullet' : k.ghosted ? 'ghost' : 'finished' });
    return false;
  }
  if (k.shield > 0) {
    teleEvent('blocked', k, { by: by ? karts.indexOf(by) : -1, what });
    k.shield = 0;
    shieldBurst(k);
    if (k.isPlayer) { showMessage('BLOCKED!'); sound.shieldPop(); }
    else if (by?.isPlayer || near(k, 30)) sound.shieldPop();
    return false;
  }
  k.spin = k.spinTotal = time;
  k.spinKind = what;
  k.launch = null;
  k.hitBy = `${what} from ${by?.name}`;
  if (CFG.items.hit[what]) startHit(k, by, what, CFG.items.hit[what], ctx);
  else if (CFG.items.launch[what]) startWallLaunch(k, by, CFG.items.launch[what]);
  const Lh = k.launch; // hit log: how it was handled (mode splat / wall / shove / slide / blast / spin), the victim's speed + lateral offset, the flight distance and attacker offset
  teleEvent('hit', k, { by: by ? karts.indexOf(by) : -1, what, mode: Lh ? (Lh.mode || (Lh.splat ? 'splat' : 'wall')) : 'spin', kmh: Math.round(k.speed * 3.6),
    idx: k.trackIdx, lat: +lateral(k.trackIdx, k.body.position).toFixed(1), dur: +k.spinTotal.toFixed(2),
    ...(Lh?.dist !== undefined && { dist: +Lh.dist.toFixed(1), away: +Lh.away.toFixed(1) }), ...(Lh?.info && Lh.info) });
  k.boost = 0;
  k.driftCharge = 0;
  // Lose half the speed at once, then slide on: stopping dead got karts rear-ended into the air (the new hit motions set their own speed)
  if (!Lh?.mode) {
    k.body.velocity.x *= 0.5;
    k.body.velocity.z *= 0.5;
  }
  hitBurst(k, what);
  if (k.isPlayer) {
    showMessage('OUCH!');
    sound.hit(what);
    if (navigator.vibrate) navigator.vibrate(120);
  } else if (by?.isPlayer) {
    showMessage(`HIT ${k.name.toUpperCase()}!`);
    sound.hitOther();
    if (near(k, 30)) sound.hit(what, 0.5);
  } else if (near(k, 30)) sound.hit(what, 0.4);
  return true;
}

/**
 * Build 64.20: shells / banana / blue / bomb hit motions (CFG.items.hit). Sets k.launch = { mode, ... }; stepHit moves the body
 * each physics step, syncMeshes draws the tumble / spin / lift. `ctx`: dir (shell travel), scale + push + centre (a blast's bystanders).
 */
function startHit(k, by, what, H, ctx) {
  const b = k.body, v = b.velocity, sc = ctx.scale ?? 1;
  const fwd = b.quaternion.vmult(LOCAL_FWD, itemFwd), fh = Math.hypot(fwd.x, fwd.z) || 1;
  const L = { mode: H.mode, what, t: 0, dur: H.time, crashed: false, x0: b.position.x, z0: b.position.z, info: {} };
  if (H.mode === 'shove') {
    let dx = ctx.dir?.x ?? fwd.x, dz = ctx.dir?.z ?? fwd.z;
    const dh = Math.hypot(dx, dz) || 1;
    dx /= dh; dz /= dh;
    const along = v.x * dx + v.z * dz; // the victim's own speed along the throw adds a little
    Object.assign(L, { dx, dz, speed: H.speed + Math.max(0, along) * 0.6, hop: H.hop, flips: H.flips });
    L.info = { rel: +((dx * fwd.x + dz * fwd.z) / fh).toFixed(2), v: +L.speed.toFixed(1), hop: H.hop, flips: H.flips };
  } else if (H.mode === 'slide') {
    L.v0x = v.x; L.v0z = v.z; L.decay = H.decay; L.lat = H.lat; L.turns = H.turns;
    L.side = Math.random() < 0.5 ? -1 : 1;
    L.info = { lat: H.lat, turns: H.turns, side: L.side };
  } else {
    const c = ctx.centre, px = c ? b.position.x - c.x : -fwd.x, pz = c ? b.position.z - c.z : -fwd.z, ph = Math.hypot(px, pz) || 1;
    L.up = H.up * sc;
    v.x *= 0.35; v.z *= 0.35;
    if (ctx.push) { v.x += (px / ph) * H.push; v.z += (pz / ph) * H.push; } // the shockwave
    L.info = { up: +L.up.toFixed(1), push: ctx.push ? H.push : 0 };
  }
  k.launch = L;
  k.spin = k.spinTotal = H.time;
  if (H.eject) startEject(k, H);
}

const smokeP = new THREE.Vector3(), smokeV = new THREE.Vector3();
/** One physics step of a shove / slide / blast hit. */
function stepHit(k, L, dt) {
  const b = k.body, v = b.velocity, i = k.trackIdx;
  L.t += dt;
  const p = clamp(L.t / L.dur, 0, 1);
  if (L.mode === 'shove') {
    const s = L.speed * (1 - p) ** 1.5;
    v.x = L.dx * s; v.z = L.dz * s;
  } else if (L.mode === 'slide') {
    const n = track.normals[i], f = 1 - L.decay * p, w = L.lat * Math.sin(p * Math.PI);
    v.x = L.v0x * f + n.x * L.side * w; v.z = L.v0z * f + n.z * L.side * w;
    if (Math.random() < 0.45) { // tyre smoke off the sliding kart
      smokeP.set(b.position.x, b.position.y - 0.2, b.position.z);
      smokeV.set((Math.random() - 0.5) * 1.5, 0.6 + Math.random(), (Math.random() - 0.5) * 1.5);
      fx.emit(smokeP, smokeV, [0.8, 0.8, 0.82], { life: 0.5, size: 0.5, grow: 1.4, alpha: 0.55 });
    }
  } else if (!L.crashed && p >= 0.7) { // blast: the drop is over, it lands heavily
    L.crashed = true;
    splatFx(k);
    teleEvent('crash', k, { mode: 'blast', what: L.what, up: +L.up.toFixed(1) });
  }
  if (L.mode !== 'blast' && !L.crashed) { // into the wall before the motion ends: sparks, and the wall takes the sideways speed
    const lat = lateral(i, b.position), lim = lat > 0 ? track.wL[i] + CFG.track.curb - 0.7 : track.wR[i] + CFG.track.curb - 0.7;
    if (Math.abs(lat) > lim) {
      const n = track.normals[i], vn = v.x * n.x + v.z * n.z, side = Math.sign(lat), hs = Math.hypot(v.x, v.z);
      L.crashed = true;
      if (vn * side > 0) { v.x -= n.x * vn; v.z -= n.z * vn; }
      wallCrash(k, { speed: hs, side });
      teleEvent('crash', k, { mode: `${L.mode}-wall`, what: L.what, kmh: Math.round(hs * 3.6), t: +L.t.toFixed(2) });
    }
  }
}

/** Everyone in a blast: the victim goes full height, the rest are shoved outward and thrown up less. Logs who was caught. */
function blastVictims(owner, at, centre, radius, what) {
  const H = CFG.items.hit[what], caught = [];
  for (const k of karts) {
    const d2 = (k.body.position.x - centre.x) ** 2 + (k.body.position.z - centre.z) ** 2;
    if (k !== at && (d2 > radius ** 2 || Math.abs(k.body.position.y - centre.y) > 2.5)) continue;
    const main = k === at;
    if (spinOut(k, owner, what, undefined, { scale: main ? 1 : H.scale, push: !main, centre })) {
      caught.push(karts.indexOf(k));
      if (H.burn) k.burn = H.burn * (main ? 1 : H.scale);
    }
  }
  teleEvent('blast', owner, { what, at: karts.indexOf(at), caught, r: radius });
}

/** The bomb's explosion (build 65.4): a white-hot flash, a big rolling orange fireball, sparks, and black smoke rising after it. */
function bombFire(pos) {
  const y = pos.y + 0.7, R = Math.random;
  const put = (spread, up, cols, o) => {
    emitP.set(pos.x + (R() - 0.5) * 0.6, y + (R() - 0.5) * 0.4, pos.z + (R() - 0.5) * 0.6);
    const a = R() * Math.PI * 2, e = (R() - 0.3) * 1.2, h = Math.cos(e);
    emitV.set(Math.cos(a) * h * spread * (0.4 + R() * 0.6), Math.sin(e) * spread * 0.7 + up * (0.5 + R() * 0.5), Math.sin(a) * h * spread * (0.4 + R() * 0.6));
    fx.emit(emitP, emitV, cols[(R() * cols.length) | 0], o);
  };
  for (let i = 0; i < 8; i++) put(2, 1, [[1, 1, 0.85]], { life: 0.28, size: 5, grow: 2.2, alpha: 1 });                       // flash
  for (let i = 0; i < 60; i++) put(9, 3, [[1, 0.75, 0.15], [1, 0.45, 0.08], [0.95, 0.25, 0.05]], { life: 0.55 + R() * 0.55, size: 2.4 + R() * 1.6, grow: 1.1, alpha: 0.95 }); // fireball
  for (let i = 0; i < 26; i++) put(15, 8, [[1, 0.9, 0.4], [1, 0.6, 0.2]], { life: 0.5 + R() * 0.5, size: 0.45, grow: 0.2, alpha: 1 }); // sparks
  for (let i = 0; i < 22; i++) put(4, 7, [[0.14, 0.14, 0.16], [0.28, 0.26, 0.26]], { life: 1.2 + R() * 0.6, size: 2.2, grow: 2.2, alpha: 0.7 }); // smoke
}

/** The bomb goes off where a kart ran into it (or a shell hit it). */
function bombBlast(hit, owner, pos) {
  blastVictims(owner, hit, pos, CFG.items.bombBlast, 'bomb');
  bombFire(pos);
  const dist = Math.hypot(pos.x - kart.body.position.x, pos.z - kart.body.position.z);
  if (dist < 80) sound.explosion(clamp(1.2 - dist / 80, 0.3, 1));
}

// ---------- Ejected driver (bomb hit, build 65.3) ----------
// The driver is lifted out of the kart as its own object (reparented to the scene, ballistic arc + spin, a bounce or two),
// then flies back into the seat. The player's camera follows the driver meanwhile (camFocus).
const EJECT_G = 22;
const camFocus = new THREE.Vector3();
const ejQ = new THREE.Quaternion(), ejV = new THREE.Vector3(), ejSeat = new THREE.Vector3(), ejSeatQ = new THREE.Quaternion(), ejS = new THREE.Vector3();

function startEject(k, H) {
  const R = k.rider?.mesh, E = H.eject;
  if (!R || k.eject) return;
  R.updateWorldMatrix(true, false);
  const e = { t: 0, dur: H.time, ret: H.time - 0.7, pos: new THREE.Vector3(), q: new THREE.Quaternion(), vel: new THREE.Vector3(), av: new THREE.Vector3(),
    lp: R.position.clone(), lq: R.quaternion.clone(), ls: R.scale.clone(), ground: 0, bounces: 0, back: null };
  R.getWorldPosition(e.pos); R.getWorldQuaternion(e.q); R.getWorldScale(ejS);
  const lat = clamp(lateral(k.trackIdx, e.pos), -2, 2);
  e.ground = surfaceY(k.trackIdx, lat) + Math.max(0.4, e.pos.y - surfaceY(k.trackIdx, lat)); // rests at its seated height
  const v = k.body.velocity, a = Math.random() * Math.PI * 2;
  e.vel.set(v.x * 0.5 + Math.cos(a) * E.side, Math.sqrt(2 * EJECT_G * E.up), v.z * 0.5 + Math.sin(a) * E.side);
  e.av.set((Math.random() - 0.5) * E.spin, (Math.random() - 0.5) * E.spin, (Math.random() - 0.5) * E.spin);
  scene.add(R);
  R.position.copy(e.pos); R.quaternion.copy(e.q); R.scale.copy(ejS);
  k.eject = e;
  teleEvent('eject', k, { up: E.up });
}

function endEject(k) {
  const e = k.eject, R = k.rider?.mesh;
  k.eject = null;
  if (!R) return;
  k.group.add(R);
  R.position.copy(e.lp); R.quaternion.copy(e.lq); R.scale.copy(e.ls);
  if (near(k, 70)) for (let i = 0; i < 10; i++) { // a puff where the driver drops back in
    emitP.copy(k.group.position); emitP.y += 0.5;
    emitV.set((Math.random() - 0.5) * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 4);
    fx.emit(emitP, emitV, [0.9, 0.9, 0.9], { life: 0.5, size: 0.5, grow: 1.4, alpha: 0.6 });
  }
}

/** Per frame: the ejected drivers (arc, bounce, return to the seat). */
function updateEject(dt) {
  for (const k of karts) {
    const e = k.eject;
    if (!e) continue;
    const R = k.rider.mesh;
    if (!k.launch || k.launch.what !== 'bomb' || e.t >= e.dur) { endEject(k); continue; }
    e.t += dt;
    if (e.t < e.ret) {
      e.vel.y -= EJECT_G * dt;
      e.pos.addScaledVector(e.vel, dt);
      if (e.pos.y < e.ground && e.vel.y < 0) { // a bounce, losing energy
        e.pos.y = e.ground; e.vel.y *= -0.5; e.vel.x *= 0.6; e.vel.z *= 0.6; e.av.multiplyScalar(0.6); e.bounces++;
        if (e.vel.y < 2) e.vel.y = 0;
      }
      ejV.copy(e.av).multiplyScalar(dt);
      const ang = ejV.length();
      if (ang > 1e-5) e.q.premultiply(ejQ.setFromAxisAngle(ejV.normalize(), ang));
      R.position.copy(e.pos); R.quaternion.copy(e.q);
    } else { // flying back into the seat
      if (!e.back) e.back = { p: e.pos.clone(), q: e.q.clone() };
      const u = clamp((e.t - e.ret) / (e.dur - e.ret), 0, 1), m = u * u * (3 - 2 * u);
      ejSeat.copy(e.lp).applyMatrix4(k.group.matrixWorld);
      k.group.getWorldQuaternion(ejSeatQ);
      ejSeatQ.multiply(e.lq);
      e.pos.copy(e.back.p).lerp(ejSeat, m).y += Math.sin(u * Math.PI) * 1.2;
      e.q.copy(e.back.q).slerp(ejSeatQ, m);
      R.position.copy(e.pos); R.quaternion.copy(e.q);
    }
    if (k.isPlayer) { // the camera follows the driver
      camFocus.lerp(e.pos, 1 - Math.exp(-dt * 30)); // nearly rigid: the driver moves fast
    }
  }
}

/** Burning karts (bomb): flames and black smoke for `k.burn` seconds, whatever else the kart is doing. */
function updateBurn(dt) {
  for (const k of karts) {
    if (!(k.burn > 0)) continue;
    k.burn -= dt;
    if (k.burn <= 0) { k.burn = 0; teleEvent('burnend', k); continue; }
    if (!near(k, 70)) continue;
    const p = k.group.position;
    for (let i = 0; i < 2; i++) {
      emitP.set(p.x + (Math.random() - 0.5) * 0.9, p.y + 0.3 + Math.random() * 0.5, p.z + (Math.random() - 0.5) * 0.9);
      emitV.set((Math.random() - 0.5) * 1, 2 + Math.random() * 2, (Math.random() - 0.5) * 1);
      fx.emit(emitP, emitV, Math.random() < 0.55 ? [1, 0.5 + Math.random() * 0.3, 0.1] : [0.12, 0.12, 0.13], { life: 0.5 + Math.random() * 0.3, size: 0.55, grow: 1.2, alpha: 0.85 });
    }
  }
}

/** Star / bullet: fling the victim away from the attacker to the nearest wall on that side (scripted by stepLaunch). */
function startWallLaunch(k, by, LC) {
  const i = k.trackIdx, lat = lateral(i, k.body.position);
  const away = by ? lat - lateral(i, by.body.position) : 0;
  const side = Math.abs(away) > 0.5 ? Math.sign(away) : Math.sign(lat) || 1;
  const wallLat = side * ((side > 0 ? track.wL[i] : track.wR[i]) + CFG.track.curb - 0.7);
  const dist = Math.max(0, (wallLat - lat) * side);
  if (LC.splat && (Math.abs(away) <= LC.splatLat || dist < LC.minDist)) { // nowhere to fly: the bullet runs it over and flattens it
    k.launch = { splat: true, side, dist, away, t: 0, dur: 0, crash: LC.splat, crashed: false };
    k.spin = k.spinTotal = LC.splat;
    return;
  }
  const dur = clamp(dist / LC.speed, 0.12, 0.7);
  k.launch = { side, dist, away, wallLat, speed: dist / dur, dur, crash: LC.crash, hop: LC.hop, t: 0, crashed: false };
  k.spin = k.spinTotal = dur + LC.crash;
}

/** One physics step of a wall launch: slide across the road, then stop dead at the wall and crash. */
function stepLaunch(k, dt) {
  const L = k.launch, b = k.body, n = track.normals[k.trackIdx];
  if (L.mode) return stepHit(k, L, dt);
  L.t += dt;
  if (L.splat) {
    if (!L.crashed) {
      L.crashed = true;
      b.velocity.x *= 0.25;
      b.velocity.z *= 0.25;
      splatFx(k);
      teleEvent('crash', k, { mode: 'splat', kmh: Math.round(k.speed * 3.6) });
    }
    return;
  }
  const vn = b.velocity.x * n.x + b.velocity.z * n.z;
  if (L.t < L.dur) {
    const step = Math.min(L.speed * dt, Math.max(0, (L.wallLat - lateral(k.trackIdx, b.position)) * L.side));
    b.position.x += n.x * L.side * step;
    b.position.z += n.z * L.side * step;
    b.velocity.x += n.x * (L.side * L.speed - vn);
    b.velocity.z += n.z * (L.side * L.speed - vn);
  } else if (!L.crashed) {
    L.crashed = true;
    b.velocity.x -= n.x * vn;
    b.velocity.z -= n.z * vn;
    wallCrash(k, L);
    teleEvent('crash', k, { mode: 'wall', kmh: Math.round(k.speed * 3.6), v: +L.speed.toFixed(0) });
  }
}

/** A kart flattened by a bullet: a ring of dust, a crunch and a long buzz for the player. */
function splatFx(k) {
  const p = k.body.position;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, sp = 4 + Math.random() * 2;
    emitP.set(p.x, p.y + 0.2, p.z);
    emitV.set(Math.cos(a) * sp, 0.4 + Math.random(), Math.sin(a) * sp);
    fx.emit(emitP, emitV, i % 2 ? [0.75, 0.7, 0.62] : [0.55, 0.52, 0.5], { life: 0.6 + Math.random() * 0.3, size: 0.9, grow: 1.2, alpha: 0.8 });
  }
  if (k.isPlayer) { sound.crash(1.2); if (navigator.vibrate) navigator.vibrate([60, 40, 200]); }
  else if (near(k, 35)) sound.crash(0.6);
}

/** The kart hits the wall: sparks and dust off the wall, a thump, a buzz for the player. Harder with the launch speed. */
function wallCrash(k, L) {
  const v = clamp(L.speed / 30, 0.5, 1.4), n = track.normals[k.trackIdx], p = k.body.position;
  for (let i = 0; i < 18 * v; i++) {
    const sp = 3 + Math.random() * 5 * v;
    emitP.set(p.x + n.x * L.side * 0.6, p.y + 0.5, p.z + n.z * L.side * 0.6);
    emitV.set(-n.x * L.side * sp + (Math.random() - 0.5) * 3, 1 + Math.random() * 4, -n.z * L.side * sp + (Math.random() - 0.5) * 3);
    fx.emit(emitP, emitV, i % 3 ? [1, 0.85, 0.3] : [0.7, 0.65, 0.6], { life: 0.5 + Math.random() * 0.4, size: 0.4, grow: 0.6, alpha: 0.95 });
  }
  if (k.isPlayer) { sound.crash(v); if (navigator.vibrate) navigator.vibrate(200); }
  else if (near(k, 35)) sound.crash(v * 0.5);
}

const near = (k, m) => k.body.position.distanceSquared(kart.body.position) < m * m;

/** The blue shell's blast: everyone close to its target spins out for longer, and gets popped up a bit. */
function blueBlast(s, at) {
  const I = CFG.items, p = at.body.position;
  blastVictims(s.owner, at, p, I.blueBlast, 'blue');
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 7;
    emitP.set(p.x, p.y + 0.8, p.z);
    emitV.set(Math.cos(a) * sp, 2 + Math.random() * 6, Math.sin(a) * sp);
    fx.emit(emitP, emitV, i % 3 ? [0.35, 0.6, 1] : [1, 1, 1], { life: 0.8, size: 0.7, grow: 1.5, alpha: 0.9 });
  }
  const dist = Math.sqrt((p.x - kart.body.position.x) ** 2 + (p.z - kart.body.position.z) ** 2);
  if (dist < 80) sound.explosion(clamp(1 - dist / 80, 0.25, 1));
}

const blueA = new THREE.Vector3(), blueB = new THREE.Vector3();
/**
 * Blue shell: flies over the middle of the road at blueSpeed (through everything) until its target is
 * within blueHome m ahead, then dives at it. Returns true when it's done.
 */
function updateBlue(s, dt) {
  const I = CFG.items, { N, spacing } = track;
  if (s.target?.finished) return true; // the target crossed the line: the shell is dropped, not passed on
  if (!s.target) {
    s.target = blueTarget(s.owner);
    if (s.target) s.dir = (s.target.trackIdx - s.idx + N) % N < N / 2 ? 1 : -1;
  }
  const tgt = s.target;
  if (!tgt || s.life <= 0) return true;
  const tp = tgt.body.position;
  if (s.homing) {
    const dx = tp.x - s.pos.x, dy = tp.y + 0.6 - s.pos.y, dz = tp.z - s.pos.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1.4) { blueBlast(s, tgt); return true; }
    if (d > 60) { s.homing = false; s.along = s.idx; } // target got put back somewhere: fly the track again
    else {
      const step = Math.min(d, I.blueSpeed * dt) / d;
      s.pos.x += dx * step; s.pos.y += dy * step; s.pos.z += dz * step;
      s.idx = nearestTrackIndex(s.pos, s.idx);
    }
  }
  if (!s.homing) {
    s.along = (s.along + (s.dir * I.blueSpeed * dt) / spacing + N) % N;
    const i = Math.floor(s.along), j = (i + 1) % N;
    const h = Math.min(1 + s.age * 3, I.blueHeight) + Math.sin(s.age * 5) * 0.2; // climbs after launch, bobs
    s.pos.lerpVectors(roadPoint(i, 0, h, blueA), roadPoint(j, 0, h, blueB), s.along - i);
    s.idx = i;
    const ahead = (((tgt.trackIdx - i) * s.dir + N) % N) * spacing;
    if (ahead < I.blueHome) s.homing = true;
  }
  s.mesh.position.copy(s.pos);
  s.mesh.rotation.y += dt * 16;
  return false;
}

function updateItems(dt, racing) {
  const I = CFG.items;
  const { N, samples, normals } = track;
  // distance on the map, but nothing more than 2.5 m above or below counts (over a jump, on the bridge)
  const flat2 = (a, b) => (Math.abs(a.y - b.y) > 2.5 ? Infinity : (a.x - b.x) ** 2 + (a.z - b.z) ** 2);

  // --- Boxes: pick up, respawn
  for (const box of itemVis.boxes) {
    if (box.hidden > 0) { box.hidden = Math.max(0, box.hidden - dt); continue; }
    if (!racing) continue;
    for (const k of karts) {
      if (flat2(k.body.position, box.pos) > I.pickupRadius ** 2) continue;
      box.hidden = I.boxRespawn;
      if (k.isPlayer || near(k, 90)) boxBurst(box.pos, k.isPlayer);
      if (k.isPlayer) sound.boxPop(1);
      else { const d = k.body.position.distanceTo(kart.body.position); if (d < 60) sound.boxPop(0.5 * (1 - d / 60) ** 2); }
      if (!k.item && !k.finished) {
        k.item = rollItem(k.place, k);
        teleEvent('box', k, { item: k.item, place: k.place });
        k.itemCount = k.item === 'triple' ? 3 : 1;
        k.itemRoll = I.rollTime;
        k.boxAt = state.raceTime;
        if (k.ai) k.ai.itemT = dbg.on && dbg.aggro ? rand(0.1, 0.5) : rand(0.4, 2.5);
        if (k.isPlayer) sound.itemBox(I.rollTime);
      }
      break;
    }
  }

  // Telemetry (build 36, user: items "sometimes too much, sometimes nothing"): each box row the player passes
  // without getting an item, and why: 'holding' an item, row 'empty' (taken, respawning) or 'missed' (drove by)
  if (racing && !kart.finished) {
    const at = kart.trackIdx, prev = kart.rowCheckIdx ?? at;
    kart.rowCheckIdx = at;
    const ahead = (at - prev + N) % N;
    if (ahead > 0 && ahead < 20) {
      for (const row of track.def.boxRows) {
        const check = (row + 3) % N; // just past the row, after any pickup
        if ((check - prev + N) % N === 0 || (check - prev + N) % N > ahead) continue;
        if (state.raceTime - (kart.boxAt ?? -9) < 1.5) continue; // got one
        const open = itemVis.boxes.some((bx) => bx.idx === row && bx.hidden <= 0);
        teleEvent('boxmiss', kart, { row, why: kart.item ? 'holding' : open ? 'missed' : 'empty' });
      }
    }
  }

  for (const k of karts) {
    k.itemRoll = Math.max(0, k.itemRoll - dt);
    k.tripleT = Math.max(0, k.tripleT - dt);
    k.shield = Math.max(0, k.shield - dt);
    if (k.star > 0) {
      k.star = Math.max(0, k.star - dt);
      if (k.star === 0 && k.isPlayer) sound.starEnd();
    }
    // Bullet over: physical again once no kart is inside it
    if (k.bullet <= 0 && !k.body.collisionResponse &&
      !karts.some((o) => o !== k && o.body.position.distanceSquared(k.body.position) < 3.2 * 3.2)) {
      k.body.collisionResponse = true;
    }
    // A star drives through the other karts (they spin out and fly aside instead of stalling it); it turns
    // solid again once no kart is inside it, as after a bullet or a respawn
    if (k.star > 0) k.passT = true;
    else if (k.passT && !karts.some((o) => o !== k && o.body.position.distanceSquared(k.body.position) < 3.2 * 3.2)) k.passT = false;
    k.body.collisionFilterMask = k.ghosted || k.passT ? -1 & ~KART_GROUP : -1;
    // Star / bullet: anyone touched spins out and gets knocked aside
    if (racing && (k.star > 0 || k.bullet > 0)) {
      for (const o of karts) {
        if (o === k) continue;
        const d2 = flat2(o.body.position, k.body.position);
        let inside = d2 <= I.bumpRadius ** 2;
        if (k.bullet > 0 && d2 < 36) { // the bullet is long and wide: a box in its own frame, not a circle (side and rear hits were missed)
          const f = k.body.quaternion.vmult(LOCAL_FWD, aiFwd), fl = Math.hypot(f.x, f.z) || 1;
          const dx = o.body.position.x - k.body.position.x, dz = o.body.position.z - k.body.position.z;
          const lo = (dx * f.x + dz * f.z) / fl, la = (dx * f.z - dz * f.x) / fl;
          inside = Math.abs(la) < I.bulletHalfW && lo > -I.bulletRear && lo < I.bulletFront;
        }
        if (!inside) { // log a close pass at the player that did not count as a hit (1 per attacker per second)
          if (o.isPlayer && d2 < 36 && !(k.nearT > state.raceTime)) {
            k.nearT = state.raceTime + 1;
            teleEvent('near', o, { by: karts.indexOf(k), what: k.bullet > 0 ? 'bullet' : 'star', d: +Math.sqrt(d2).toFixed(1), away: +(lateral(o.trackIdx, o.body.position) - lateral(o.trackIdx, k.body.position)).toFixed(1) });
          }
          continue;
        }
        spinOut(o, k, k.bullet > 0 ? 'bullet' : 'star'); // flung to the wall by startWallLaunch
      }
    }
    // --- Boost pads
    k.padT = Math.max(0, k.padT - dt);
    if (!racing) continue;
    for (const pad of itemVis.pads) {
      const along = (k.trackIdx - pad.idx + N + pad.len / 2) % N;
      if (along > pad.len) continue;
      const s = samples[k.trackIdx], n = normals[k.trackIdx];
      const lat = (k.body.position.x - s.x) * n.x + (k.body.position.z - s.z) * n.z;
      if (Math.abs(lat - pad.lane) > I.padWidth / 2 + 0.3) continue;
      if (k.padT <= 0 && k.isPlayer) sound.boost();
      k.boost = Math.max(k.boost, CFG.kart.boostDuration);
      k.padT = 0.5;
    }
  }

  // --- Bananas (a star or bullet runs them over without a wobble, a shield takes the hit)
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.age += dt;
    if (d.fly) { // in the air: parabola, tumbling, no hits until it lands (then a small bounce puff)
      const f = d.fly, u = Math.min(1, (f.t += dt) / f.dur);
      d.mesh.position.set(f.from.x + (d.pos.x - f.from.x) * u, f.from.y + (d.pos.y - f.from.y) * u + Math.sin(u * Math.PI) * 4.5, f.from.z + (d.pos.z - f.from.z) * u);
      d.mesh.rotation.x += dt * 14;
      if (u < 1) continue;
      d.mesh.position.copy(d.pos); d.mesh.rotation.x = 0; d.fly = null; d.age = Math.max(d.age, 0.8);
      if (near(d.owner, 70)) sound.drop();
    }
    const hit = karts.find((k) => (k !== d.owner || d.age > 0.8) && !k.finished && flat2(k.body.position, d.pos) < I.bananaRadius ** 2);
    if (hit) {
      teleEvent(d.kind === 'bomb' ? 'bombhit' : 'bananahit', hit, { by: karts.indexOf(d.owner), age: +d.age.toFixed(1) });
      if (d.kind === 'bomb') bombBlast(hit, d.owner, d.pos);
      else spinOut(hit, d.owner, 'banana');
      scene.remove(d.mesh);
      drops.splice(i, 1);
    }
  }

  // --- Shells: green ones fly straight and bounce off the walls; red ones follow the track
  // and home in on their target once close; the blue one flies over everything to the leader
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    s.age += dt;
    s.life -= dt;
    if (s.kind === 'blue') {
      if (updateBlue(s, dt)) { scene.remove(s.mesh); shells.splice(i, 1); }
      continue;
    }
    const tgt = s.target && !s.target.finished ? s.target : null;
    if (s.kind === 'red') {
      let aim;
      if (tgt && flat2(tgt.body.position, s.pos) < I.redHomeDist ** 2) {
        aim = tgt.body.position;
      } else {
        const j = (s.idx + 9) % N;
        aim = samples[j];
      }
      const want = Math.atan2(aim.x - s.pos.x, aim.z - s.pos.z);
      const cur = Math.atan2(s.vel.x, s.vel.z);
      const yaw = cur + clamp(wrapAngle(want - cur), -7 * dt, 7 * dt);
      s.vel.set(Math.sin(yaw) * I.redSpeed, 0, Math.cos(yaw) * I.redSpeed);
    }
    s.pos.addScaledVector(s.vel, dt);
    s.idx = nearestTrackIndex(s.pos, s.idx);
    const c = samples[s.idx], n = normals[s.idx];
    const lat = (s.pos.x - c.x) * n.x + (s.pos.z - c.z) * n.z;
    const wallLat = (lat > 0 ? track.wL[s.idx] : track.wR[s.idx]) + CFG.track.curb - 0.35;
    if (Math.abs(lat) > wallLat) {
      const side = Math.sign(lat);
      s.pos.addScaledVector(n, (side * wallLat - lat) * 1.01);
      const vn = s.vel.x * n.x + s.vel.z * n.z;
      if (vn * side > 0) {
        s.vel.x -= 2 * vn * n.x;
        s.vel.z -= 2 * vn * n.z;
        if (s.kind === 'green') s.bounces++;
      }
    }
    s.pos.y = surfaceY(s.idx, clampLane(s.idx, lateral(s.idx, s.pos), 0)) + 0.03; // shells ride on the road
    s.mesh.position.copy(s.pos);
    s.mesh.rotation.y += dt * 12;

    let gone = s.life <= 0 || s.bounces >= I.shellBounces;
    // a red shell never hits its owner (build 36: Bolt was hit by his own); a green one bouncing back still can
    const hit = !gone && karts.find((k) => (k !== s.owner || (s.kind === 'green' && s.age > 0.6)) && !k.finished
      && flat2(k.body.position, s.pos) < I.hitRadius ** 2);
    if (hit) { spinOut(hit, s.owner, s.kind, undefined, { dir: s.vel }); gone = true; }
    const banana = gone ? -1 : drops.findIndex((d) => !d.fly && flat2(d.pos, s.pos) < 1.6);
    if (banana >= 0) {
      scene.remove(drops[banana].mesh);
      drops.splice(banana, 1);
      gone = true;
    }
    if (gone) {
      teleEvent('shellend', s.owner, { kind: s.kind, end: hit ? 'hit' : banana >= 0 ? 'drop' : s.life <= 0 ? 'life' : 'bounces', age: +s.age.toFixed(1), victim: hit ? karts.indexOf(hit) : -1 });
      if (s.kind === 'green') {
        shellExplosion(s.pos);
        const d = s.pos.distanceTo(kart.body.position);
        if (d < 70) sound.shellBang(0.6 * (1 - d / 70) ** 2 + 0.1);
      }
      scene.remove(s.mesh);
      shells.splice(i, 1);
    }
  }
}

/** A red shell within ~45 m or the blue one within ~90 m coming for kart k: the warning icon + alarm. */
function shellIncoming(k) {
  if (k.finished) return false;
  return shells.some((s) => s.target === k && (s.kind === 'red' || s.kind === 'blue') &&
    (s.pos.x - k.body.position.x) ** 2 + (s.pos.z - k.body.position.z) ** 2 < (s.kind === 'blue' ? 90 : 45) ** 2);
}

/** A corner (radius < 45 m) starting within `within` m ahead of sample idx: where a banana trap goes. */
function trapCorner(idx, within = 40) {
  const { N, radius, spacing } = track;
  for (let s = 4; s * spacing < within; s += 2) if (radius[(idx + s) % N] < 45) return true;
  return false;
}

/**
 * AI item use: mushrooms on a straight, banana when someone's on its tail, shells at whoever's ahead,
 * the shield when a shell (or a star / bullet) is coming, star / bullet / blue shell straight away.
 */
function updateAIItem(k, dt) {
  const ai = k.ai, st = ai.style, aggro = dbg.on && dbg.aggro; // aggro (DEBUG): weapons go at the player from further away and are never held back
  if (!k.item || k.itemRoll > 0 || k.finished || k.spin > 0 || k.bullet > 0) return;
  ai.itemT -= dt;
  if (ai.itemT > 0) return;
  const { N, radius, spacing } = track;
  const fwd = k.body.quaternion.vmult(LOCAL_FWD, aiFwd);
  let use = false;
  if (k.item === 'mushroom' || k.item === 'triple') {
    let tight = Infinity;
    for (let s = 10; s * spacing < 40; s += 3) tight = Math.min(tight, radius[(k.trackIdx + s) % N]);
    use = tight > 60 || ai.itemT < (st.wild ? -1 : -6);
  } else if (k.item === 'red' && !aggro && (st.hoard || st.overtake > 0.9)) {
    // the careful ones wait until a kart ahead is close enough for the shell to lock on
    use = ai.itemT < -10 || karts.some((o) => o !== k && o.progress > k.progress && (o.progress - k.progress) * spacing < 40);
  } else if (k.item === 'red' || k.item === 'blue' || k.item === 'star' || k.item === 'bullet') {
    use = true;
  } else if (k.item === 'shield') {
    use = shellIncoming(k) || ai.itemT < (st.hoard ? -25 : -4) || karts.some((o) => (o.star > 0 || o.bullet > 0) && o !== k &&
      o.body.position.distanceSquared(k.body.position) < 20 * 20);
  } else {
    const wantBehind = k.item === 'banana' || k.item === 'bomb';
    use = ai.itemT < (wantBehind ? (st.hoard || st.trap ? -20 : -7) : -10);
    // the trap: dropped on the racing line just before a corner, where everyone (the player too) will drive
    if (wantBehind && st.trap && trapCorner(k.trackIdx, 18) &&
      Math.abs(lateral(k.trackIdx, k.body.position) - track.line[k.trackIdx]) < 1.2) use = true;
    const tail = st.aggression > 0.7 ? 20 : 14; // the bully drops it for anyone within 20 m
    const reach = aggro ? 55 : 30, wide = aggro ? 0.2 : 0.12;
    for (const o of karts) {
      if (o === k) continue;
      const dx = o.body.position.x - k.body.position.x, dz = o.body.position.z - k.body.position.z;
      const ahead = dx * fwd.x + dz * fwd.z;
      const side = Math.abs(dx * fwd.z - dz * fwd.x);
      if (wantBehind) {
        if (ahead < -2 && ahead > -(aggro && o.isPlayer ? 45 : tail) && side < (aggro && o.isPlayer ? 4 : 3)) use = true;
      } else if (ahead > 3 && ahead < reach && side < ahead * wide + 0.6 && (o.isPlayer || st.aggression > 0.7 || ai.itemT < -5)) {
        use = true; // shells go at the player (the bully: at anyone); other AIs only once it's been held a while
      }
    }
  }
  if (!use) return;
  const triple = k.item === 'triple';
  useItem(k);
  if (triple && k.item) ai.itemT = rand(0.6, 1.6); // the next mushroom a moment later
}

/* ==========================================================================
 * 4. PHYSICS STEP
 * ========================================================================== */
const speedFx = { v: 0 }; // 0..1 strength of the radial blur (see render())
/**
 * Vertical view auto-gas (build 64.35, smarter): lift only if coasting from now is needed to be slow enough by the time the kart
 * reaches a tight corner. Corner speed = sqrt(14 m/s^2 x radius) x 1.25 (a little over the grip limit: a touch of rail is fine,
 * the kart rarely needs to lift); coasting sheds about 6 m/s^2. So a 12 m hairpin lifts ~34 m before it, a 28 m bend only in the last few m.
 */
const AUTO_GAS = { grip: 22, margin: 1.1, decel: 6, look: 45, maxRadius: 45 };
/** tooFastForCorner + a log of every lift (on / off, where, how fast, which corner, how long) for the telemetry. */
function autoLift(k) {
  const on = tooFastForCorner(k);
  if (on !== !!k.lifting) {
    k.lifting = on;
    teleEvent('lift', k, { on, idx: k.trackIdx, kmh: Math.round(k.speed * 3.6), ...(on ? { r: Math.round(k.liftR) } : { dur: +(state.raceTime - k.liftT).toFixed(2) }) });
    if (on) k.liftT = state.raceTime;
  }
  return on;
}
function tooFastForCorner(k) {
  const { N, spacing } = track, A = AUTO_GAS, v = k.speed;
  for (let s = 0; s * spacing < A.look; s++) {
    const r = track.lineRadius[(k.trackIdx + s) % N]; // the racing line's radius (a driver cuts the corner), as the AIs use
    if (r > A.maxRadius) continue;
    const need = Math.sqrt(A.grip * r) * A.margin;
    if (v > need && s * spacing <= (v * v - need * need) / (2 * A.decel)) { k.liftR = r; return true; }
  }
  return false;
}
const tmpVec = new CANNON.Vec3();
const tmpFwd = new CANNON.Vec3();

function stepPhysics(dt) {
  const canDrive = state.phase === 'race' || state.phase === 'finished';
  for (const k of karts) {
    if (k.ai && DEBUG && dbg.on && dbg.parked) {
      Object.assign(k.ctl, { steer: 0, gas: false, brake: true }); // parked rival (debug panel)
    } else if (k.ai) {
      updateAI(k, dt, canDrive);
    } else {
      k.ctl.steer = clamp((input.right ? 1 : 0) - (input.left ? 1 : 0) + input.axis, -1, 1);
      k.ctl.brake = input.brake;
      // Vertical view: no gas button, always on; it lifts only for a really tight corner coming up too fast (build 64.27)
      k.ctl.gas = app.classList.contains('vertical')
        ? canDrive && !input.brake && !autoLift(k)
        : input.gas;
      if (input.item && canDrive && !k.finished) useItem(k);
      else if (input.itemAlt && canDrive && !k.finished) useItem(k, true);
    }
    driveKart(k, dt, canDrive);
  }
  world.step(CFG.physicsStep, dt, CFG.maxSubSteps);
}

/** Turns a kart's controls (k.ctl) into steering, drift, boost, engine and brake forces. */
function driveKart(k, dt, canDrive) {
  const K = CFG.kart;
  const { body, vehicle, ctl } = k;

  const fwd = body.quaternion.vmult(LOCAL_FWD, tmpFwd);
  const speed = body.velocity.dot(fwd); // signed forward speed (m/s)
  k.speed = speed;
  const speedRatio = clamp(Math.abs(speed) / K.maxSpeed, 0, 1);

  // --- Steering: the player's buttons are digital, so ramp toward lock gradually and recentre
  // quickly. Lock shrinks with speed so a held button can't ask for more grip than the tyres
  // have. Positive input = right.
  const steerInput = ctl.steer;
  const recentring = Math.abs(steerInput) < Math.abs(k.steerSmooth) || Math.sign(steerInput) !== Math.sign(k.steerSmooth);
  const maxDelta = (recentring ? K.steerReturn : K.steerRate) * dt;
  k.steerSmooth += clamp(steerInput - k.steerSmooth, -maxDelta, maxDelta);
  const steerAngle = -k.steerSmooth * lerp(K.maxSteerLow, K.maxSteerHigh, Math.sqrt(speedRatio));
  vehicle.setSteeringValue(steerAngle, 0);
  vehicle.setSteeringValue(steerAngle, 1);

  // --- Drift: holding a turn at speed (lock ramps past ~75%) lowers rear grip a bit
  const driftAmt = canDrive
    ? clamp((Math.abs(k.steerSmooth) - 0.75) / 0.25, 0, 1) * clamp((speed - K.driftMinSpeed) / 6, 0, 1)
    : 0;
  k.driftAmt = driftAmt;
  const iceMul = lerp(1, K.iceGrip, track.ice[k.trackIdx]);
  const rearGrip = lerp(K.rearGrip, K.driftGrip, driftAmt) * iceMul;
  vehicle.wheelInfos[0].frictionSlip = vehicle.wheelInfos[1].frictionSlip = K.frontGrip * iceMul;
  vehicle.wheelInfos[2].frictionSlip = rearGrip;
  vehicle.wheelInfos[3].frictionSlip = rearGrip;
  if (driftAmt > 0) body.angularVelocity.y -= k.steerSmooth * driftAmt * K.driftYawAssist * dt;

  // --- Mini-turbo: drift long enough, then release
  const drifting = driftAmt > 0.55;
  if (drifting) {
    const wasCharged = k.driftCharge > K.miniTurboTime;
    k.driftCharge += dt;
    if (k.isPlayer && !wasCharged && k.driftCharge > K.miniTurboTime) sound.charged();
  } else {
    if (k.driftCharge > K.miniTurboTime) {
      k.boost = K.boostDuration;
      if (k.isPlayer) { showMessage('BOOST!'); sound.boost(); }
    }
    k.driftCharge = 0;
  }
  k.drifting = drifting;
  k.boost = Math.max(0, k.boost - dt);
  k.rocketT = Math.max(0, (k.rocketT || 0) - dt);
  const boosting = k.boost > 0;

  // --- Engine & brakes
  let engine = 0, brake = 0;
  k.braking = false;
  if (k.bullet > 0) {
    // Bullet: bulletGuide (preStep) does the driving; the wheels just roll
    k.bullet = Math.max(0, k.bullet - dt);
    if (k.bullet === 0) k.boost = 0.6; // fire out of it instead of hitting a wall of drag
    vehicle.setSteeringValue(0, 0);
    vehicle.setSteeringValue(0, 1);
  } else if (k.spin > 0) {
    // Spun out by a banana / shell: no power, scrub off speed, wheels straight
    k.spin = Math.max(0, k.spin - dt);
    if (k.launch) {
      stepLaunch(k, dt);
      if (k.spin === 0) { // recovered: where and how fast it is back on the road
        teleEvent('hitend', k, { mode: k.launch.mode || (k.launch.splat ? 'splat' : 'wall'), what: k.launch.what, kmh: Math.round(k.speed * 3.6), idx: k.trackIdx, lat: +lateral(k.trackIdx, k.body.position).toFixed(1),
          ...(k.launch.x0 !== undefined && { moved: +Math.hypot(k.body.position.x - k.launch.x0, k.body.position.z - k.launch.z0).toFixed(1) }), crashed: !!k.launch.crashed });
        k.launch = null;
      }
    }
    brake = K.wheelBrake;
    k.braking = true;
    vehicle.setSteeringValue(0, 0);
    vehicle.setSteeringValue(0, 1);
  } else if (canDrive && k.stall > 0) {
    k.stall = Math.max(0, k.stall - dt); // jumped the start: the engine bogs down
    brake = K.wheelBrake;
  } else if (canDrive) {
    // the star's extra speed: AIs get it through their pace (updateAI), so corner braking still works
    const top = K.maxSpeed * k.topMult + Math.max(boosting ? K.boostSpeed : 0, k.star > 0 && !k.ai ? CFG.items.starSpeed : 0);
    if (ctl.brake) {
      k.boost = 0; // braking cancels a boost
      if (speed > 1) { brake = K.wheelBrake; k.braking = true; }
      else if (speed > -K.maxReverse) engine = -K.reverseForce;
    } else if (ctl.gas || boosting) {
      if (speed < top) engine = K.engineForce;
    } else {
      brake = k.ai ? CFG.ai.coast : K.playerCoast;
    }
  } else {
    brake = K.wheelBrake; // held still on the grid (menu / countdown): see applyStabilityAssist
  }
  k.held = !canDrive;
  // cannon-es pushes along -forward for positive force with this axle setup, hence the negation
  vehicle.applyEngineForce(-engine, 2);
  vehicle.applyEngineForce(-engine, 3);
  for (let i = 0; i < 4; i++) vehicle.setBrake(brake, i);

  k.steerAngle = steerAngle;
}

/**
 * In the air (jumps, crests), turn the kart gently toward the road's tilt under it and damp any tumbling,
 * so it lands on its wheels. Yaw (about the kart's own up) is left alone.
 */
const airUp = new CANNON.Vec3(), airAxis = new CANNON.Vec3(), airSpin = new CANNON.Vec3();
const airM = new THREE.Matrix4();
function airLevel(k) {
  const K = CFG.kart, body = k.body, dt = CFG.physicsStep;
  const up = body.quaternion.vmult(LOCAL_UP, airUp);
  const e = roadBasis(k.trackIdx, airM).elements; // column 1 = the road's up
  up.cross(airAxis.set(e[4], e[5], e[6]), airAxis); // axis * sin(angle) toward the road's up
  const av = body.angularVelocity;
  const spin = up.scale(av.dot(up), airSpin);      // keep the yaw part
  av.x += (spin.x - av.x) * K.airDamp * dt + airAxis.x * K.airLevel * dt;
  av.y += (spin.y - av.y) * K.airDamp * dt + airAxis.y * K.airLevel * dt;
  av.z += (spin.z - av.z) * K.airDamp * dt + airAxis.z * K.airLevel * dt;
}

/**
 * Stability assist, run on every kart before every physics sub-step: compare the kart's yaw rate
 * with what the front wheels ask for (bicycle model, capped by available grip) and bleed off any
 * excess, so the tail can't swing round into a spin. Drifting allows some extra rotation.
 */
function applyStabilityAssist(k) {
  const K = CFG.kart;
  const { body, vehicle } = k;
  if (k.held) {
    // On the grid: pinned, except for settling onto the suspension. Holding karts with the brakes
    // (brakeForce, an impulse cap) twisted them ~9 deg on the canyon grid's slight slope: the left and
    // right wheels' brake impulses fought each other. The flat meadow never loaded the brakes.
    body.velocity.x = body.velocity.z = 0;
    body.angularVelocity.y = 0;
    return;
  }
  if (k.bullet > 0) { bulletGuide(k); return; }
  body.angularVelocity.y = clamp(body.angularVelocity.y, -K.maxYawRate, K.maxYawRate);

  if (k.railProbe && (k.railProbe.t -= CFG.physicsStep) <= 0) {
    teleEvent('railpost', k, { ...k.railProbe, v1: Math.round(Math.hypot(body.velocity.x, body.velocity.z) * 3.6), fwd: Math.round(k.speed * 3.6) });
    k.railProbe = null;
  }

  // Rail contact this step: a hit costs a share of speed by how hard it was, sliding along costs a bit more
  if (k.wallTouch) {
    const hit = clamp((k.wallHit - 1.5) * K.wallHitLoss, 0, K.wallHitMax);
    if (k.isPlayer && hit > 0.03) teleEvent('rail', k, { loss: +hit.toFixed(2), kmh: Math.round(k.speed * 3.6), idx: k.trackIdx, up: +body.quaternion.vmult(LOCAL_UP, tmpVec).y.toFixed(2), vy: +body.velocity.y.toFixed(1) });
    const scale = (1 - hit) * (1 - K.wallScrape * CFG.physicsStep);
    body.velocity.x *= scale;
    body.velocity.z *= scale;
    // Glance, don't stop: a head-on hit used to leave only the speed along the rail (none at 90 degrees), so the
    // kart stalled and had to build up from 0. Keep railGlide of the speed that went into the rail, as speed along it
    // (towards where the kart is already heading), so it is carried round the bend like in Mario Kart.
    if (k.wallHit > 3 && (k.wallNx || k.wallNz)) {
      const vin = Math.hypot(k.wallVx, k.wallVz), vn = k.wallVx * k.wallNx + k.wallVz * k.wallNz; // vn < 0: into the rail
      let tx = -k.wallNz, tz = k.wallNx;
      const f0 = body.quaternion.vmult(LOCAL_FWD, tmpFwd);
      const along = k.wallVx * tx + k.wallVz * tz;
      if (Math.abs(along) > 0.5 ? along < 0 : f0.x * tx + f0.z * tz < 0) { tx = -tx; tz = -tz; }
      const want = Math.min(Math.abs(along) + K.railGlide * Math.max(0, -vn), vin * 0.85) * (1 - hit);
      const have = body.velocity.x * tx + body.velocity.z * tz;
      if (have < want) { body.velocity.x += (want - have) * tx; body.velocity.z += (want - have) * tz; }
      if (k.isPlayer) { // diagnostics for the race log: how head-on, what the glide set, what is left 0.35 s later (see 'railpost')
        k.railProbe = { t: 0.35, idx: k.trackIdx, into: +(-(f0.x * k.wallNx + f0.z * k.wallNz)).toFixed(2), vin: Math.round(vin * 3.6),
          along: Math.round(Math.abs(along) * 3.6), want: Math.round(want * 3.6), v0: Math.round(Math.hypot(body.velocity.x, body.velocity.z) * 3.6) };
      }
    }
    k.wallTouch = false;
    k.wallHit = 0;
  }

  // No rebound: the solver's push out of a rail (worst where the wall bends: two segments or a seam
  // at once) is cut every step, along each rail contact's own normal. Sliding along the rail stays.
  let touching = false, wallNx = 0, wallNz = 0;
  for (const c of world.contacts) {
    const mine = c.bi === body ? -1 : c.bj === body ? 1 : 0;
    if (!mine) continue;
    const other = mine < 0 ? c.bj : c.bi;
    if (other.material !== physMats.wall) continue;
    const nx = c.ni.x * mine, nz = c.ni.z * mine, nl = Math.hypot(nx, nz);
    if (nl < 0.3) continue; // floor-ish contact
    const away = (body.velocity.x * nx + body.velocity.z * nz) / nl;
    wallNx = nx / nl; wallNz = nz / nl; // (the last rail contact's way out, for the unstick nudge)
    // Keep up to railPush m/s out of the rail: that is how the solver frees a kart that sank into it (cutting
    // all of it left karts embedded and stuck); only the rebound above that is removed.
    if (away > K.railPush) { const cut = away - K.railPush; body.velocity.x -= cut * nx / nl; body.velocity.z -= cut * nz / nl; }
    // Nose into the rail (a near head-on hit used to stop the kart dead, then flip it or leave it pointing at the
    // rail until the stuck timer reset it): swing it round to run along the rail, and calm roll/pitch spin.
    const f = body.quaternion.vmult(LOCAL_FWD, tmpFwd), into = -(f.x * nx + f.z * nz) / nl;
    if (into > 0.25) {
      let tx = -nz / nl, tz = nx / nl;
      if (f.x * tx + f.z * tz < 0) { tx = -tx; tz = -tz; }
      const dir = Math.sign(f.z * tx - f.x * tz);
      body.angularVelocity.y = clamp(body.angularVelocity.y + dir * K.railTurn * into * CFG.physicsStep, -K.maxYawRate, K.maxYawRate);
      body.angularVelocity.x *= 0.7; body.angularVelocity.z *= 0.7;
    }
    touching = true;
  }
  if (touching) {
    // Don't climb the rail (canyon banks / whoops: a tilted kart rode up the upright wall): cap the upward speed
    // at what the road's own slope gives, plus a little, and calm roll/pitch spin
    const i0 = k.trackIdx, i1 = (i0 + 3) % track.N, i2 = (i0 - 3 + track.N) % track.N;
    const slopeVy = Math.max(0, (track.samples[i1].y - track.samples[i2].y) / (6 * track.spacing)) * Math.hypot(body.velocity.x, body.velocity.z);
    const maxVy = slopeVy + K.railClimb;
    if (body.velocity.y > maxVy) body.velocity.y = maxVy;
    body.angularVelocity.x *= 0.85; body.angularVelocity.z *= 0.85;
    // Dead against the rail with the gas held (player only: the AIs have their own watchdog): nudge it back along
    // the road and a little off the wall, so it gets going instead of waiting for the stuck reset
    if (k.isPlayer && k.ctl.gas && !k.ctl.brake && k.speed < K.railFreeBelow) {
      const t = track.tangents[i0], tl = Math.hypot(t.x, t.z) || 1;
      const dv = K.railFree * CFG.physicsStep;
      body.velocity.x += (t.x / tl) * dv + wallNx * dv * 0.5;
      body.velocity.z += (t.z / tl) * dv + wallNz * dv * 0.5;
    }
  }

  const fwd = body.quaternion.vmult(LOCAL_FWD, tmpFwd);
  const speed = body.velocity.dot(fwd);
  const onGround = vehicle.wheelInfos.some((w) => w.raycastResult.hasHit);
  if (!onGround) airLevel(k);
  // Boost: extra push through the centre of mass. Doing it with more wheel torque popped wheelies
  // and flipped karts that hit a boost pad at low speed.
  // (the star pushes the same way, up to its own higher top speed)
  const boostPush = k.boost > 0 && speed < K.maxSpeed * k.topMult + K.boostSpeed ? (k.rocketT > 0 ? K.rocketAccel : K.boostAccel) : 0;
  const starPush = k.star > 0 && speed < K.maxSpeed * k.topMult + CFG.items.starSpeed ? CFG.items.starAccel : 0;
  if ((boostPush || starPush) && k.spin <= 0 && onGround) {
    const dv = Math.max(boostPush, starPush) * CFG.physicsStep;
    body.velocity.x += fwd.x * dv;
    body.velocity.z += fwd.z * dv;
  }
  // Brakes, same idea: a big brake torque at the tyres pitched the kart onto its roof at speed
  if (k.braking && speed > 0 && onGround) {
    const dv = Math.min(speed, K.brakeDecel * CFG.physicsStep);
    body.velocity.x -= fwd.x * dv;
    body.velocity.z -= fwd.z * dv;
  }

  if (speed < 3 || !vehicle.wheelInfos.every((w) => w.raycastResult.hasHit)) return;

  // a bank tilted into the turn adds g * tan(bank) of cornering (bank > 0 raises the left: helps right turns)
  const bankHelp = Math.max(0, Math.sign(k.steerSmooth) * track.bank[k.trackIdx]) * -CFG.gravity;
  const gripLimit = (K.maxLateralAccel * lerp(1, K.iceGrip, track.ice[k.trackIdx]) + bankHelp) / speed;
  const targetYaw = clamp((speed * Math.tan(k.steerAngle)) / K.wheelBase, -gripLimit, gripLimit);
  const slack = K.yawSlack + K.steerYawSlack * Math.abs(k.steerSmooth) + K.driftYawSlack * k.driftAmt;
  const yaw = body.angularVelocity.y;
  const excess = yaw - clamp(yaw, targetYaw - slack, targetYaw + slack);
  body.angularVelocity.y -= excess * 0.5;
}

/**
 * Bullet: on rails. Each sub-step, steer the velocity toward a point ~14 m down the road (easing toward
 * the middle) at bulletSpeed and turn the kart to face it. Height is left to the physics (hills, jumps).
 */
const bulletAim = new CANNON.Vec3();
function bulletGuide(k) {
  const I = CFG.items, { N, samples, normals, spacing } = track, body = k.body, dt = CFG.physicsStep;
  k.wallTouch = false; // no rails slowing it down (collisions are off anyway)
  k.wallHit = 0;
  k.bulletLane += clamp(-k.bulletLane, -3 * dt, 3 * dt);
  const j = (k.trackIdx + Math.round(14 / spacing)) % N;
  const lat = clampLane(j, k.bulletLane, 2);
  const ax = samples[j].x + normals[j].x * lat - body.position.x;
  const az = samples[j].z + normals[j].z * lat - body.position.z;
  const h = Math.hypot(ax, az) || 1;
  body.velocity.x += ((ax / h) * I.bulletSpeed - body.velocity.x) * 0.08;
  body.velocity.z += ((az / h) * I.bulletSpeed - body.velocity.z) * 0.08;
  const fwd = body.quaternion.vmult(LOCAL_FWD, bulletAim);
  const turn = wrapAngle(Math.atan2(ax, az) - Math.atan2(fwd.x, fwd.z));
  body.angularVelocity.y = clamp(turn * 8, -4, 4);
  if (!k.vehicle.wheelInfos.some((w) => w.raycastResult.hasHit)) airLevel(k);
}

/* ==========================================================================
 * 5. RENDERING LOOP (sync meshes <- bodies, camera, effects, HUD)
 * ========================================================================== */
const camState = { yaw: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), snap: true };
const desiredCam = new THREE.Vector3();

const spinQ = new THREE.Quaternion(), flipQ = new THREE.Quaternion();
/** Per-item hit reaction (visual only): yaw turns, a flip about the kart's side (x) or nose (z) axis, and a hop in metres. */
const HIT_ANIM = {
  banana: { yaw: 3, hop: 0.9 },                 // slips: fast spin and a little hop
  green: { yaw: 1, flipX: 1, hop: 1.5 },      // knocked up, tumbles end over end
  red: { yaw: 1, flipX: 1, hop: 1.5 },
  blue: { yaw: 1, flipX: 2, hop: 2.4 },         // launched high, double tumble
  star: { yaw: 1, flipZ: 1, hop: 1.2 },         // cartwheels away
  bullet: { yaw: 1, flipZ: 1, hop: 1.2 },
};
const spinAxis = new THREE.Vector3();
const interpQ = new THREE.Quaternion(), bodyP = new THREE.Vector3(), rawQInv = new THREE.Quaternion();
const drawQ = new THREE.Quaternion();

/**
 * Meshes are drawn at the body's *interpolated* pose (between the last two fixed physics steps), not
 * its raw one. Frame times wobble around the 1/60 s step, so raw poses advance 0 or 2 steps on some
 * frames: the kart and camera visibly hitch even at a steady frame rate.
 */
function syncMeshes() {
  const L = CFG.kart.look;
  for (const { body, vehicle, group, wheelMeshes, spin, spinTotal, spinKind, launch, bullet } of karts) {
    group.position.copy(body.interpolatedPosition);
    group.quaternion.copy(body.interpolatedQuaternion);
    group.scale.set(1, 1, 1);
    let squash = 1; // < 1 while a bullet has the kart flattened
    // wheel transforms come from the raw pose: move them by (interpolated pose) * (raw pose)^-1
    bodyP.copy(body.position);
    rawQInv.copy(body.quaternion).invert();
    interpQ.copy(rawQInv).premultiply(group.quaternion);
    drawQ.copy(group.quaternion); // before the spin-out turn
    // Spin-out is visual only: turn the body and wheels about the kart's up axis (two full turns)
    const spinning = spin > 0;
    if (spinning && launch?.splat) {
      // flat in 0.08 s, held, then pops back up with a little overshoot
      const sm = (x) => x * x * (3 - 2 * x), t = launch.t, back = launch.crash * 0.75;
      squash = t < 0.08 ? 1 - 0.75 * sm(t / 0.08) : t < back ? 0.25 + Math.sin(t * 50) * 0.02
        : 0.25 + 0.75 * sm(Math.min(1, (t - back) / (launch.crash - back))) + Math.sin(Math.min(1, (t - back) / (launch.crash - back)) * Math.PI) * 0.12;
      spinQ.identity();
      group.scale.set(1 + (1 - squash) * 0.35, squash, 1 + (1 - squash) * 0.35);
      group.position.y -= (1 - squash) * 0.35;
    } else if (spinning && launch?.mode) {
      const sm = (x) => x * x * (3 - 2 * x), p = clamp(launch.t / launch.dur, 0, 1);
      let lift = 0;
      if (launch.mode === 'shove') {
        // knocked along the throw and tumbling end over end, then bounces to a stop
        spinAxis.set(launch.dz, 0, -launch.dx);
        spinQ.setFromAxisAngle(spinAxis, sm(clamp(p / 0.7, 0, 1)) * launch.flips * Math.PI * 2);
        const q = (p - 0.5) / 0.5;
        lift = p < 0.5 ? launch.hop * Math.sin((p / 0.5) * Math.PI) : launch.hop * 0.3 * (1 - q) * Math.abs(Math.sin(q * Math.PI * 2));
      } else if (launch.mode === 'slide') {
        // fast spins about its own axis, leaning into the slide
        spinAxis.set(0, 1, 0).applyQuaternion(group.quaternion);
        spinQ.setFromAxisAngle(spinAxis, sm(p) * launch.turns * Math.PI * 2);
        spinAxis.set(0, 0, 1).applyQuaternion(group.quaternion);
        spinQ.premultiply(flipQ.setFromAxisAngle(spinAxis, -launch.side * 0.3 * Math.sin(p * Math.PI) * Math.sin(p * 14)));
        lift = 0.3 * Math.sin(clamp(p / 0.25, 0, 1) * Math.PI);
      } else {
        // blast: straight up in a slow tumble, hangs, drops heavily at 70%, small rebound
        const u = clamp(p / 0.7, 0, 1);
        lift = p < 0.7 ? launch.up * (1 - (u * 2 - 1) ** 2) : launch.up * 0.07 * Math.abs(Math.sin(((p - 0.7) / 0.3) * Math.PI * 2)) * (1 - (p - 0.7) / 0.3);
        spinAxis.set(0, 1, 0).applyQuaternion(group.quaternion);
        spinQ.setFromAxisAngle(spinAxis, sm(u) * Math.PI * 2);
        spinAxis.set(1, 0, 0).applyQuaternion(group.quaternion);
        spinQ.premultiply(flipQ.setFromAxisAngle(spinAxis, sm(u) * Math.PI * 2));
      }
      group.position.y += lift;
      group.quaternion.premultiply(spinQ);
    } else if (spinning && launch) {
      // wall launch: a sideways cartwheel across the road (1.25 turns, so it lands on its side), a crash on the wall, then it slides back upright
      const sm = (x) => x * x * (3 - 2 * x), fly = Math.min(1, launch.t / launch.dur);
      let ang, lift;
      if (launch.t < launch.dur) { ang = sm(fly) * 2.5 * Math.PI; lift = Math.sin(fly * Math.PI) * launch.hop; }
      else {
        const v = clamp((launch.t - launch.dur) / launch.crash, 0, 1), settle = v < 0.45 ? 0 : sm((v - 0.45) / 0.55);
        ang = Math.PI / 2 * (1 - settle) + Math.sin(v * 45) * 0.07 * (1 - v);
        lift = 0.5 * (1 - settle);
      }
      spinAxis.set(0, 0, 1).applyQuaternion(group.quaternion);
      spinQ.setFromAxisAngle(spinAxis, -launch.side * ang);
      group.position.y += lift;
      group.quaternion.premultiply(spinQ);
    } else if (spinning) {
      const A = HIT_ANIM[spinKind] || { yaw: 2 }, p = 1 - spin / spinTotal, e = p * p * (3 - 2 * p); // eased so every turn ends upright
      const turns = Math.max(1, Math.round(A.yaw * spinTotal / CFG.items.spinTime)); // whole turns, so it ends upright (blue's longer blast turns more)
      spinAxis.set(0, 1, 0).applyQuaternion(group.quaternion);
      spinQ.setFromAxisAngle(spinAxis, e * turns * Math.PI * 2);
      if (A.flipX || A.flipZ) {
        spinAxis.set(A.flipX ? 1 : 0, 0, A.flipZ ? 1 : 0).applyQuaternion(group.quaternion);
        spinQ.premultiply(flipQ.setFromAxisAngle(spinAxis, e * (A.flipX || A.flipZ) * Math.PI * 2));
      }
      if (A.hop) group.position.y += Math.sin(p * Math.PI) * A.hop;
      group.quaternion.premultiply(spinQ);
    }
    for (let i = 0; i < vehicle.wheelInfos.length; i++) {
      vehicle.updateWheelTransform(i);
      const t = vehicle.wheelInfos[i].worldTransform;
      const w = wheelMeshes[i];
      w.visible = !(bullet > 0); // inside the bullet
      // in the kart's frame: pulled in to the drawn (smaller) chassis, the smaller tyre still on the ground
      w.position.copy(t.position).sub(bodyP).applyQuaternion(rawQInv);
      w.position.x *= L.scale;
      w.position.z *= L.scale * L.wheelbase;
      w.position.y -= CFG.kart.wheelRadius * (1 - L.scale);
      w.position.applyQuaternion(drawQ).add(group.position);
      w.quaternion.copy(t.quaternion).premultiply(interpQ);
      w.scale.set(1 + (1 - squash) * 0.35, squash, 1 + (1 - squash) * 0.35);
      if (squash < 1) w.position.y = group.position.y + (w.position.y - group.position.y - 0.35 * (1 - squash)) * squash;
      if (spinning) {
        w.position.sub(group.position).applyQuaternion(spinQ).add(group.position);
        w.quaternion.premultiply(spinQ);
      }
    }
  }
}

const boxMatrix = new THREE.Matrix4(), boxQuat = new THREE.Quaternion(), boxScale = new THREE.Vector3();
const boxEuler = new THREE.Euler();
let itemClock = 0, rouletteT = 0, warnT = 0;

function updateItemVisuals(dt) {
  itemClock += dt;
  const { boxes, boxMesh, padTex } = itemVis;
  boxEuler.set(0.5, itemClock * 1.6, 0.3);
  boxQuat.setFromEuler(boxEuler);
  boxes.forEach((bx, i) => {
    // Taken boxes are hidden, then pop back in over the last 0.3 s; a slow pulse while they're up
    const sc = (bx.hidden > 0.3 ? 0 : 1 - bx.hidden / 0.3) * (1 + 0.07 * Math.sin(itemClock * 4 + i));
    boxScale.setScalar(sc);
    bx.pos.y = bx.baseY + Math.sin(itemClock * 2 + i) * 0.15;
    boxMesh.setMatrixAt(i, boxMatrix.compose(bx.pos, boxQuat, boxScale));
  });
  boxMesh.instanceMatrix.needsUpdate = true;
  padTex.offset.y = (padTex.offset.y + dt * 1.5) % 1;
  for (const d of drops) d.mesh.rotation.y += dt * 0.5;

  // Item slot: spins through the icons while rolling, then shows the item
  let shown = kart.item || '';
  if (kart.itemRoll > 0) {
    rouletteT += dt;
    shown = ITEM_TYPES[Math.floor(rouletteT * 14) % ITEM_TYPES.length];
  }
  if (hud.item.dataset.item !== shown) {
    hud.item.dataset.item = shown;
    hud.item.innerHTML = SVG_ITEMS[shown] ?? ''; // the shells and the bullet are drawn in CSS
  }
  const count = kart.item === 'triple' && kart.itemRoll <= 0 ? `x${kart.itemCount}` : '';
  if (hud.item.dataset.count !== count) hud.item.dataset.count = count;
  hud.item.classList.toggle('ready', !!kart.item && kart.itemRoll <= 0);
  // two throw buttons for green / banana / bomb: the main one keeps the old direction, the second throws the other way
  const two = kart.itemRoll <= 0 && THROWABLE.has(kart.item);
  const dirs = two ? (kart.item === 'green' ? ['▲', '▼'] : ['▼', '▲']) : ['', ''];
  if (hud.item.dataset.dir !== dirs[0]) hud.item.dataset.dir = dirs[0];
  hud.itemB.hidden = !two;
  app.classList.toggle('twothrow', two);
  hud.itemB.textContent = dirs[1];
  hud.itemB.classList.toggle('ready', two);

  // Triple mushroom: what's left circles the kart
  for (const k of karts) {
    const want = k.item === 'triple' && k.itemRoll <= 0 ? k.itemCount : 0;
    while (k.orbit.length > want) scene.remove(k.orbit.pop());
    while (k.orbit.length < want) k.orbit.push(spawnModel('mushroom', k.group.position));
    const gp = k.group.position;
    k.orbit.forEach((m, i) => {
      const a = itemClock * 4 + (i / 3) * Math.PI * 2;
      m.position.set(gp.x + Math.cos(a) * 1.7, gp.y + 0.2, gp.z + Math.sin(a) * 1.7);
      m.rotation.y = -a;
    });
  }

  // Red / blue shell alarm
  const warn = shellIncoming(kart);
  hud.warn.hidden = !warn;
  warnT -= dt;
  if (warn && warnT <= 0) { sound.warn(); warnT = 0.4; }
}

function updateCamera(dt) {
  const C = CFG.camera;
  const b = kart.body;
  const fwd = b.interpolatedQuaternion.vmult(LOCAL_FWD, tmpVec);
  const yaw = Math.atan2(fwd.x, fwd.z);
  let bp = b.interpolatedPosition; // match the drawn kart (see syncMeshes)
  if (kart.eject) bp = camFocus; // bomb hit: follow the flying driver
  else camFocus.copy(bp);
  const speedRatio = clamp(Math.abs(kart.speed) / CFG.kart.maxSpeed, 0, 1);

  if (state.phase === 'menu') lobbyCamera(dt, bp, yaw);
  else chaseCamera(dt, bp, yaw, speedRatio);

  // Shadow camera follows the kart
  // ...snapped to whole shadow-map texels in the light's view, or shadow edges crawl as the kart moves
  shadowSnap.copy(bp).applyQuaternion(lightQInv);
  const texel = (sun.shadow.camera.right - sun.shadow.camera.left) / sun.shadow.mapSize.x;
  shadowSnap.x = Math.round(shadowSnap.x / texel) * texel;
  shadowSnap.y = Math.round(shadowSnap.y / texel) * texel;
  shadowSnap.applyQuaternion(lightQ);
  sun.target.position.copy(shadowSnap);
  sun.position.copy(shadowSnap).add(SUN_OFFSET);
}

/** Lobby: a slow 3/4 turntable of the player's kart from the outside of the grid (the kart is the showcase;
 * the planned 3D characters ride in it). The projection is shifted so the kart sits in the gap between the
 * lobby's columns (lobbyShift, measured in layoutLobby). The chase camera snaps back at the race start. */
const LOBBY_FOV = 42;
let lobbyShift = 0, lobbyShiftY = 0, lobbyClock = 0; // Y: the vertical view stacks the lobby, so the kart is shifted up/down instead
/** Split stage (driver / paint pickers): close 3/4 front view framed on the left, turned by drag (rot), a key
 * light on the kart, a bounce on each pick (pop). The lobby camera blends between this and the turntable. */
const stage = { on: false, rot: 0, idle: 0, drag: null, pop: 0 };
const lobbyView = { a: 0, dist: 9, up: 2.3, lookUp: 0.9, fov: LOBBY_FOV, shift: 0, shiftY: 0, init: false };
const lightSide = new THREE.Vector3();
// Key light for the stage. Always in the scene (0 in a race) so adding it never recompiles every material.
const stageLight = new THREE.DirectionalLight(0xfff4e6, 0);
scene.add(stageLight, stageLight.target);
function lobbyCamera(dt, bp, yaw) {
  lobbyClock += dt;
  const i = kart.trackIdx, n = track.normals[i];
  const out = Math.sign(lateral(i, bp) || 1); // the grid side away from the centre line: no karts there
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  let a, dist, up, lookUp, fov, shift, shiftY = 0;
  const vert = app.classList.contains('vertical'); // narrow upright screen: stand the kart further back so it fits the width
  if (stage.on) {
    // untouched: ease back into a slow swing around the 3/4 front
    stage.idle += dt;
    if (!stage.drag && stage.idle > 2.5) {
      const swing = 0.45 * Math.sin(lobbyClock * 0.35);
      stage.rot = wrapAngle(stage.rot) + (swing - wrapAngle(stage.rot)) * (1 - Math.exp(-dt * 0.8));
    }
    const el = $('pick-stage');
    a = 0.55 + stage.rot; dist = vert ? 10 : 5.4; up = vert ? 2.6 : 1.7; lookUp = 0.85; fov = 34;
    if (vert) { shift = 0; shiftY = Math.round(app.clientHeight / 2 - (el.offsetTop + el.offsetHeight / 2)); } // stage on top: kart in its middle
    else shift = Math.round(app.clientWidth / 2 - (el.offsetLeft + el.offsetWidth / 2)); // kart in the stage's middle
  } else {
    a = 0.8 + 0.3 * Math.sin(lobbyClock * 0.22); dist = vert ? 11 : 9; up = 2.3; lookUp = 0.9; fov = LOBBY_FOV; shift = lobbyShift; shiftY = lobbyShiftY;
  }
  // smooth move between turntable and stage: blend the orbit (angle, distance, height), so it swings round the
  // kart instead of cutting through it
  const V = lobbyView, k = V.init ? 1 - Math.exp(-dt * 5) : 1;
  V.init = true;
  V.a += wrapAngle(a - V.a) * k;
  for (const [key, to] of [['dist', dist], ['up', up], ['lookUp', lookUp], ['fov', fov], ['shift', shift], ['shiftY', shiftY]]) V[key] += (to - V[key]) * k;
  const ca = Math.cos(V.a), sa = Math.sin(V.a);
  camera.position.set(
    bp.x + (fx * ca + n.x * out * sa) * V.dist,
    bp.y + V.up,
    bp.z + (fz * ca + n.z * out * sa) * V.dist,
  );
  camState.look.set(bp.x, bp.y + V.lookUp, bp.z);
  camera.lookAt(camState.look);
  if (Math.abs(camera.fov - V.fov) > 0.01 || Math.abs((camera.view?.offsetX ?? 0) - V.shift) > 0.5 || Math.abs((camera.view?.offsetY ?? 0) - V.shiftY) > 0.5 || !camera.view?.enabled) {
    camera.fov = V.fov;
    camera.setViewOffset(w, h, Math.round(V.shift), Math.round(V.shiftY), w, h);
  }
  // key light from above the camera's left: the character's colours and smooth shading pop on any track
  stageLight.intensity += ((stage.on ? 1.3 : 0) - stageLight.intensity) * (1 - Math.exp(-dt * 4));
  stageLight.position.copy(camera.position).addScaledVector(camera.up, 3).add(lightSide.set(-fz, 0, fx).multiplyScalar(2));
  stageLight.target.position.copy(camState.look);
  // bounce on a new pick (driver rebuilt / repainted)
  if (stage.pop > 0) {
    stage.pop = Math.max(0, stage.pop - dt * 2.2);
    const sc = 1 + 0.12 * Math.sin((1 - stage.pop) * Math.PI * 3) * stage.pop;
    kart.rider.mesh.scale.setScalar(sc);
    kart.bodyMesh.scale.set(sc, 1 + (sc - 1) * 0.6, sc);
  }
  camState.snap = true; // whatever comes next starts from a clean chase view
}

/** Where the open middle of the lobby is: shift the 3D view so the kart lands there (px, + = kart moves left). */
function layoutLobby() {
  const cta = document.querySelector('.lobby-cta'), setup = document.querySelector('.setup');
  if (!cta.offsetWidth) return; // lobby not shown
  if (app.classList.contains('vertical')) { // stacked: the open gap is between the logo block and the setup card
    const top = cta.offsetTop + cta.offsetHeight, bottom = setup.offsetTop;
    lobbyShift = 0; lobbyShiftY = Math.round(app.clientHeight / 2 - (top + bottom) / 2);
    return;
  }
  lobbyShiftY = 0;
  const left = cta.offsetLeft + cta.offsetWidth, right = setup.offsetLeft;
  lobbyShift = Math.round(app.clientWidth / 2 - (left + right) / 2);
}

function chaseCamera(dt, bp, yaw, speedRatio) {
  const C = CFG.camera;
  if (camera.view?.enabled) { camera.clearViewOffset(); camera.fov = viewFov; camera.updateProjectionMatrix(); stageLight.intensity = 0; }

  if (camState.snap) {
    camState.yaw = yaw;
  } else {
    camState.yaw += wrapAngle(yaw - camState.yaw) * (1 - Math.exp(-dt * C.yawLag));
  }

  const dist = C.distance + speedRatio * C.speedPull;
  desiredCam.set(
    bp.x - Math.sin(camState.yaw) * dist,
    bp.y + C.height,
    bp.z - Math.cos(camState.yaw) * dist,
  );

  if (camState.snap) {
    camState.pos.copy(desiredCam);
    camState.snap = false;
  } else {
    camState.pos.lerp(desiredCam, 1 - Math.exp(-dt * (kart.eject ? 16 : C.posLag)));
    // a smooth follow, but never trailing far behind at speed (the old lag added ~4.5 m at top speed)
    const lag = camState.pos.distanceTo(desiredCam);
    const maxLag = kart.eject ? 0.12 : C.maxLag;
    if (lag > maxLag) camState.pos.lerp(desiredCam, 1 - maxLag / lag);
  }
  camState.pos.y = Math.max(camState.pos.y, track.samples[kart.trackIdx].y + 1.0);
  camera.position.copy(camState.pos);

  camState.look.set(
    bp.x + Math.sin(camState.yaw) * C.lookAhead,
    bp.y + C.lookHeight,
    bp.z + Math.cos(camState.yaw) * C.lookAhead,
  );
  camera.lookAt(camState.look);

  // Radial blur strength: full on a boost or the cannon, lighter with the star; fades in fast, out slower
  // Cannon = full. Boosts / star / rocket start scale with how fast the kart really is (a pad at low speed barely blurs).
  const fast = clamp((Math.abs(kart.speed) / (CFG.kart.maxSpeed + CFG.kart.boostSpeed) - 0.55) / 0.45, 0, 1);
  const fxTo = kart.bullet > 0 ? 1 : kart.rocketT > 0 ? 0.3 * fast : kart.boost > 0 ? 0.55 * fast : kart.star > 0 ? 0.3 * fast : 0;
  speedFx.v += (fxTo - speedFx.v) * (1 - Math.exp(-dt * (fxTo > speedFx.v ? 12 : 4)));

  // Speed-based FOV kick
  const targetFov = viewFov + Math.min(C.fovMax, speedRatio * C.fovSpeed + (kart.boost > 0 ? C.fovBoost : 0));
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-dt * 4));
    camera.updateProjectionMatrix();
  }
}

const SMOKE = [0.86, 0.86, 0.9], DUST = [0.6, 0.5, 0.32];
const emitP = new THREE.Vector3(), emitV = new THREE.Vector3(), skidTo = new THREE.Vector3();

function updateEffects(dt) {
  const driving = state.phase === 'race' || state.phase === 'finished';
  const T = CFG.track;
  for (const k of karts) {
    k.stars.visible = k.spin > 0;
    if (k.stars.visible) k.stars.rotation.y += dt * 7;
    // Shield bubble (blinks for its last 1.5 s), bullet hull, star rainbow + sparkles
    k.bubble.visible = k.shield > 0;
    if (k.bubble.visible) {
      // pops in with an elastic overshoot; flickers out over the last 1.5 s
      const age = CFG.items.shieldTime - k.shield;
      const grow = age < 0.45 ? 1 - Math.exp(-age * 9) * Math.cos(age * 18) : 1;
      k.bubble.scale.copy(BUBBLE_SCALE).multiplyScalar(grow);
      const u = k.bubble.material.uniforms;
      u.time.value = itemClock;
      u.fade.value = k.shield > 1.5 ? 1 : 0.35 + 0.65 * Math.abs(Math.sin(k.shield * 9));
    }
    // ghost: see-through, flickering
    const alpha = k.ghosted ? (Math.floor(itemClock * 6) % 2 ? 0.4 : 0.6) : 1;
    if (alpha !== k.alpha) {
      k.alpha = alpha;
      for (const m of [k.bodyMesh.material, ...k.rider.mats, ...k.wheelMeshes.map((w) => w.children[0].material)]) {
        if (m.transparent !== alpha < 1) { m.transparent = alpha < 1; m.needsUpdate = true; } // three bakes OPAQUE into the shader: opacity is ignored until it recompiles
        m.opacity = alpha;
        m.depthWrite = true; // the rider is one baked mesh: without depth writes its overlapping parts all blend through each other
      }
    }
    k.hull.visible = k.bullet > 0;
    k.bodyMesh.visible = k.rider.mesh.visible = !k.hull.visible;
    animateRider(k, dt);
    const em = k.bodyMesh.material.emissive;
    if (k.star > 0 && (k.star > 1 || Math.floor(k.star * 10) % 2 === 0)) {
      em.setHSL((itemClock * 2.5) % 1, 1, 0.4);
      if (Math.random() < dt * 30) {
        const p = k.group.position;
        emitP.set(p.x + (Math.random() - 0.5) * 2, p.y + Math.random() * 1.2, p.z + (Math.random() - 0.5) * 2);
        emitV.set(0, 1.5, 0);
        fx.emit(emitP, emitV, [1, 0.95, 0.5], { life: 0.4, size: 0.3, grow: 0, alpha: 1 });
      }
    } else if (em.r || em.g || em.b) em.setRGB(0, 0, 0);
    k.rider.matte.emissive.copy(em);

    // Smoke + skid marks while drifting, dust on the grass; only near the camera (it's all small stuff)
    const near = k.group.position.distanceToSquared(camera.position) < 45 * 45;
    const s = track.samples[k.trackIdx], n = track.normals[k.trackIdx];
    const lat = (k.body.position.x - s.x) * n.x + (k.body.position.z - s.z) * n.z;
    const grass = (lat > 0 ? lat - track.wL[k.trackIdx] : -lat - track.wR[k.trackIdx]) > T.curb && Math.abs(k.speed) > 5;
    for (let j = 0; j < 2; j++) {
      const w = k.wheelMeshes[2 + j], mark = k.skid[j];
      const down = k.vehicle.wheelInfos[2 + j].raycastResult.hasHit;
      if (!driving || !near || !down) { mark.on = false; continue; }
      if (k.drifting) {
        if (Math.random() < dt * 26) {
          emitP.set(w.position.x, w.position.y - 0.15, w.position.z);
          emitV.set((Math.random() - 0.5) * 1.2, 0.7 + Math.random() * 0.7, (Math.random() - 0.5) * 1.2);
          fx.emit(emitP, emitV, SMOKE, { life: 0.8, size: 0.55, grow: 2.2, alpha: 0.42 });
        }
        const dx = w.position.x - mark.x, dz = w.position.z - mark.z;
        if (!mark.on || dx * dx + dz * dz > 0.35 * 0.35) {
          const ground = k.vehicle.wheelInfos[2 + j].raycastResult.hitPointWorld.y + 0.05;
          skidTo.set(w.position.x, ground, w.position.z);
          if (mark.on && !grass) fx.skid(mark, skidTo, 0.13);
          mark.x = skidTo.x; mark.y = ground; mark.z = skidTo.z; mark.on = true;
        }
      } else mark.on = false;
      if (grass && Math.random() < dt * 20) {
        emitP.set(w.position.x, w.position.y - 0.2, w.position.z);
        emitV.set((Math.random() - 0.5) * 1.5, 0.9 + Math.random() * 0.8, (Math.random() - 0.5) * 1.5);
        fx.emit(emitP, emitV, DUST, { life: 0.6, size: 0.45, grow: 1.6, alpha: 0.5 });
      }
    }

    const charged = k.driftCharge > CFG.kart.miniTurboTime;
    k.sparkMat.color.setHex(charged ? 0xffa21f : 0x5cc8ff);
    for (const sp of k.sparks) {
      sp.visible = k.drifting;
      if (sp.visible) sp.scale.setScalar(0.6 + Math.random() * 0.8);
    }
    const boosting = k.boost > 0 || k.bullet > 0;
    for (const f of k.flames) {
      f.visible = boosting || (driving && k.ctl.gas);
      const s = boosting ? 1 + Math.random() * 0.6 : 0.35 + Math.random() * 0.15;
      f.scale.set(s, s, s);
    }
  }
}

let lastHud = '';
function updateHUD() {
  const kmh = Math.round(Math.abs(kart.speed) * 3.6);
  const lapTxt = `${Math.min(kart.lap, CFG.laps)}/${CFG.laps}`;
  const timeTxt = fmtTime(kart.finished ? kart.finishTime : state.raceTime);
  const bestTxt = fmtTime(state.bestLap);
  const showPlace = state.phase !== 'menu';
  const shown = state.shownPlace || kart.place;
  const key = `${kmh}|${lapTxt}|${timeTxt}|${bestTxt}|${showPlace && shown}`;
  if (key !== lastHud) {
    lastHud = key;
    hud.speed.textContent = kmh;
    hud.lap.textContent = lapTxt;
    hud.lap.parentElement.classList.toggle('final', kart.lap >= CFG.laps && state.phase !== 'menu');
    hud.time.textContent = timeTxt;
    hud.best.textContent = bestTxt;
    hud.place.hidden = !showPlace;
    hud.place.classList.toggle('first', shown === 1);
    hud.placeNum.textContent = shown;
    hud.placeSuffix.textContent = ordinal(shown).slice(-2);
    hud.placeOf.textContent = `/${karts.length}`;
  }
  const charge = clamp(kart.driftCharge / CFG.kart.miniTurboTime, 0, 1);
  hud.driftFill.style.width = `${charge * 100}%`;
  hud.driftFill.classList.toggle('charged', charge >= 1);

  // Minimap
  const { ctx, size } = minimap;
  ctx.clearRect(0, 0, size, size);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = size * 0.09;
  ctx.stroke(minimap.path);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = size * 0.05;
  ctx.stroke(minimap.path);
  const [sx, sy] = minimap.project(track.samples[0].x, track.samples[0].z);
  ctx.fillStyle = '#ffd23a';
  ctx.fillRect(sx - size * 0.03, sy - size * 0.05, size * 0.06, size * 0.1);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = size * 0.02;
  for (let i = karts.length - 1; i >= 0; i--) { // player last, so it's drawn on top
    const k = karts[i];
    const [kx, ky] = minimap.project(k.body.position.x, k.body.position.z);
    ctx.fillStyle = k.color;
    ctx.beginPath();
    ctx.arc(kx, ky, size * (k.isPlayer ? 0.05 : 0.035), 0, Math.PI * 2);
    ctx.fill();
    if (k.isPlayer) ctx.stroke();
  }
}

const camRight = new THREE.Vector3();
const soundMix = { live: false, duck: true, player: { ratio: 0, throttle: 0, air: false }, drift: 0, charged: false, rivals: [] };

/** Feeds the engine / drift sounds: the player's kart plus every rival, panned and faded by distance. */
function updateSound(dt) {
  const live = state.phase === 'race' || state.phase === 'finished';
  const top = CFG.kart.maxSpeed;
  const throttle = (k) => (live && (k.ctl.gas || k.boost > 0) ? 1 : 0);
  const air = (k) => !k.vehicle.wheelInfos.some((w) => w.raycastResult.hasHit);
  camRight.setFromMatrixColumn(camera.matrixWorld, 0);
  soundMix.live = live;
  soundMix.duck = state.phase === 'menu' || state.resultsShown;
  soundMix.player.ratio = clamp(Math.abs(kart.speed) / top, 0, 1.3);
  soundMix.player.throttle = throttle(kart);
  soundMix.player.air = air(kart);
  soundMix.drift = kart.drifting ? 1 : 0;
  soundMix.charged = kart.driftCharge > CFG.kart.miniTurboTime;
  soundMix.rivals = karts.slice(1).map((k) => {
    const dx = k.body.position.x - camera.position.x, dz = k.body.position.z - camera.position.z;
    const dist = Math.hypot(dx, dz);
    return {
      ratio: clamp(Math.abs(k.speed) / top, 0, 1.3), throttle: throttle(k), air: air(k), dist,
      pan: clamp((dx * camRight.x + dz * camRight.z) / Math.max(dist, 1), -0.8, 0.8),
    };
  });
  sound.update(dt, soundMix);
}

function render(dt) {
  dbgTick();
  syncMeshes();
  updateCamera(dt);
  updateEffects(dt);
  updateBurn(dt);
  updateEject(dt);
  fx.update(dt);
  updateItemVisuals(dt);
  theme.update(dt);
  updateHUD();
  renderer.info.reset();
  if (speedFx.v > 0.02) {
    renderer.setRenderTarget(blurTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    blurPass.mat.uniforms.strength.value = speedFx.v;
    renderer.render(blurPass.scene, blurPass.cam);
  } else {
    renderer.render(scene, camera);
  }
  const mirrorOn = state.phase === 'race' || state.phase === 'finished' || state.phase === 'countdown';
  document.getElementById('mirror-frame').style.display = mirrorOn ? 'block' : 'none';
  if (mirrorOn) {
    const b = kart.body, f = b.interpolatedQuaternion.vmult(LOCAL_FWD, tmpVec);
    renderMirror(b.interpolatedPosition, Math.atan2(f.x, f.z));
  }
  updateSound(dt);
}

// ---------- Main loop ----------
let lastTime = performance.now();

// Frame meter: fps over the last second, plus frames slower than 33 ms (a visible hitch) and the
// worst frame since the race started. Toggled by tapping the build label; remembered per device.
const perf = { on: false, frames: 0, acc: 0, slow: 0, worst: 0 };
try { perf.on = localStorage.getItem('kartrush.perf') === '1'; } catch { /* storage blocked */ }
$('build').addEventListener('click', () => {
  perf.on = !perf.on;
  try { localStorage.setItem('kartrush.perf', perf.on ? '1' : '0'); } catch { /* storage blocked */ }
  $('build').textContent = $('build').textContent.replace(/ · meter.*$/, '') + (perf.on ? ' · meter on' : '');
});
function updatePerf(ms) {
  if (!perf.on) { hud.perf.hidden = true; return; }
  if (state.phase === 'countdown') { perf.slow = 0; perf.worst = 0; }
  else if (state.phase === 'race') { if (ms > 33) perf.slow++; perf.worst = Math.max(perf.worst, ms); }
  perf.frames++;
  perf.acc += ms;
  if (perf.acc >= 1000) {
    hud.perf.hidden = false;
    hud.perf.textContent = `${Math.round(perf.frames * 1000 / perf.acc)} fps\nslow ${perf.slow}\nworst ${Math.round(perf.worst)}ms`;
    perf.frames = 0;
    perf.acc = 0;
  }
}

function loop(now) {
  requestAnimationFrame(loop);
  updatePerf(now - lastTime);
  // telemetry: frames over 50 ms, with what was active on the player (build 54: fps dropped during a star)
  if (now - lastTime > 50 && (state.phase === 'race' || state.phase === 'finished')) {
    teleEvent('slow', kart, { ms: Math.round(now - lastTime), star: +kart.star.toFixed(1), ghost: !!kart.ghosted, shield: kart.shield > 0,
      boost: kart.boost > 0, bullet: kart.bullet > 0, spin: kart.spin > 0, calls: renderer.info.render.calls, tris: renderer.info.render.triangles });
  }
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (state.paused) return; // the canvas keeps showing the last frame
  stepPhysics(dt);      // 4. physics (AI decides its controls here too)
  updateGameFlow(dt);   // 3. laps / positions / countdown / recovery
  render(dt);           // 5. sync + draw
}

// Leaving the app (call, app switch, lock) pauses the race instead of dropping you back into it
document.addEventListener('visibilitychange', () => {
  lastTime = performance.now();
  if (document.hidden) pauseGame();
});

/**
 * iOS compiles a GPU program the first time each material is drawn (and again for its shadow pass),
 * which froze the game for a moment the first time a shell, banana, flame or spark showed up mid-race.
 * Draw one throwaway frame with all of them in view, behind the title screen.
 */
function warmUpShaders() {
  const extras = Object.keys(itemVis.models).map((kind) => spawnModel(kind, kart.body.position));
  const shown = [...kart.sparks, ...kart.flames, kart.stars, kart.bubble, kart.hull];
  shown.forEach((o) => { o.visible = true; });
  syncMeshes();
  updateCamera(0);
  renderer.compile(scene, camera); // everything, even what's off screen (item boxes, pads)
  renderer.render(scene, camera);  // + the shadow-pass programs
  renderer.setRenderTarget(blurTarget); renderer.render(scene, camera); renderer.setRenderTarget(null); // blur pass programs
  renderer.render(blurPass.scene, blurPass.cam);
  extras.forEach((m) => scene.remove(m));
  shown.forEach((o) => { o.visible = false; });
}

/* ==========================================================================
 * UI helpers
 * ========================================================================== */
function showCountdown(text) { retrigger(hud.countdown, text); }
function showTip(text) {
  hud.tip.textContent = text;
  hud.tip.classList.remove('pop-tip');
  void hud.tip.offsetWidth;
  hud.tip.classList.add('pop-tip');
}
/** Lap time under the LAP message, with the gap to the best lap so far (green = faster). */
function showSplit(lapTime, best) {
  const d = lapTime - best;
  hud.split.innerHTML = fmtTime(lapTime) +
    (Number.isFinite(best) ? ` <b class="${d < 0 ? 'faster' : 'slower'}">${d < 0 ? '&minus;' : '+'}${Math.abs(d).toFixed(2)}</b>` : '');
  hud.split.classList.remove('pop-long');
  void hud.split.offsetWidth; // restart CSS animation
  hud.split.classList.add('pop-long');
}
function showMessage(text) { retrigger(hud.message, text); }
function retrigger(el, text) {
  el.textContent = text;
  el.classList.remove('pop');
  void el.offsetWidth; // restart CSS animation
  el.classList.add('pop');
}

function fmtTime(t) {
  if (!Number.isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function ordinal(n) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return n + s;
}

function escapeHtml(t) { return t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`); }

function wrapAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

// ---------- Boot ----------
$('build').textContent = `build ${VERSION_N} · ${location.host || 'local'}${navigator.standalone ? ' · app' : ''}${perf.on ? ' · meter on' : ''}`; // bump with sw.js VERSION
fillIcons();
loadTrack(savedTrack());
castDrivers();
onResize();
showMenu();
warmUpShaders();

// PWA: offline cache (service workers need a secure context: https or localhost)
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
requestAnimationFrame(loop);
