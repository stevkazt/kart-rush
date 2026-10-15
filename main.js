import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/* ==========================================================================
 * 0. CONFIG
 * ========================================================================== */
const CFG = {
  physicsStep: 1 / 60,
  maxSubSteps: 5,
  gravity: -20,
  laps: 3,

  track: {
    // Control points (x, z) of a closed Catmull-Rom loop
    points: [
      [0, -70], [60, -70], [95, -42], [100, 0], [92, 35], [65, 48],
      [35, 52], [0, 72], [-45, 72], [-85, 42], [-88, -20], [-55, -62],
    ],
    samples: 600,      // spaced points along the centre line
    halfWidth: 7,      // road half width
    curb: 1,           // curb width (between road and wall)
    wallThickness: 0.6,
    wallHeight: 1.2,
    wallStride: 4,     // samples per wall segment
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
    brakeForce: 600,        // per wheel
    coastBrake: 12,         // rolling resistance when no pedal is held
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
    maxLateralAccel: 22,    // stability assist: caps the requested turn rate at this grip (m/s^2)
    yawSlack: 0.1,          // stability assist: allowed yaw rate above what steering asks for
    steerYawSlack: 0.15,    // ...plus this much at full lock
    driftYawSlack: 0.4,     // ...plus this much while drifting
    maxYawRate: 3.0,

    miniTurboTime: 1.1,     // seconds of drift needed for a boost
    boostDuration: 1.0,
    boostMult: 1.8,
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
    colOffset: 3.2,         // lateral offset of the two columns
  },

  ai: {
    skill: [0.88, 0.98],    // fraction of top speed each AI aims for (rolled per race)
    cornerGrip: [24, 30],   // lateral accel (m/s^2) each AI dares in corners (rolled per race)
    laneRange: 3.5,         // max distance of an AI's racing lane from the centre line (m)
    lookAhead: [8, 15],     // pure-pursuit look-ahead (m), at standstill -> top speed
    steerGain: 2.2,
    mistakeEvery: [6, 15],  // seconds between mistakes (wobble or lift)
    rubberBand: 0.004,      // speed change per metre of gap to the player
    rubberMin: 0.85,
    rubberMax: 1.06,
    finishedPace: 0.7,      // lap-of-honour speed after crossing the line
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

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 600);

scene.add(new THREE.HemisphereLight(0xffffff, 0x5c9a3c, 1.3));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
const SUN_OFFSET = new THREE.Vector3(40, 80, 30);

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

// ---------- 1b. Physics world ----------
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, CFG.gravity, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = false;
world.defaultContactMaterial.friction = 0.2;

const physMats = {
  ground: new CANNON.Material('ground'),
  wall: new CANNON.Material('wall'),
  chassis: new CANNON.Material('chassis'),
};
world.addContactMaterial(new CANNON.ContactMaterial(physMats.chassis, physMats.wall, { friction: 0.0, restitution: 0.3 }));
world.addContactMaterial(new CANNON.ContactMaterial(physMats.chassis, physMats.ground, { friction: 0.2, restitution: 0 }));
world.addContactMaterial(new CANNON.ContactMaterial(physMats.chassis, physMats.chassis, { friction: 0.05, restitution: 0.25 }));

// ---------- 1c. Track ----------
const track = buildTrack();

function buildTrack() {
  const T = CFG.track;
  const N = T.samples;
  const curve = new THREE.CatmullRomCurve3(
    T.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');

  const samples = curve.getSpacedPoints(N); // N + 1 points, last == first
  const tangents = [];
  const normals = [];
  for (let i = 0; i <= N; i++) {
    const t = curve.getTangentAt((i % N) / N);
    t.y = 0;
    t.normalize();
    tangents.push(t);
    normals.push(new THREE.Vector3(t.z, 0, -t.x)); // points to the kart's left
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
  const data = { N, samples, tangents, normals, spacing, radius };

  // Ground (visual + physics)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), lambert(0x6cc04a));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const groundBody = new CANNON.Body({ mass: 0, material: physMats.ground, shape: new CANNON.Plane() });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  // Static bodies never refresh their AABB on their own. Without this the plane keeps the
  // bounds of its un-rotated pose (z <= 0) and the wheel raycasts miss the ground for z > 0.
  groundBody.updateAABB();
  world.addBody(groundBody);

  // Road surface, centre dashes and curbs
  const hw = T.halfWidth;
  scene.add(makeRibbon(data, -hw, hw, 0.02, (i) => ((i / 10) | 0) % 2 ? 0x55585f : 0x5b5e66));
  scene.add(makeRibbon(data, -0.18, 0.18, 0.03, (i) => (i % 12 < 6 ? 0xf2f2f2 : null)));
  const curbColor = (i) => ((i / 3) | 0) % 2 ? 0xffffff : 0xe8322f;
  scene.add(makeRibbon(data, hw, hw + T.curb, 0.025, curbColor));
  scene.add(makeRibbon(data, -hw - T.curb, -hw, 0.025, curbColor));

  buildWalls(data);
  buildStartLine(data);
  buildScenery(data);
  return data;
}

/** Builds a flat strip between two signed lateral offsets along the centre line. */
function makeRibbon({ N, samples, normals }, inner, outer, y, colorAt) {
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  const p = (i, off) => [samples[i].x + normals[i].x * off, y, samples[i].z + normals[i].z * off];

  for (let i = 0; i < N; i++) {
    const color = colorAt(i);
    if (color === null) continue;
    const a0 = p(i, inner), a1 = p(i, outer), b0 = p(i + 1, inner), b1 = p(i + 1, outer);
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

/** Static box colliders along both track edges + one instanced mesh for visuals. */
function buildWalls({ N, samples, normals }) {
  const T = CFG.track;
  const th = T.wallThickness, h = T.wallHeight, k = T.wallStride;
  const off = T.halfWidth + T.curb + th / 2;
  const maxCount = Math.ceil(N / k) * 2;

  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lambert(0xffffff), maxCount);
  inst.castShadow = true;
  inst.receiveShadow = true;

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const mid = new THREE.Vector3(), color = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  let idx = 0;

  for (const side of [1, -1]) {
    for (let i = 0; i < N; i += k) {
      const j = Math.min(i + k, N);
      const a = samples[i].clone().addScaledVector(normals[i], off * side);
      const b = samples[j].clone().addScaledVector(normals[j], off * side);
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) + th; // small overlap closes gaps on curves
      const yaw = Math.atan2(dx, dz);

      mid.addVectors(a, b).multiplyScalar(0.5);
      mid.y = h / 2;
      q.setFromAxisAngle(up, yaw);
      s.set(th, h, len);
      m.compose(mid, q, s);
      inst.setMatrixAt(idx, m);
      inst.setColorAt(idx, color.set(((i / k) | 0) % 2 ? 0xffffff : 0x2f6bff));
      idx++;

      const body = new CANNON.Body({
        mass: 0,
        material: physMats.wall,
        shape: new CANNON.Box(new CANNON.Vec3(th / 2, h / 2, len / 2)),
      });
      body.position.set(mid.x, mid.y, mid.z);
      body.quaternion.setFromAxisAngle(AXIS_Y, yaw);
      body.updateAABB(); // static: bounds must be refreshed after placing it
      world.addBody(body);
    }
  }
  inst.count = idx;
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  scene.add(inst);
}

function buildStartLine({ samples, tangents }) {
  const T = CFG.track;
  const w = T.halfWidth * 2;

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
  const yaw = Math.atan2(tangents[0].x, tangents[0].z);
  line.position.set(samples[0].x, 0.04, samples[0].z);
  line.rotation.y = yaw;
  line.receiveShadow = true;
  scene.add(line);

  // Arch: two posts + banner
  const arch = new THREE.Group();
  const postOff = T.halfWidth + T.curb + T.wallThickness + 0.6;
  const postMat = lambert(0xffd23a);
  for (const side of [1, -1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 0.8), postMat);
    post.position.set(side * postOff, 3.5, 0);
    post.castShadow = true;
    arch.add(post);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(postOff * 2 + 0.8, 1.4, 0.5), lambert(0xe8322f));
  banner.position.y = 7;
  banner.castShadow = true;
  arch.add(banner);

  // Arch local X is lateral: align its local Z with the tangent.
  arch.position.set(samples[0].x, 0, samples[0].z);
  arch.rotation.y = yaw;
  scene.add(arch);
}

function buildScenery({ N, samples }) {
  // Deterministic RNG so the scenery is the same every load
  let seed = 1337;
  const rand = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
  scene.add(trunks, leaves);

  // Distant low-poly mountains
  const mountainColors = [0x7a8fb8, 0x8aa0c8, 0x6d82ad];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rand() * 0.2;
    const r = 240 + rand() * 40;
    const h = 40 + rand() * 50;
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(30 + rand() * 30, h, 5), lambert(mountainColors[i % 3]));
    mtn.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r);
    mtn.rotation.y = rand() * Math.PI;
    scene.add(mtn);
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
    scene.add(cloud);
  }
}

// ---------- 1d. Karts (physics + visuals). karts[0] is the player. ----------
const karts = CFG.racers.map((r, i) => makeRacer(r, i === 0));
const kart = karts[0];
world.addEventListener('preStep', () => karts.forEach(applyStabilityAssist));

function makeRacer({ name, colors }, isPlayer) {
  return Object.assign(buildKart(colors), {
    name, isPlayer,
    color: '#' + colors[0].toString(16).padStart(6, '0'),
    ctl: { steer: 0, gas: false, brake: false }, // steer -1..1, positive = right
    topMult: 1,
    ai: isPlayer ? null : {},
    ...freshDriveState(),
  });
}

/** Per-kart driving + race-progress state, reset at every race start. */
function freshDriveState() {
  return {
    speed: 0, steerSmooth: 0, steerAngle: 0, driftAmt: 0, drifting: false, driftCharge: 0,
    boost: 0, flipTimer: 0,
    trackIdx: 0, lap: 1, halfway: false, progress: 0, place: 1, finished: false, finishTime: 0,
  };
}

function buildKart([bodyColor, accentColor, driverColor]) {
  const K = CFG.kart;

  // --- Physics: chassis + raycast vehicle ---
  const body = new CANNON.Body({ mass: K.mass, material: physMats.chassis });
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

  scene.add(group);

  // --- Visuals: wheels (positioned from the physics wheel transforms) ---
  const tireMat = lambert(0x1f1f24);
  const hubMat = lambert(0xdddddd);
  const wheelMeshes = layout.map((_, i) => {
    const width = i < 2 ? 0.34 : 0.44;
    const g = new THREE.Group();
    const tireGeo = new THREE.CylinderGeometry(K.wheelRadius, K.wheelRadius, width, 12);
    tireGeo.rotateZ(Math.PI / 2); // cylinder axis Y -> axle axis X
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, width + 0.02, 6);
    hubGeo.rotateZ(Math.PI / 2);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    g.add(tire, hub);
    scene.add(g);
    return g;
  });

  return { body, vehicle, group, wheelMeshes, sparks, sparkMat, flames };
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
};

const input = { left: false, right: false, gas: false, brake: false, reset: false };

const hud = {
  lap: $('lap'), time: $('time'), best: $('best'), speed: $('speed'),
  place: $('place'), placeNum: $('place-num'), placeSuffix: $('place-suffix'), placeOf: $('place-of'),
  countdown: $('countdown'), message: $('message'),
  driftFill: $('drift-fill'), overlay: $('overlay'),
  overlayText: $('overlay-text'), howto: $('howto'), startBtn: $('btn-start'),
};

const minimap = buildMinimap();

function buildMinimap() {
  const el = $('minimap');
  const ctx = el.getContext('2d');
  const path = new Path2D();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of track.samples) {
    minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
    minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z);
  }
  const map = { el, ctx, path, size: 0, scale: 1, ox: 0, oz: 0, minX, maxX, minZ, maxZ };

  map.layout = () => {
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
  map.project = (x, z) => [map.ox + (x - minX) * map.scale, map.oz + (z - minZ) * map.scale];
  map.layout();
  return map;
}

/* ==========================================================================
 * 2. CONTROL LISTENERS (multi-touch via Pointer Events)
 * ========================================================================== */
initControls();

function initControls() {
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
  bindHold($('btn-gas'), 'gas');
  bindHold($('btn-brake'), 'brake');

  $('btn-reset').addEventListener('pointerdown', (e) => { e.preventDefault(); input.reset = true; });

  hud.startBtn.addEventListener('click', startRace);

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
  window.addEventListener('keydown', (e) => { keys.add(e.code); updateKeys(); if (e.code === 'KeyR') input.reset = true; });
  window.addEventListener('keyup', (e) => { keys.delete(e.code); updateKeys(); });

  // --- Viewport ---
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 200));

  // --- Haptic bump on wall / kart hits ---
  kart.body.addEventListener('collide', (e) => {
    if (e.body.material !== physMats.wall && e.body.material !== physMats.chassis) return;
    const impact = Math.abs(e.contact.getImpactVelocityAlongNormal());
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
  const el = document.documentElement;
  if (el.requestFullscreen && !document.fullscreenElement) {
    el.requestFullscreen().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  }
  hud.overlay.classList.add('hidden');

  Object.assign(state, {
    phase: 'countdown', countdown: 3, raceTime: 0, lapStart: 0, finishedCount: 0, resultsShown: false,
  });
  placeOnGrid();
  camState.snap = true;
  showCountdown('3');
}

/** Staggered two-column grid behind the start line. The AIs line up in front; the player starts last. */
function placeOnGrid() {
  const G = CFG.grid;
  [...karts.slice(1), kart].forEach((k, slot) => {
    Object.assign(k, freshDriveState());
    const back = G.firstRow + Math.floor(slot / 2) * G.rowGap + (slot % 2) * G.rowGap * 0.5;
    const lane = slot % 2 ? -G.colOffset : G.colOffset;
    k.ai = k.isPlayer ? null : newAI(lane);
    k.topMult = 1;
    resetKart(k, track.N - Math.round(back / track.spacing), lane);
  });
  updatePlaces();
}

/** Puts a kart on the track at sample idx, `lane` metres left of the centre line, facing forward. */
function resetKart(k, idx, lane = 0) {
  const { samples, tangents, normals } = track;
  const s = samples[idx], t = tangents[idx], n = normals[idx];
  const body = k.body;
  body.position.set(s.x + n.x * lane, 1.2, s.z + n.z * lane);
  body.quaternion.setFromAxisAngle(AXIS_Y, Math.atan2(t.x, t.z));
  body.velocity.setZero();
  body.angularVelocity.setZero();
  Object.assign(k, { trackIdx: idx, flipTimer: 0, driftCharge: 0, boost: 0, steerSmooth: 0 });
}

function updateGameFlow(dt) {
  if (state.phase === 'countdown') {
    const prev = Math.ceil(state.countdown);
    state.countdown -= dt;
    const now = Math.ceil(state.countdown);
    if (now !== prev && now > 0) showCountdown(String(now));
    if (state.countdown <= 0) {
      state.phase = 'race';
      showCountdown('GO!');
    }
  }

  const racing = state.phase === 'race' || state.phase === 'finished';
  if (racing) state.raceTime += dt;
  for (const k of karts) updateKartProgress(k, dt, racing);
  updatePlaces();
  input.reset = false;
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
  k.progress = (k.lap - 1) * N + (k.halfway || idx < N / 2 ? idx : idx - N);

  // Auto-recover when flipped or beached (no wheel touching anything), on the reset button,
  // or when the AI gives up on getting unstuck
  const up = k.body.quaternion.vmult(LOCAL_UP, tmpVec);
  const grounded = k.vehicle.wheelInfos.some((w) => w.raycastResult.hasHit);
  k.flipTimer = up.y < 0.3 || !grounded ? k.flipTimer + dt : 0;
  const wantsReset = (k.isPlayer && input.reset) || k.flipTimer > 1.5 || k.ai?.resetNow;
  if (wantsReset && state.phase !== 'menu') {
    resetKart(k, k.trackIdx, k.ai ? k.ai.lane : 0);
    if (k.ai) Object.assign(k.ai, { resetNow: false, stuckT: 0, backT: 0, wrongT: 0, watchT: 0, resets: k.ai.resets + 1 });
    if (k.isPlayer) camState.snap = true;
  }
}

function completeLap(k) {
  k.halfway = false;
  if (k.isPlayer) {
    const lapTime = state.raceTime - state.lapStart;
    state.bestLap = Math.min(state.bestLap, lapTime);
    state.lapStart = state.raceTime;
    if (k.lap < CFG.laps) {
      showMessage(k.lap + 1 === CFG.laps ? 'FINAL LAP!' : `LAP ${k.lap + 1}  ${fmtTime(lapTime)}`);
    }
  }
  if (k.lap >= CFG.laps) finishKart(k);
  else k.lap++;
}

function finishKart(k) {
  k.finished = true;
  k.finishTime = state.raceTime;
  k.place = ++state.finishedCount;
  if (k.isPlayer) {
    state.phase = 'finished';
    k.ai = newAI(0); // the CPU drives the player's lap of honour
    showMessage(k.place === 1 ? 'YOU WIN!' : `FINISH! ${ordinal(k.place)}`);
    setTimeout(showResults, 1800);
  } else if (state.resultsShown) {
    showResults(); // refresh the table as the AIs come home
  }
}

/** Finished karts by finish time, then everyone else by distance raced. */
function updatePlaces() {
  const order = [...karts].sort((a, b) =>
    (b.finished - a.finished) || (a.finished ? a.finishTime - b.finishTime : b.progress - a.progress));
  order.forEach((k, i) => { k.place = i + 1; });
}

function showResults() {
  state.resultsShown = true;
  const rows = [...karts].sort((a, b) => a.place - b.place).map((k) => `
    <tr class="${k.isPlayer ? 'me' : ''}">
      <td>${ordinal(k.place)}</td>
      <td><i class="swatch" style="background:${k.color}"></i>${k.name}</td>
      <td>${k.finished ? fmtTime(k.finishTime) : 'racing&hellip;'}</td>
    </tr>`).join('');
  hud.overlayText.innerHTML =
    `<span class="result-head">${ordinal(kart.place)} place!</span> Best lap <b>${fmtTime(state.bestLap)}</b>` +
    `<table class="results">${rows}</table>`;
  hud.howto.hidden = true;
  hud.overlay.classList.add('results');
  hud.startBtn.textContent = 'RACE AGAIN';
  hud.overlay.classList.remove('hidden');
}

/** Nearest centre-line sample, searched locally around the previous index. */
function nearestTrackIndex(pos, hint) {
  const { N, samples } = track;
  let best = hint, bestD = Infinity;
  const scan = (from, to, step = 1) => {
    for (let k = from; k <= to; k += step) {
      const i = ((k % N) + N) % N;
      const s = samples[i];
      const d = (s.x - pos.x) ** 2 + (s.z - pos.z) ** 2;
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
 * lanes, dodges slower karts, makes the odd mistake, and is rubber-banded to the player.
 * ========================================================================== */
const rand = (a, b) => a + Math.random() * (b - a);
const aiFwd = new CANNON.Vec3();

function newAI(lane) {
  const A = CFG.ai;
  return {
    skill: rand(...A.skill), grip: rand(...A.cornerGrip),
    lane, laneTarget: lane, laneTimer: rand(2, 5),
    mistake: null, mistakeTimer: rand(...A.mistakeEvery),
    startDelay: rand(0.05, 0.4), // reaction time at GO
    stuckT: 0, backT: 0, stuckCount: 0, wrongT: 0, resetNow: false, resets: 0,
    watchT: 0, watchProgress: -Infinity,
  };
}

function updateAI(k, dt, canDrive) {
  const A = CFG.ai, K = CFG.kart, ai = k.ai, ctl = k.ctl, b = k.body;
  const { N, samples, normals, tangents, spacing, radius } = track;
  ctl.steer = 0; ctl.gas = false; ctl.brake = false;
  if (!canDrive) return;
  if (ai.startDelay > 0) { ai.startDelay -= dt; return; }

  const idx = k.trackIdx;
  const n = normals[idx];
  const fwd = b.quaternion.vmult(LOCAL_FWD, aiFwd);
  const myLane = (b.position.x - samples[idx].x) * n.x + (b.position.z - samples[idx].z) * n.z;

  // --- Racing lane: wander now and then; swing out round a slower kart just ahead
  ai.laneTimer -= dt;
  if (ai.laneTimer <= 0) {
    ai.laneTarget = rand(-A.laneRange, A.laneRange);
    ai.laneTimer = rand(2.5, 6);
  }
  let laneGoal = ai.laneTarget;
  let blocked = false;
  for (const o of karts) {
    if (o === k) continue;
    const dx = o.body.position.x - b.position.x, dz = o.body.position.z - b.position.z;
    const ahead = dx * fwd.x + dz * fwd.z;
    const side = dx * n.x + dz * n.z; // + = the other kart is to our left
    if (ahead > 0 && ahead < 10 && Math.abs(side) < 2.4 && o.speed < k.speed + 1) {
      const dir = myLane + side > 0 ? -1 : 1; // pass on the roomier side of them
      laneGoal = clamp(myLane + side + dir * 3, -5.5, 5.5);
      if (ahead < 5 && Math.abs(side) < 1.8) blocked = true; // right on their bumper: ease off
    }
  }
  ai.lane += clamp(laneGoal - ai.lane, -3 * dt, 3 * dt);

  // --- Steering: pure pursuit toward a look-ahead point on the lane
  const speedRatio = clamp(k.speed / K.maxSpeed, 0, 1);
  const j = (idx + Math.round(lerp(A.lookAhead[0], A.lookAhead[1], speedRatio) / spacing)) % N;
  const tx = samples[j].x + normals[j].x * ai.lane;
  const tz = samples[j].z + normals[j].z * ai.lane;
  const d = wrapAngle(Math.atan2(tx - b.position.x, tz - b.position.z) - Math.atan2(fwd.x, fwd.z));
  let steer = clamp(-d * A.steerGain, -1, 1);

  // --- Speed: own pace x rubber band, capped so it can still brake for every corner ahead
  const rubber = state.phase === 'race' && !k.finished
    ? clamp(1 - (k.progress - kart.progress) * spacing * A.rubberBand, A.rubberMin, A.rubberMax)
    : 1;
  let target = K.maxSpeed * (k.finished ? A.finishedPace : ai.skill * rubber);
  const brakeDecel = 10;
  for (let s = 2; s * spacing < 45; s += 2) {
    const vCorner = Math.sqrt(ai.grip * radius[(idx + s) % N]);
    target = Math.min(target, Math.sqrt(vCorner * vCorner + 2 * brakeDecel * s * spacing));
  }
  k.topMult = target / K.maxSpeed;
  ctl.gas = !blocked;          // the engine cuts out above target on its own (driveKart)
  ctl.brake = k.speed > target + 5;

  // --- Mistakes: a twitch of the wheel, or a lift off the gas
  if (!k.finished) {
    ai.mistakeTimer -= dt;
    if (ai.mistakeTimer <= 0) {
      ai.mistakeTimer = rand(...A.mistakeEvery);
      ai.mistake = Math.random() < 0.5
        ? { t: rand(0.25, 0.5), steer: Math.random() < 0.5 ? -0.8 : 0.8 }
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
    if (++ai.stuckCount >= 3) { ai.resetNow = true; ai.stuckCount = 0; }
  }
  // Watchdog for anything the above misses (wedged on a wall, beached at an angle...)
  ai.watchT += dt;
  if (ai.watchT > 4) {
    if (!k.finished && k.progress - ai.watchProgress < 10) ai.resetNow = true;
    ai.watchT = 0;
    ai.watchProgress = k.progress;
  }
  const t = tangents[idx];
  ai.wrongT = fwd.x * t.x + fwd.z * t.z < -0.3 ? ai.wrongT + dt : 0;
  if (ai.wrongT > 3) ai.resetNow = true;

  ctl.steer = steer;
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
      k.ctl.steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      k.ctl.gas = input.gas;
      k.ctl.brake = input.brake;
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
  const rearGrip = lerp(K.rearGrip, K.driftGrip, driftAmt);
  vehicle.wheelInfos[2].frictionSlip = rearGrip;
  vehicle.wheelInfos[3].frictionSlip = rearGrip;
  if (driftAmt > 0) body.angularVelocity.y -= k.steerSmooth * driftAmt * K.driftYawAssist * dt;

  // --- Mini-turbo: drift long enough, then release
  const drifting = driftAmt > 0.55;
  if (drifting) {
    k.driftCharge += dt;
  } else {
    if (k.driftCharge > K.miniTurboTime) {
      k.boost = K.boostDuration;
      if (k.isPlayer) showMessage('BOOST!');
    }
    k.driftCharge = 0;
  }
  k.drifting = drifting;
  k.boost = Math.max(0, k.boost - dt);
  const boosting = k.boost > 0;

  // --- Engine & brakes
  let engine = 0, brake = 0;
  if (canDrive) {
    const top = K.maxSpeed * k.topMult + (boosting ? K.boostSpeed : 0);
    if (ctl.brake) {
      if (speed > 1) brake = K.brakeForce;
      else if (speed > -K.maxReverse) engine = -K.reverseForce;
    } else if (ctl.gas || boosting) {
      if (speed < top) engine = K.engineForce * (boosting ? K.boostMult : 1);
    } else {
      brake = K.coastBrake;
    }
  } else {
    brake = K.brakeForce; // hold still during menu / countdown
  }
  // cannon-es pushes along -forward for positive force with this axle setup, hence the negation
  vehicle.applyEngineForce(-engine, 2);
  vehicle.applyEngineForce(-engine, 3);
  for (let i = 0; i < 4; i++) vehicle.setBrake(brake, i);

  k.steerAngle = steerAngle;
}

/**
 * Stability assist, run on every kart before every physics sub-step: compare the kart's yaw rate
 * with what the front wheels ask for (bicycle model, capped by available grip) and bleed off any
 * excess, so the tail can't swing round into a spin. Drifting allows some extra rotation.
 */
function applyStabilityAssist(k) {
  const K = CFG.kart;
  const { body, vehicle } = k;
  body.angularVelocity.y = clamp(body.angularVelocity.y, -K.maxYawRate, K.maxYawRate);

  const speed = body.velocity.dot(body.quaternion.vmult(LOCAL_FWD, tmpFwd));
  if (speed < 3 || !vehicle.wheelInfos.every((w) => w.raycastResult.hasHit)) return;

  const gripLimit = K.maxLateralAccel / speed;
  const targetYaw = clamp((speed * Math.tan(k.steerAngle)) / K.wheelBase, -gripLimit, gripLimit);
  const slack = K.yawSlack + K.steerYawSlack * Math.abs(k.steerSmooth) + K.driftYawSlack * k.driftAmt;
  const yaw = body.angularVelocity.y;
  const excess = yaw - clamp(yaw, targetYaw - slack, targetYaw + slack);
  body.angularVelocity.y -= excess * 0.5;
}

/* ==========================================================================
 * 5. RENDERING LOOP (sync meshes <- bodies, camera, effects, HUD)
 * ========================================================================== */
const camState = { yaw: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), snap: true };
const desiredCam = new THREE.Vector3();

function syncMeshes() {
  for (const { body, vehicle, group, wheelMeshes } of karts) {
    group.position.copy(body.position);
    group.quaternion.copy(body.quaternion);
    for (let i = 0; i < vehicle.wheelInfos.length; i++) {
      vehicle.updateWheelTransform(i);
      const t = vehicle.wheelInfos[i].worldTransform;
      wheelMeshes[i].position.copy(t.position);
      wheelMeshes[i].quaternion.copy(t.quaternion);
    }
  }
}

function updateCamera(dt) {
  const C = CFG.camera;
  const b = kart.body;
  const fwd = b.quaternion.vmult(LOCAL_FWD, tmpVec);
  const yaw = Math.atan2(fwd.x, fwd.z);
  const speedRatio = clamp(Math.abs(kart.speed) / CFG.kart.maxSpeed, 0, 1);

  if (camState.snap) {
    camState.yaw = yaw;
  } else {
    camState.yaw += wrapAngle(yaw - camState.yaw) * (1 - Math.exp(-dt * C.yawLag));
  }

  const dist = C.distance + speedRatio * 1.5;
  desiredCam.set(
    b.position.x - Math.sin(camState.yaw) * dist,
    b.position.y + C.height,
    b.position.z - Math.cos(camState.yaw) * dist,
  );

  if (camState.snap) {
    camState.pos.copy(desiredCam);
    camState.snap = false;
  } else {
    camState.pos.lerp(desiredCam, 1 - Math.exp(-dt * C.posLag));
  }
  camState.pos.y = Math.max(camState.pos.y, 1.0);
  camera.position.copy(camState.pos);

  camState.look.set(
    b.position.x + Math.sin(camState.yaw) * C.lookAhead,
    b.position.y + 1.0,
    b.position.z + Math.cos(camState.yaw) * C.lookAhead,
  );
  camera.lookAt(camState.look);

  // Speed-based FOV kick
  const targetFov = 66 + speedRatio * 8 + (kart.boost > 0 ? 8 : 0);
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-dt * 4));
    camera.updateProjectionMatrix();
  }

  // Shadow camera follows the kart
  sun.target.position.copy(b.position);
  sun.position.copy(b.position).add(SUN_OFFSET);
}

function updateEffects() {
  const driving = state.phase === 'race' || state.phase === 'finished';
  for (const k of karts) {
    const charged = k.driftCharge > CFG.kart.miniTurboTime;
    k.sparkMat.color.setHex(charged ? 0xffa21f : 0x5cc8ff);
    for (const sp of k.sparks) {
      sp.visible = k.drifting;
      if (sp.visible) sp.scale.setScalar(0.6 + Math.random() * 0.8);
    }
    const boosting = k.boost > 0;
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
  const key = `${kmh}|${lapTxt}|${timeTxt}|${bestTxt}|${showPlace && kart.place}`;
  if (key !== lastHud) {
    lastHud = key;
    hud.speed.textContent = kmh;
    hud.lap.textContent = lapTxt;
    hud.time.textContent = timeTxt;
    hud.best.textContent = bestTxt;
    hud.place.hidden = !showPlace;
    hud.place.classList.toggle('first', kart.place === 1);
    hud.placeNum.textContent = kart.place;
    hud.placeSuffix.textContent = ordinal(kart.place).slice(-2);
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

function render(dt) {
  syncMeshes();
  updateCamera(dt);
  updateEffects();
  updateHUD();
  renderer.render(scene, camera);
}

// ---------- Main loop ----------
let lastTime = performance.now();

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  stepPhysics(dt);      // 4. physics (AI decides its controls here too)
  updateGameFlow(dt);   // 3. laps / positions / countdown / recovery
  render(dt);           // 5. sync + draw
}

document.addEventListener('visibilitychange', () => { lastTime = performance.now(); });

/* ==========================================================================
 * UI helpers
 * ========================================================================== */
function showCountdown(text) { retrigger(hud.countdown, text); }
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
onResize();
placeOnGrid();

// PWA: offline cache (service workers need a secure context: https or localhost)
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
requestAnimationFrame(loop);
