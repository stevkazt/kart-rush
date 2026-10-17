import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { sound } from './sound.js';

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
      name: 'Green Valley', icon: '\u{1F333}', theme: 'meadow',
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
      boxRows: [95, 450, 670],                           // sample index of each row of item boxes
      pads: [[200, 3], [335, -2], [595, 0], [870, 2.5]], // boost pads: [sample index, lane]
    },
    canyon: {
      name: 'Canyon Run', icon: '\u{1F335}', theme: 'desert',
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
      boxRows: [230, 760, 1010],
      pads: [[40, 0], [480, -2], [985, 0]],
    },
    frost: {
      name: 'Frost Peak', icon: '\u{2744}\u{FE0F}', theme: 'snow',
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
      boxRows: [60, 420, 760],
      pads: [[30, -3], [430, 0], [585, 2], [955, 0]],
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
    wallHitLoss: 0.02,      // rails: share of speed lost per m/s of impact into the rail...
    wallHitMax: 0.35,       // ...capped here (a 30deg hit at top speed costs ~25% on top of the bounce)
    wallScrape: 0.35,       // share of speed lost per second sliding along a rail (~9 m/s^2 at top speed,
                            // little when crawling off it; rails had no friction: free to lean on)

    miniTurboTime: 1.1,     // seconds of drift needed for a boost
    boostDuration: 1.0,
    rocketWindow: 1.0,      // rocket start: GAS first pressed within this many s before GO and held through it
    rocketEarly: 1.8,       // ...held since earlier than this before GO = engine stall
    rocketBoost: 0.9,       // boost seconds for a rocket start
    stallTime: 0.8,
    airLevel: 6,            // in the air: turn toward the road's tilt (rad/s per rad off)...
    airDamp: 3,             // ...and damp tumbling (per second)
    boostAccel: 8,          // m/s^2 on top of the engine, pushed through the centre of mass (no wheelie)
    boostSpeed: 6,
  },

  // Colours: [body, accent, driver]. Index 0 is the player.
  racers: [
    { name: 'YOU', colors: [0xe8322f, 0xffd23a, 0x2f6bff] },
    { name: 'Rex', colors: [0x2f6bff, 0xffffff, 0xffd23a] },
    { name: 'Luna', colors: [0x9b4dff, 0x5cc8ff, 0xffffff] },
    { name: 'Bolt', colors: [0xffd23a, 0x222222, 0xe8322f] },
    { name: 'Mako', colors: [0x2fbf4a, 0xffffff, 0x333333] },
    { name: 'Pip', colors: [0xff5fb0, 0xffffff, 0x9b4dff] },
  ],

  grid: {
    firstRow: 8,            // metres behind the start line
    rowGap: 6,
    colOffset: 4,           // lateral offset of the two columns
  },

  ai: {
    skill: [0.97, 1.05],    // fraction of top speed each AI aims for (rolled per race). Was 0.88-0.98 with a
                            // rubber band; with it gone (build 29) the user's clean laps were ~10% quicker
                            // than the AIs' (meadow 29.5-30 s vs 32.3-35), and the player gets boosts on top
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
      Rex: { role: 'ace', skill: [1.04, 1.08], cornerGrip: [23.5, 25], lineUse: [0.85, 1], bias: 1, laneRange: 1,
        mistakeEvery: [20, 35], startDelay: [0.05, 0.15], overtake: 1, defend: 0.5, aggression: 0.4 },
      Luna: { role: 'defender', skill: [1.02, 1.06], cornerGrip: [23, 24.5], lineUse: [0.75, 0.95], bias: 1.5,
        laneRange: 1.2, mistakeEvery: [18, 30], startDelay: [0.05, 0.2], overtake: 0.7, defend: 1, aggression: 0.2, hoard: true },
      // itemOdds: x the per-place odds, in ITEM_TYPES order (mush ban gre red shld star trip blue bullet):
      // always armed, rarely a shield or a speed item. trap: lays bananas on the racing line at corner entries
      // (user picked these over red shells that hunt the player: "too much")
      Mako: { role: 'bully', skill: [0.98, 1.02], cornerGrip: [21.5, 23.5], lineUse: [0.4, 0.7], bias: 3,
        overtake: 0.8, defend: 0.3, aggression: 1, trap: true,
        itemOdds: [0.4, 2, 1.8, 1.6, 0.3, 0.5, 0.4, 1.3, 0.5] },
      Pip: { role: 'steady', skill: [0.95, 0.99], cornerGrip: [21, 23], lineUse: [0.5, 0.7], bias: 2, laneRange: 1.5,
        mistakeEvery: [25, 40], overtake: 0.3, defend: 0.8, aggression: 0, hoard: true },
      // fast, brakes late (brakeOver), wide random lines, wobbles a lot
      Bolt: { role: 'wild', skill: [1.03, 1.08], cornerGrip: [22, 25], lineUse: [0, 1], bias: 5, laneRange: 4,
        brakeOver: 6, mistakeEvery: [3, 7], startDelay: [0, 0.6], overtake: 1, defend: 0, aggression: 0.6, wild: true },
    },
  },

  items: {
    // rows of boxes and boost pads are per track (CFG.tracks)
    boxLanes: [-6, -2, 2, 6],         // lateral offsets of the boxes in a row (m)
    boxRespawn: 3,                    // seconds until a taken box comes back
    pickupRadius: 1.8,
    padLength: 4, padWidth: 3.2,
    rollTime: 0.9,                    // item roulette before an item can be used
    spinTime: 1.1,                    // spin-out after a banana / shell hit
    mushroomBoost: 1.3,               // x the mini-turbo duration
    shellSpeed: 38, shellLife: 6, shellBounces: 5,
    redSpeed: 40, redLife: 12, redHomeDist: 14,
    aiTargetPlayer: 140,              // AI red shells lock onto the player when they're up to this far ahead (m)
    hitRadius: 1.4, bananaRadius: 1.2,
    shieldTime: 10,                   // bubble that blocks the next hit (any kind), gone after this anyway
    starTime: 6, starSpeed: 4,        // invincible, + m/s on top speed; karts touched spin out
    bumpRadius: 2.3,                  // star / bullet kart this close to another one = hit
    tripleGap: 0.25,                  // triple mushroom: min seconds between two boosts
    blueSpeed: 55, blueLife: 30,      // blue shell: along the track to the leader, explodes
    blueHome: 22, blueBlast: 5, blueSpin: 1.9, blueHeight: 1.8,
    bulletTime: 4, bulletSpeed: 38,   // CPU drives at this speed (m/s; top is 26) on rails along the track
    // Item odds by race position (index = place - 1), in ITEM_TYPES order:
    //          mush ban gre red shld star trip blue bullet
    odds: [
      /* 1st */ [5, 40, 30, 0, 25, 0, 0, 0, 0],
      /* 2nd */ [10, 25, 25, 15, 18, 0, 7, 0, 0],
      /* 3rd */ [12, 12, 18, 25, 10, 5, 10, 8, 0],
      /* 4th */ [12, 6, 12, 25, 6, 10, 14, 10, 5],
      /* 5th */ [12, 0, 8, 22, 5, 15, 15, 11, 12],
      /* 6th */ [8, 0, 5, 20, 5, 18, 15, 11, 18],
    ],
  },

  controls: {
    stickDeadZone: 0.12,    // joystick (Settings): this share of the knob's travel either side does nothing...
    stickFull: 0.85,        // ...and full lock is reached here (share of the base's radius)
  },

  camera: {
    distance: 7,
    height: 3.2,
    posLag: 6,
    yawLag: 4,
    lookAhead: 4,
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
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

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
world.addContactMaterial(new CANNON.ContactMaterial(physMats.chassis, physMats.wall, { friction: 0.0, restitution: 0.3 }));
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
    for (const m of Object.values(itemVis.models)) { m.geo.dispose(); m.mat.dispose(); }
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
    add(new THREE.ConeGeometry(0.42, 0.42, 6), 0xf2f6fa, 0, 0.79, 0);
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

const karts = CFG.racers.map((r, i) => makeRacer(r, i === 0));
const kart = karts[0];
world.addEventListener('preStep', () => karts.forEach(applyStabilityAssist));
// Rails cost speed. 'collide' fires per contact point, before the solver (true impact speed); keep the
// hardest one and let applyStabilityAssist apply it once, right after the solver in the same step.
for (const k of karts) {
  k.body.addEventListener('collide', (e) => {
    if (e.body.material !== physMats.wall) return;
    k.wallTouch = true;
    k.wallHit = Math.max(k.wallHit, Math.abs(e.contact.getImpactVelocityAlongNormal()));
  });
}

function makeRacer({ name, colors }, isPlayer) {
  return Object.assign(buildKart(colors), {
    skid: [{ x: 0, y: 0, z: 0, on: false }, { x: 0, y: 0, z: 0, on: false }], // last skid-mark point per rear wheel
    name, isPlayer,
    color: '#' + colors[0].toString(16).padStart(6, '0'),
    ctl: { steer: 0, gas: false, brake: false }, // steer -1..1, positive = right
    topMult: 1,
    orbit: [], // triple mushroom meshes circling the kart
    ai: isPlayer ? null : {},
    ...freshDriveState(),
  });
}

/** Per-kart driving + race-progress state, reset at every race start. */
function freshDriveState() {
  return {
    speed: 0, steerSmooth: 0, steerAngle: 0, driftAmt: 0, drifting: false, driftCharge: 0,
    boost: 0, flipTimer: 0, fallT: 0, airT: 0, padT: 0, stall: 0, wallTouch: false, wallHit: 0,
    item: null, itemRoll: 0, itemCount: 0, tripleT: 0, spin: 0, spinTotal: 1, shield: 0, star: 0, bullet: 0, bulletLane: 0,
    trackIdx: 0, lap: 1, halfway: false, progress: 0, place: 1, finished: false, finishTime: 0,
  };
}

function buildKart([bodyColor, accentColor, driverColor]) {
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
  const add = (geo, color, x, y, z, parent = group) => {
    const mesh = new THREE.Mesh(geo, lambert(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const y0 = K.chassisYOffset;
  add(new THREE.BoxGeometry(1.5, 0.22, 2.6), bodyColor, 0, y0 - 0.1, 0);      // floor pan
  add(new THREE.BoxGeometry(1.15, 0.32, 0.7), bodyColor, 0, y0 + 0.05, 1.1);  // nose
  add(new THREE.BoxGeometry(1.9, 0.16, 0.25), 0x333333, 0, y0 - 0.12, 1.5);   // bumper
  add(new THREE.BoxGeometry(0.28, 0.3, 1.1), accentColor, 0.72, y0 + 0.05, 0); // side pods
  add(new THREE.BoxGeometry(0.28, 0.3, 1.1), accentColor, -0.72, y0 + 0.05, 0);
  add(new THREE.BoxGeometry(0.9, 0.65, 0.22), 0x2a2a3a, 0, y0 + 0.3, -0.6);   // seat back
  add(new THREE.BoxGeometry(0.75, 0.38, 0.5), 0x777a85, 0, y0 + 0.12, -1.05); // engine
  add(new THREE.CylinderGeometry(0.33, 0.4, 0.6, 8), driverColor, 0, y0 + 0.38, -0.3); // driver
  const helmet = add(new THREE.IcosahedronGeometry(0.33, 1), 0xffffff, 0, y0 + 0.92, -0.3);
  add(new THREE.BoxGeometry(0.44, 0.15, 0.1), 0x1c2340, 0, 0.0, 0.29, helmet); // visor
  add(new THREE.BoxGeometry(0.7, 0.07, 0.07), bodyColor, 0, 0.17, 0, helmet);   // stripe
  const wheel = add(new THREE.TorusGeometry(0.18, 0.04, 6, 12), 0x222222, 0, y0 + 0.48, 0.2);
  wheel.rotation.x = -0.9;
  add(new THREE.BoxGeometry(0.06, 0.45, 0.06), 0x222222, 0.6, y0 + 0.35, -1.35);  // spoiler struts
  add(new THREE.BoxGeometry(0.06, 0.45, 0.06), 0x222222, -0.6, y0 + 0.35, -1.35);
  add(new THREE.BoxGeometry(1.7, 0.08, 0.42), accentColor, 0, y0 + 0.6, -1.4);    // spoiler

  // Exhaust + boost flame
  const pipeGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 6);
  pipeGeo.rotateX(Math.PI / 2);
  add(pipeGeo, 0x444444, 0.22, y0 + 0.1, -1.4);
  add(pipeGeo, 0x444444, -0.22, y0 + 0.1, -1.4);
  const flameGeo = new THREE.ConeGeometry(0.16, 0.9, 6);
  flameGeo.rotateX(-Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x66d9ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = [0.22, -0.22].map((x) => {
    const f = new THREE.Mesh(flameGeo, flameMat);
    f.position.set(x, y0 + 0.1, -1.95);
    f.visible = false;
    group.add(f);
    return f;
  });

  // Drift sparks behind the rear wheels
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0x5cc8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks = [K.wheelX, -K.wheelX].map((x) => {
    const sp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), sparkMat);
    sp.position.set(x, -0.45, K.wheelRearZ - 0.45);
    sp.visible = false;
    group.add(sp);
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
  stars.position.set(0, y0 + 1.55, -0.3);
  stars.visible = false;
  group.add(stars);

  // --- Visuals: wheels (positioned from the physics wheel transforms) ---
  const tireMat = lambert(0x1f1f24);
  const hubMat = lambert(0xdddddd);
  const wheelMeshes = layout.map((_, i) => {
    const width = i < 2 ? 0.34 : 0.44;
    const g = new THREE.Group();
    const tireGeo = new THREE.CylinderGeometry(K.wheelRadius, K.wheelRadius, width, 12);
    tireGeo.rotateZ(Math.PI / 2); // cylinder axis Y -> axle axis X
    const tire = new THREE.Mesh(tireGeo, tireMat);
    const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, width + 0.02, 6);
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
  const pos = [], nor = [], col = [];
  for (const m of parts) {
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    const flat = g.index ? g.toNonIndexed() : g;
    pos.push(...flat.attributes.position.array);
    nor.push(...flat.attributes.normal.array);
    const { r, g: gr, b } = m.material.color;
    for (let i = 0; i < flat.attributes.position.count; i++) col.push(r, gr, b);
  }
  for (const m of parts) m.removeFromParent();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
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
  const MAX = 220;
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

  // Banana + shell templates (baked to one mesh each; instances share geometry + material)
  const template = (build) => {
    const g = new THREE.Group();
    build((geo, color, x, y, z) => {
      const m = new THREE.Mesh(geo, lambert(color));
      m.position.set(x, y, z);
      g.add(m);
      return m;
    });
    const mesh = bakeMeshes(g);
    return { geo: mesh.geometry, mat: mesh.material };
  };
  const banana = template((add) => {
    const body = add(new THREE.TorusGeometry(0.42, 0.14, 6, 10, Math.PI * 0.9), 0xffd23a, 0, 0.3, 0);
    body.rotation.z = Math.PI * 0.05;
    add(new THREE.CylinderGeometry(0.05, 0.06, 0.18, 5), 0x5a3a12, -0.44, 0.38, 0);
  });
  const shell = (color) => template((add) => {
    add(new THREE.SphereGeometry(0.42, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), color, 0, 0.12, 0);
    add(new THREE.CylinderGeometry(0.46, 0.46, 0.14, 10), 0xffffff, 0, 0.1, 0);
  });
  const mushroom = template((add) => {
    add(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 8), 0xfff1d6, 0, 0.15, 0);
    add(new THREE.SphereGeometry(0.34, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xe8322f, 0, 0.28, 0);
    for (const [x, z] of [[0.18, 0.12], [-0.16, 0.14], [0, -0.22]]) add(new THREE.SphereGeometry(0.08, 6, 4), 0xffffff, x, 0.5, z);
  });
  const blue = template((add) => {
    add(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x2a6bff, 0, 0.12, 0);
    add(new THREE.CylinderGeometry(0.54, 0.54, 0.14, 12), 0xffffff, 0, 0.1, 0);
    for (const x of [0.55, -0.55]) add(new THREE.BoxGeometry(0.7, 0.06, 0.35), 0xffffff, x * 1.4, 0.45, 0).rotation.z = x * 0.6;
  });
  return {
    boxes, boxMesh, pads, padTex,
    models: { banana, green: shell(0x2fbf4a), red: shell(0xe8322f), mushroom, blue },
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

const input = { left: false, right: false, axis: 0, gas: false, brake: false, reset: false, item: false }; // axis: joystick -1..1

const hud = {
  lap: $('lap'), time: $('time'), best: $('best'), speed: $('speed'),
  place: $('place'), placeNum: $('place-num'), placeSuffix: $('place-suffix'), placeOf: $('place-of'),
  countdown: $('countdown'), message: $('message'),
  driftFill: $('drift-fill'), overlay: $('overlay'),
  menuScreen: $('menu-screen'), resultsScreen: $('results-screen'), menuRecord: $('menu-record'),
  resPlace: $('res-place'), resTime: $('res-time'), resLap: $('res-lap'), resRecord: $('res-record'),
  standings: $('standings'), confetti: $('confetti'),
  item: $('btn-item'), warn: $('warn'), perf: $('perf'), split: $('split'), wrongway: $('wrongway'), tip: $('tip'),
  pauseScreen: $('pause-screen'), settingsScreen: $('settings-screen'), knob: $('stick-knob'),
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

/* ==========================================================================
 * 2. CONTROL LISTENERS (multi-touch via Pointer Events)
 * ========================================================================== */
initControls();

function initControls() {
  // --- Slide from GAS onto ITEM: fires the item while the gas stays held (GAS keeps the captured pointer) ---
  function slideToItem(el) {
    const over = new Set(); // pointers currently over ITEM, so each slide-on fires once
    el.addEventListener('pointermove', (e) => {
      const r = hud.item.getBoundingClientRect(), pad = 8;
      const inside = e.clientX > r.left - pad && e.clientX < r.right + pad && e.clientY > r.top - pad && e.clientY < r.bottom + pad;
      if (inside && !over.has(e.pointerId)) {
        over.add(e.pointerId);
        input.item = true;
        hud.item.classList.add('pressed');
        setTimeout(() => hud.item.classList.remove('pressed'), 120);
      } else if (!inside) over.delete(e.pointerId);
    });
    ['pointerup', 'pointercancel'].forEach((t) => el.addEventListener(t, (e) => over.delete(e.pointerId)));
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
    if (app.classList.contains('rotated')) [sx, sy] = [sy, -sx]; // portrait: the game is turned 90deg
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
  bindHold($('btn-gas'), 'gas');
  slideToItem($('btn-gas'));
  bindHold($('btn-brake'), 'brake');

  $('btn-reset').addEventListener('pointerdown', (e) => { e.preventDefault(); input.reset = true; });
  hud.item.addEventListener('pointerdown', (e) => { e.preventDefault(); input.item = true; hud.item.classList.add('pressed'); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => hud.item.addEventListener(t, () => hud.item.classList.remove('pressed')));

  // Menu buttons fire on pointer release over the button, not on 'click': iOS sometimes drops the
  // click it synthesises from a tap (slight finger roll, page busy, hover heuristics), so START
  // needed a second tap. detail === 0 clicks (keyboard, tests calling .click()) still work.
  const onTap = (el, fn) => {
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = e.pointerId; });
    el.addEventListener('pointerup', (e) => {
      if (down !== e.pointerId) return;
      down = null;
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left - 12 && e.clientX <= r.right + 12 && e.clientY >= r.top - 12 && e.clientY <= r.bottom + 12) fn();
    });
    el.addEventListener('pointercancel', () => { down = null; });
    el.addEventListener('click', (e) => { if (e.detail === 0) fn(); });
  };
  for (const [id, t] of Object.entries(CFG.tracks)) {
    const b = document.createElement('button');
    b.className = 'trk';
    b.dataset.track = id;
    b.innerHTML = `<i>${t.icon}</i>${t.name}`;
    onTap(b, () => { sound.click(); selectTrack(id); });
    $('track-pick').append(b);
  }
  onTap($('btn-start'), startRace);
  onTap($('btn-again'), startRace);
  onTap($('btn-menu'), () => { sound.click(); showMenu(); });
  $('btn-pause').addEventListener('pointerdown', (e) => { e.preventDefault(); pauseGame(); });
  onTap($('btn-resume'), resumeGame);
  onTap($('btn-restart'), () => { state.paused = false; startRace(); });
  onTap($('btn-quit'), () => { state.paused = false; sound.unlock(); showMenu(); });
  document.querySelectorAll('.btn-settings').forEach((b) => onTap(b, () => { sound.click(); showSettings(); }));
  for (const b of $('steer-pick').children) onTap(b, () => { sound.click(); setSteering(b.dataset.steer); });
  onTap($('btn-settings-back'), () => { sound.click(); showOverlay(settingsFrom); });
  setSteering(savedSteering(), false);
  for (const pick of document.querySelectorAll('.vol-pick')) {
    for (const b of pick.children) onTap(b, () => { setVolume(pick.dataset.bus, +b.dataset.vol); sound.click(); });
    setVolume(pick.dataset.bus, savedVolume(pick.dataset.bus), false);
  }

  // --- Sound: mute toggle; any touch re-wakes audio that iOS suspended (calls, app switch)
  const muteBtn = $('btn-mute');
  const showMute = () => { muteBtn.classList.toggle('off', sound.muted); muteBtn.setAttribute('aria-pressed', sound.muted); };
  muteBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!state.paused) sound.unlock();
    sound.setMuted(!sound.muted);
    showMute();
  });
  showMute();
  // (also the first tap on the title screen, which starts its music: iOS allows no sound before a tap)
  document.addEventListener('pointerdown', () => { if (!state.paused) sound.unlock(); });

  // --- Block browser gestures (scroll, pinch, double-tap zoom, long-press menu) ---
  const block = (e) => e.preventDefault();
  document.addEventListener('touchmove', block, { passive: false });
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
    keys.add(e.code); updateKeys();
    if (e.code === 'KeyR') input.reset = true;
    if (e.code === 'Space' || e.code === 'KeyE') input.item = true;
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
    if (impact > 3 && navigator.vibrate) navigator.vibrate(Math.min(60, impact * 4));
  });
}

/** The game is always laid out landscape; in portrait the #app container is rotated 90deg. */
function onResize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const rotated = vh > vw;
  const w = rotated ? vh : vw;
  const h = rotated ? vw : vh;
  app.classList.toggle('rotated', rotated);
  app.style.width = `${w}px`;
  app.style.height = `${h}px`;
  app.style.setProperty('--app-h', `${h}px`);
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  minimap.layout();
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
  placeOnGrid();
  teleStart();
  camState.snap = true;
  showCountdown('3');
  sound.beep();
  showTip('Press GAS on "1" for a rocket start');
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
    k.ai = k.isPlayer ? null : newAI(lane, k.name);
    k.topMult = 1;
    resetKart(k, track.N - Math.round(back / track.spacing), lane);
  });
  updatePlaces();
}

/** Puts a kart on the track at sample idx, `lane` metres left of the centre line, facing forward. */
/** Ghost after a respawn: no contact with other karts (walls and road still count). */
function setGhost(k, on) {
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
  Object.assign(k, { trackIdx: idx, flipTimer: 0, fallT: 0, driftCharge: 0, boost: 0, steerSmooth: 0, spin: 0 });
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
  const trying = k.isPlayer && !k.ai && racing && !k.finished && k.spin <= 0 && (input.gas || input.brake);
  k.stuckT = trying && Math.abs(k.speed) < CFG.kart.rescueSpeed ? (k.stuckT || 0) + dt : 0;
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
  showMenu();
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
  const rec = loadRecords()[track.id] || {};
  hud.menuRecord.hidden = !rec.race;
  if (rec.race) hud.menuRecord.textContent = `Your record ${fmtTime(rec.race)} · best lap ${fmtTime(rec.lap)}`;
  hud.confetti.replaceChildren();
  for (const b of $('track-pick').children) b.classList.toggle('on', b.dataset.track === track.id);
  showOverlay(hud.menuScreen);
}

/** GAS pressed on the "1" and held through GO = boost; held since before "2" = stall. */
function rocketStart() {
  const K = CFG.kart, from = state.gasFrom;
  if (from === null) return;
  if (from <= K.rocketWindow) {
    kart.boost = K.rocketBoost;
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

// ---------- Settings (per device). Steering: 'buttons' (the two arrows) or 'joystick' (analogue). ----------
const STEER_KEY = 'kartrush.steering';
let settingsFrom = null; // the screen BACK returns to (title or pause)
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
  if (!tele.on) return;
  tele.nextT = 0;
  tele.race = {
    build: $('build').textContent.split(' ')[1], at: new Date().toISOString(), track: track.id,
    steering: savedSteering(), laps: CFG.laps,
    karts: karts.map((k) => ({ name: k.name, ...(k.ai && { role: k.ai.style.role, skill: +k.ai.skill.toFixed(3), grip: +k.ai.grip.toFixed(1),
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
function teleSample() {
  if (!tele.race || state.raceTime < tele.nextT) return;
  tele.nextT = state.raceTime + 1;
  tele.race.samples.push([+state.raceTime.toFixed(1), ...karts.map((k) => [Math.round(k.progress * track.spacing),
    Math.round(k.speed * 3.6), k.place, k.ai ? Math.round(k.topMult * 100) : 0]),
    input.gas ? 'g' : input.brake ? 'b' : '-']);
}
function teleSend(end) {
  const race = tele.race;
  tele.race = null;
  if (!race || state.raceTime < 5) return; // quit straight away: nothing worth keeping
  race.end = end;
  race.result = karts.map((k) => ({ finished: k.finished, time: k.finished ? +k.finishTime.toFixed(2) : null, place: k.place }));
  fetch('/telemetry', { method: 'POST', body: JSON.stringify(race) }).catch(() => {});
}

function showSettings() {
  settingsFrom = state.paused ? hud.pauseScreen : hud.menuScreen;
  showOverlay(hud.settingsScreen);
}
function releaseStick() {
  input.axis = 0;
  hud.knob.style.transform = '';
  hud.knob.classList.remove('held');
}

/** Shows one overlay screen (menu / results / pause / settings) and hides the HUD behind it. */
function showOverlay(screen) {
  for (const el of [hud.menuScreen, hud.resultsScreen, hud.pauseScreen, hud.settingsScreen]) el.hidden = el !== screen;
  hud.wrongway.hidden = true;
  app.classList.add('overlay-on');
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
      <td class="name"><i class="swatch" style="background:${k.color}"></i>${k.isPlayer ? 'YOU' : k.name}</td>
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
  const newRace = !(rec.race <= kart.finishTime), newLap = !(rec.lap <= state.bestLap);
  if (newRace) rec.race = kart.finishTime;
  if (newLap) rec.lap = state.bestLap;
  saveRecords(all);
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
  if (A.trap && k.item === 'banana' && k.itemRoll <= 0 && trapCorner(idx)) goal = clampLane(idx, track.line[idx]);
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

  // --- Speed: own pace, capped so it can still brake for every corner ahead
  const pace = k.star > 0 ? K.maxSpeed + CFG.items.starSpeed : K.maxSpeed * (k.finished ? A.finishedPace : ai.skill);
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
const ITEM_TYPES = ['mushroom', 'banana', 'green', 'red', 'shield', 'star', 'triple', 'blue', 'bullet'];
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
  const odds = CFG.items.odds[clamp(place, 1, CFG.items.odds.length) - 1].slice();
  const tilt = k?.ai?.style.itemOdds; // a personality's item luck (the bully: weapons)
  if (tilt) tilt.forEach((m, i) => { odds[i] *= m; });
  // one blue shell at a time (flying or held)
  if (shells.some((s) => s.kind === 'blue') || karts.some((k) => k.item === 'blue')) odds[ITEM_TYPES.indexOf('blue')] = 0;
  let r = Math.random() * odds.reduce((a, b) => a + b, 0);
  for (let i = 0; i < odds.length; i++) if ((r -= odds[i]) < 0) return ITEM_TYPES[i];
  return 'mushroom';
}

function spawnModel(kind, pos) {
  const { geo, mat } = itemVis.models[kind];
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
}

const itemFwd = new CANNON.Vec3();
function useItem(k) {
  if (!k.item || k.itemRoll > 0 || k.spin > 0 || k.bullet > 0) return;
  const I = CFG.items, b = k.body;
  const fwd = b.quaternion.vmult(LOCAL_FWD, itemFwd);
  const h = Math.hypot(fwd.x, fwd.z) || 1;
  const fx = fwd.x / h, fz = fwd.z / h;
  const item = k.item;
  teleEvent('use', k, { item, place: k.place });
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
    if (k.isPlayer) { showMessage('STAR POWER!'); sound.star(); }
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
  } else if (item === 'banana') {
    const pos = new THREE.Vector3(b.position.x - fx * 2.4, 0, b.position.z - fz * 2.4);
    pos.y = surfaceY(k.trackIdx, clampLane(k.trackIdx, lateral(k.trackIdx, pos), 0)); // on the road, even mid-air
    drops.push({ mesh: spawnModel('banana', pos), pos, owner: k, age: 0 });
    if (k.isPlayer) sound.drop();
  } else {
    const red = item === 'red';
    const ahead = red ? redShellTarget(k) : null;
    const speed = red ? I.redSpeed : I.shellSpeed;
    const pos = new THREE.Vector3(b.position.x + fx * 2.4, 0, b.position.z + fz * 2.4);
    pos.y = surfaceY(k.trackIdx, clampLane(k.trackIdx, lateral(k.trackIdx, pos), 0)) + 0.15;
    shells.push({
      kind: item, mesh: spawnModel(item, pos), pos,
      vel: new THREE.Vector3(fx * speed, 0, fz * speed), idx: k.trackIdx,
      owner: k, target: ahead || null, age: 0, life: red ? I.redLife : I.shellLife, bounces: 0,
    });
    if (k.isPlayer || ahead?.isPlayer) sound.throwShell();
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

/** The blue shell goes for whoever leads the race (not its owner), and moves on if they finish. */
function blueTarget(owner) {
  let best = null;
  for (const o of karts) if (o !== owner && !o.finished && (!best || o.place < best.place)) best = o;
  return best;
}

/** A pop of yellow / white sparks where a kart got hit. */
function hitBurst(k) {
  const p = k.body.position;
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2, sp = 3.5 + Math.random() * 3.5;
    emitP.set(p.x, p.y + 0.7, p.z);
    emitV.set(Math.cos(a) * sp, 1.5 + Math.random() * 3, Math.sin(a) * sp);
    fx.emit(emitP, emitV, i % 2 ? [1, 1, 1] : [1, 0.86, 0.25], { life: 0.5, size: 0.35, grow: 0.4, alpha: 0.95 });
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

/**
 * Hit by a banana / shell / star / bullet / blast. A star or a bullet makes a kart immune, a shield
 * takes the hit and pops. Returns whether the kart actually spun out.
 */
function spinOut(k, by, what, time = CFG.items.spinTime) {
  if (k.spin > 0 || k.star > 0 || k.bullet > 0 || k.ghosted) return false;
  if (k.shield > 0) {
    teleEvent('blocked', k, { by: by ? karts.indexOf(by) : -1, what });
    k.shield = 0;
    shieldBurst(k);
    if (k.isPlayer) { showMessage('BLOCKED!'); sound.shieldPop(); }
    else if (by?.isPlayer || near(k, 30)) sound.shieldPop();
    return false;
  }
  k.spin = k.spinTotal = time;
  k.hitBy = `${what} from ${by?.name}`;
  teleEvent('hit', k, { by: by ? karts.indexOf(by) : -1, what });
  k.boost = 0;
  k.driftCharge = 0;
  // Lose half the speed at once, then slide on: stopping dead got karts rear-ended into the air
  k.body.velocity.x *= 0.5;
  k.body.velocity.z *= 0.5;
  hitBurst(k);
  if (k.isPlayer) {
    showMessage('OUCH!');
    sound.spin();
    if (navigator.vibrate) navigator.vibrate(120);
  } else if (by?.isPlayer) {
    showMessage(`HIT ${k.name.toUpperCase()}!`);
    sound.hitOther();
  }
  return true;
}

const near = (k, m) => k.body.position.distanceSquared(kart.body.position) < m * m;

/** The blue shell's blast: everyone close to its target spins out for longer, and gets popped up a bit. */
function blueBlast(s, at) {
  const I = CFG.items, p = at.body.position;
  for (const k of karts) {
    const d2 = (k.body.position.x - p.x) ** 2 + (k.body.position.z - p.z) ** 2;
    if (d2 > I.blueBlast ** 2 || Math.abs(k.body.position.y - p.y) > 2.5) continue;
    if (spinOut(k, s.owner, 'blue', I.blueSpin)) k.body.velocity.y += 3;
  }
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
  if (!s.target || s.target.finished) {
    // the target finished: go for the new leader, the short way round
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
      if (!k.item && !k.finished) {
        k.item = rollItem(k.place, k);
        teleEvent('box', k, { item: k.item, place: k.place });
        k.itemCount = k.item === 'triple' ? 3 : 1;
        k.itemRoll = I.rollTime;
        if (k.ai) k.ai.itemT = rand(0.4, 2.5);
        if (k.isPlayer) sound.itemBox(I.rollTime);
      }
      break;
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
    // Star / bullet: anyone touched spins out and gets knocked aside
    if (racing && (k.star > 0 || k.bullet > 0)) {
      for (const o of karts) {
        if (o === k || flat2(o.body.position, k.body.position) > I.bumpRadius ** 2) continue;
        if (!spinOut(o, k, k.bullet > 0 ? 'bullet' : 'star')) continue;
        const dx = o.body.position.x - k.body.position.x, dz = o.body.position.z - k.body.position.z;
        const d = Math.hypot(dx, dz) || 1, shove = k.bullet > 0 ? 6 : 3;
        o.body.velocity.x += (dx / d) * shove;
        o.body.velocity.z += (dz / d) * shove;
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
    const hit = karts.find((k) => (k !== d.owner || d.age > 0.8) && flat2(k.body.position, d.pos) < I.bananaRadius ** 2);
    if (hit) {
      spinOut(hit, d.owner, 'banana');
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
    s.pos.y = surfaceY(s.idx, clampLane(s.idx, lateral(s.idx, s.pos), 0)) + 0.15; // shells hug the road
    s.mesh.position.copy(s.pos);
    s.mesh.rotation.y += dt * 12;

    let gone = s.life <= 0 || s.bounces > I.shellBounces;
    const hit = !gone && karts.find((k) => (k !== s.owner || s.age > 0.6) && flat2(k.body.position, s.pos) < I.hitRadius ** 2);
    if (hit) { spinOut(hit, s.owner, s.kind); gone = true; }
    const banana = gone ? -1 : drops.findIndex((d) => flat2(d.pos, s.pos) < 1.2);
    if (banana >= 0) {
      scene.remove(drops[banana].mesh);
      drops.splice(banana, 1);
      gone = true;
    }
    if (gone) {
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
  const ai = k.ai, st = ai.style;
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
  } else if (k.item === 'red' && (st.hoard || st.overtake > 0.9)) {
    // the careful ones wait until a kart ahead is close enough for the shell to lock on
    use = ai.itemT < -10 || karts.some((o) => o !== k && o.progress > k.progress && (o.progress - k.progress) * spacing < 40);
  } else if (k.item === 'red' || k.item === 'blue' || k.item === 'star' || k.item === 'bullet') {
    use = true;
  } else if (k.item === 'shield') {
    use = shellIncoming(k) || ai.itemT < (st.hoard ? -25 : -4) || karts.some((o) => (o.star > 0 || o.bullet > 0) && o !== k &&
      o.body.position.distanceSquared(k.body.position) < 20 * 20);
  } else {
    const wantBehind = k.item === 'banana';
    use = ai.itemT < (wantBehind ? (st.hoard || st.trap ? -20 : -7) : -10);
    // the trap: dropped on the racing line just before a corner, where everyone (the player too) will drive
    if (wantBehind && st.trap && trapCorner(k.trackIdx, 18) &&
      Math.abs(lateral(k.trackIdx, k.body.position) - track.line[k.trackIdx]) < 1.2) use = true;
    const tail = st.aggression > 0.7 ? 20 : 14; // the bully drops it for anyone within 20 m
    for (const o of karts) {
      if (o === k) continue;
      const dx = o.body.position.x - k.body.position.x, dz = o.body.position.z - k.body.position.z;
      const ahead = dx * fwd.x + dz * fwd.z;
      const side = Math.abs(dx * fwd.z - dz * fwd.x);
      if (wantBehind) {
        if (ahead < -2 && ahead > -tail && side < 3) use = true;
      } else if (ahead > 3 && ahead < 30 && side < ahead * 0.12 + 0.6 && (o.isPlayer || st.aggression > 0.7 || ai.itemT < -5)) {
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
const tmpVec = new CANNON.Vec3();
const tmpFwd = new CANNON.Vec3();

function stepPhysics(dt) {
  const canDrive = state.phase === 'race' || state.phase === 'finished';
  for (const k of karts) {
    if (k.ai) {
      updateAI(k, dt, canDrive);
    } else {
      k.ctl.steer = clamp((input.right ? 1 : 0) - (input.left ? 1 : 0) + input.axis, -1, 1);
      k.ctl.gas = input.gas;
      k.ctl.brake = input.brake;
      if (input.item && canDrive && !k.finished) useItem(k);
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

  // Rail contact this step: a hit costs a share of speed by how hard it was, sliding along costs a bit more
  if (k.wallTouch) {
    const hit = clamp((k.wallHit - 1.5) * K.wallHitLoss, 0, K.wallHitMax);
    if (k.isPlayer && hit > 0.03) teleEvent('rail', k, { loss: +hit.toFixed(2), kmh: Math.round(k.speed * 3.6) });
    const scale = (1 - hit) * (1 - K.wallScrape * CFG.physicsStep);
    body.velocity.x *= scale;
    body.velocity.z *= scale;
    k.wallTouch = false;
    k.wallHit = 0;
  }

  const fwd = body.quaternion.vmult(LOCAL_FWD, tmpFwd);
  const speed = body.velocity.dot(fwd);
  const onGround = vehicle.wheelInfos.some((w) => w.raycastResult.hasHit);
  if (!onGround) airLevel(k);
  // Boost: extra push through the centre of mass. Doing it with more wheel torque popped wheelies
  // and flipped karts that hit a boost pad at low speed.
  if (k.boost > 0 && k.spin <= 0 && speed < K.maxSpeed * k.topMult + K.boostSpeed && onGround) {
    const dv = K.boostAccel * CFG.physicsStep;
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

const spinQ = new THREE.Quaternion();
const spinAxis = new THREE.Vector3();
const interpQ = new THREE.Quaternion(), bodyP = new THREE.Vector3();

/**
 * Meshes are drawn at the body's *interpolated* pose (between the last two fixed physics steps), not
 * its raw one. Frame times wobble around the 1/60 s step, so raw poses advance 0 or 2 steps on some
 * frames: the kart and camera visibly hitch even at a steady frame rate.
 */
function syncMeshes() {
  for (const { body, vehicle, group, wheelMeshes, spin, spinTotal, bullet } of karts) {
    group.position.copy(body.interpolatedPosition);
    group.quaternion.copy(body.interpolatedQuaternion);
    // wheel transforms come from the raw pose: move them by (interpolated pose) * (raw pose)^-1
    bodyP.copy(body.position);
    interpQ.copy(body.quaternion).invert().premultiply(group.quaternion);
    // Spin-out is visual only: turn the body and wheels about the kart's up axis (two full turns)
    const spinning = spin > 0;
    if (spinning) {
      spinAxis.set(0, 1, 0).applyQuaternion(group.quaternion);
      // two turns per spinTime (the blue shell's longer blast spins more)
      spinQ.setFromAxisAngle(spinAxis, (1 - spin / spinTotal) * (spinTotal / CFG.items.spinTime) * Math.PI * 4);
      group.quaternion.premultiply(spinQ);
    }
    for (let i = 0; i < vehicle.wheelInfos.length; i++) {
      vehicle.updateWheelTransform(i);
      const t = vehicle.wheelInfos[i].worldTransform;
      const w = wheelMeshes[i];
      w.visible = !(bullet > 0); // inside the bullet
      w.position.copy(t.position).sub(bodyP).applyQuaternion(interpQ).add(group.position);
      w.quaternion.copy(t.quaternion).premultiply(interpQ);
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
  if (hud.item.dataset.item !== shown) hud.item.dataset.item = shown;
  const count = kart.item === 'triple' && kart.itemRoll <= 0 ? `x${kart.itemCount}` : '';
  if (hud.item.dataset.count !== count) hud.item.dataset.count = count;
  hud.item.classList.toggle('ready', !!kart.item && kart.itemRoll <= 0);

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
  const bp = b.interpolatedPosition; // match the drawn kart (see syncMeshes)
  const speedRatio = clamp(Math.abs(kart.speed) / CFG.kart.maxSpeed, 0, 1);

  if (camState.snap) {
    camState.yaw = yaw;
  } else {
    camState.yaw += wrapAngle(yaw - camState.yaw) * (1 - Math.exp(-dt * C.yawLag));
  }

  const dist = C.distance + speedRatio * 1.5;
  desiredCam.set(
    bp.x - Math.sin(camState.yaw) * dist,
    bp.y + C.height,
    bp.z - Math.cos(camState.yaw) * dist,
  );

  if (camState.snap) {
    camState.pos.copy(desiredCam);
    camState.snap = false;
  } else {
    camState.pos.lerp(desiredCam, 1 - Math.exp(-dt * C.posLag));
  }
  camState.pos.y = Math.max(camState.pos.y, track.samples[kart.trackIdx].y + 1.0);
  camera.position.copy(camState.pos);

  camState.look.set(
    bp.x + Math.sin(camState.yaw) * C.lookAhead,
    bp.y + 1.0,
    bp.z + Math.cos(camState.yaw) * C.lookAhead,
  );
  camera.lookAt(camState.look);

  // Speed-based FOV kick
  const targetFov = 66 + speedRatio * 8 + (kart.boost > 0 ? 8 : 0);
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-dt * 4));
    camera.updateProjectionMatrix();
  }

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
    const alpha = k.ghosted ? (Math.floor(itemClock * 12) % 2 ? 0.25 : 0.5) : 1;
    if (alpha !== k.alpha) {
      k.alpha = alpha;
      for (const m of [k.bodyMesh, ...k.wheelMeshes.map((w) => w.children[0])]) {
        m.material.transparent = alpha < 1;
        m.material.opacity = alpha;
        m.material.depthWrite = alpha === 1;
      }
    }
    k.hull.visible = k.bullet > 0;
    k.bodyMesh.visible = !k.hull.visible;
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
  syncMeshes();
  updateCamera(dt);
  updateEffects(dt);
  fx.update(dt);
  updateItemVisuals(dt);
  theme.update(dt);
  updateHUD();
  renderer.render(scene, camera);
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

function wrapAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

// ---------- Boot ----------
$('build').textContent = `build 30 · ${location.host || 'local'}${navigator.standalone ? ' · app' : ''}${perf.on ? ' · meter on' : ''}`; // bump with sw.js VERSION
loadTrack(savedTrack());
onResize();
showMenu();
warmUpShaders();

// PWA: offline cache (service workers need a secure context: https or localhost)
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
requestAnimationFrame(loop);
