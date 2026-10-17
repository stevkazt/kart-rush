// Drivers: the character riding in each kart, one builder per driver name, plus their 2D art.
//
// DRIVERS[name] = {
//   build(r, y0)      -> joints + parts on a bone rig (see rig()); returns the animation hook update(dt, s)
//   avatar(r)         -> head-and-shoulders SVG (driver tile, CHOOSE YOUR DRIVER)
//   kartArt(r)        -> the driver's part of the kart side view (paint tile, PAINT YOUR KART)
// }
// Drivers without an entry use the helmeted fallback. Each rider is baked into ONE SkinnedMesh with rigid
// bones (every part follows exactly one joint), so a fully animated character is still one draw call
// (+1 if it has glossy parts, +1 if it has glowing ones) instead of one per part (gotcha: ~28 meshes per kart
// made the phone stutter).
import * as THREE from 'three';

export const PAINT_ROLES = ['body', 'accent', 'driver', 'helmet', 'visor']; // what paintKart recolours

const C = { orange: 0xf97316, cream: 0xfffbeb, gold: 0xfacc15, jacket: 0xf8fafc, red: 0xef4444, redDark: 0xc0262d, ink: 0x1d1d22, strap: 0x262a36 };
const css = (n) => '#' + n.toString(16).padStart(6, '0');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

/** A bone rig to build a character on: joint() adds a bone, part() a mesh that moves rigidly with it.
 * color = a hex number, a paint role (PAINT_ROLES) or colorAt(x, y, z) -> hex in the part's own space (for
 * gradients); gloss parts get the shiny (metallic) material, glow parts an unlit one (eyes, emblems) whose
 * brightness the animation can pulse through R.glow (a material, set once baked; its colour multiplies). */
function rig() {
  const root = new THREE.Bone(), bones = [root];
  const joint = (parent, x, y, z) => {
    const b = new THREE.Bone();
    b.position.set(x, y, z);
    parent.add(b);
    bones.push(b);
    return b;
  };
  const part = (parent, geo, color, x = 0, y = 0, z = 0, { rot, gloss = false, glow = false } = {}) => {
    const m = new THREE.Mesh(geo);
    m.userData = { color, gloss, glow, kind: glow ? 2 : gloss ? 1 : 0 };
    m.position.set(x, y, z);
    if (rot) m.rotation.set(...rot);
    parent.add(m);
    return m;
  };
  return { root, bones, joint, part };
}

/** Bakes a rig into one vertex-coloured SkinnedMesh (+ gloss and glow groups). The rig must be at rest. */
function bakeRig({ root, bones }, colors, smooth = false, gloss = { metalness: 0.6, roughness: 0.2 }) {
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse((o) => { if (o.isMesh) parts.push(o); });
  parts.sort((a, b) => a.userData.kind - b.userData.kind); // matte, then gloss, then glow
  const pos = [], nor = [], col = [], skinI = [], skinW = [], paint = [], c = new THREE.Color();
  const starts = [0, -1, -1]; // first vertex of each kind
  for (const m of parts) {
    if (starts[m.userData.kind] < 0) starts[m.userData.kind] = pos.length / 3;
    let b = m.parent;
    while (!b.isBone) b = b.parent;
    const bi = bones.indexOf(b);
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    const flat = g.index ? g.toNonIndexed() : g;
    const colorAt = typeof m.userData.color === 'function' ? m.userData.color : null;
    const local = colorAt && (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry).attributes.position;
    const role = colorAt ? -1 : PAINT_ROLES.indexOf(m.userData.color);
    if (!colorAt) c.setHex(role < 0 ? m.userData.color : colors[role]);
    pos.push(...flat.attributes.position.array);
    nor.push(...flat.attributes.normal.array);
    for (let i = 0; i < flat.attributes.position.count; i++) {
      if (colorAt) c.setHex(colorAt(local.getX(i), local.getY(i), local.getZ(i)));
      col.push(c.r, c.g, c.b);
      skinI.push(bi, 0, 0, 0);
      skinW.push(1, 0, 0, 0);
      paint.push(role);
    }
    m.removeFromParent();
    m.geometry.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinI, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinW, 4));
  geo.userData.paint = paint; // per vertex: index into PAINT_ROLES, -1 = fixed colour (see paintKart)
  // smooth: toy-like Standard material with smooth normals (the character standard); else the old faceted look
  const matte = smooth
    ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 })
    : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mats = [matte];
  let glow = null;
  const count = pos.length / 3, kinds = [0, 1, 2].filter((k) => starts[k] >= 0);
  for (const k of kinds) {
    if (k === 1) {
      mats.push(smooth
        ? new THREE.MeshStandardMaterial({ vertexColors: true, ...gloss, envMap: skyEnv(), envMapIntensity: 1.2 })
        : new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 80, specular: 0xfff1b8, emissive: 0x3a2a00 }));
    } else if (k === 2) {
      glow = new THREE.MeshBasicMaterial({ vertexColors: true }); // unlit: reads as lit from inside
      mats.push(glow);
    }
  }
  if (mats.length > 1) {
    const ends = kinds.map((k, i) => (i + 1 < kinds.length ? starts[kinds[i + 1]] : count));
    kinds.forEach((k, i) => geo.addGroup(starts[k], ends[i] - starts[k], i));
  }
  const mesh = new THREE.SkinnedMesh(geo, mats.length > 1 ? mats : matte);
  mesh.castShadow = true;
  mesh.add(root);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  return { mesh, mats, matte, glow };
}

let skyTex = null;
/** A tiny painted sky / horizon / ground panorama for metallic parts to reflect (no files; shared). */
function skyEnv() {
  if (skyTex) return skyTex;
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 32;
  const g = cv.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 32);
  [[0, '#5aa0ff'], [0.42, '#d8ecff'], [0.5, '#ffffff'], [0.56, '#b9a57e'], [1, '#4b4436']].forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 32);
  skyTex = new THREE.CanvasTexture(cv);
  skyTex.mapping = THREE.EquirectangularReflectionMapping;
  skyTex.colorSpace = THREE.SRGBColorSpace;
  return skyTex;
}

/**
 * The rider for driver r, in kart-local space (kart faces +Z, left = +X, y0 = chassis offset).
 * colors = [body, accent, suit, helmet, visor] (paint roles). Returns { name, mesh, mats, matte, update, dispose };
 * update(dt, s) runs every frame with s = { speed 0..1, steer -1..1 (+ = right), drift 0..1, boost 0/1, bump 0/1,
 * fire 0/1 (used an item in the last 0.4 s) }.
 */
export function buildRider(r, colors, y0) {
  const R = rig();
  const spec = DRIVERS[r.name] ?? FALLBACK;
  const update = spec.build(R, y0) ?? null;
  const baked = bakeRig(R, colors, !!spec.smooth, spec.gloss);
  R.glow = baked.glow; // for the animation hook (pulses)
  return {
    name: r.name, ...baked, update,
    dispose() { baked.mesh.geometry.dispose(); baked.mats.forEach((m) => m.dispose()); baked.mesh.skeleton.dispose(); },
  };
}

/** 2D art hooks: null = use the generic (helmeted) art. */
export const driverAvatar = (r) => DRIVERS[r.name]?.avatar?.(r) ?? null;
export const driverKartArt = (r) => DRIVERS[r.name]?.kartArt?.(r) ?? null;

// ---------- Fallback: the original helmeted driver (paint roles: suit, helmet, visor, body stripe) ----------
const FALLBACK = {
  build({ root, joint, part }, y0) {
    const torso = joint(root, 0, y0 + 0.38, -0.3);
    part(torso, new THREE.CylinderGeometry(0.33, 0.4, 0.6, 8), 'driver');
    const head = joint(torso, 0, 0.54, 0);
    part(head, new THREE.IcosahedronGeometry(0.33, 1), 'helmet');
    part(head, new THREE.BoxGeometry(0.44, 0.15, 0.1), 'visor', 0, 0, 0.29);
    part(head, new THREE.BoxGeometry(0.7, 0.07, 0.07), 'body', 0, 0.17, 0); // stripe
  },
};

// ---------- Nova: the star fox ----------
// The standard for characters (user, 2026-10-17): smooth and toy-like, not faceted. Smooth normals, Standard
// material (smooth: true), 16-32 segments, continuous curves (tubes / lathes) instead of stacked balls, and
// colour gradients baked per vertex (colorAt) instead of separate parts. Driver scale 1.25 (arcade proportions).
// No helmet: orange fox head, big ears with cream insides, cream cheek tufts + muzzle, black nose button, gold
// visor on a dark strap. White cropped jacket, red shoulder stripes, orange paws on the wheel, static red scarf
// collar with short wind-swept ends, one continuous S-curved tail (orange into a cream tip) above the spoiler.

const NOVA_SCALE = 1.25;
const WHEEL_GRIP = [0.17, 0.5, 0.17]; // where the paws hold the steering wheel (x either side, y above y0, z)

/** Shrinks a geometry's cross-section along +Z: scale x/y by lerp(1, to, t) from z0 to z1. */
function taperZ(g, z0, z1, to) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = lerp(1, to, clamp((p.getZ(i) - z0) / (z1 - z0), 0, 1));
    p.setXY(i, p.getX(i) * k, p.getY(i) * k);
  }
  g.computeVertexNormals();
  return g;
}
/** A tube along a smooth curve through pts, radius radius(u, v) for u 0..1 along it (v 0..1 round it). */
export function sweep(pts, radius, tubular = 40, radial = 16) {
  const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
  const g = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const p = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    curve.getPointAt(i / tubular, c);
    for (let j = 0; j <= radial; j++) {
      const n = i * (radial + 1) + j, r = radius(i / tubular, j / radial); // v = round the tube (fur bumps)
      v.fromBufferAttribute(p, n).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(n, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}
/** A smooth teardrop pointing +Y from the origin (lathe). */
function teardrop(len, width, segs = 16) {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(width * Math.sin(Math.PI * t) ** 0.8 * (1 - t) ** 0.35 + 1e-4, t * len));
  }
  return new THREE.LatheGeometry(pts, segs);
}
/** A capsule from a to b (arms). */
function capsuleBetween(r, a, b, radial = 16) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CapsuleGeometry(r, len, 6, radial);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
/** Smooth fox ear pointing +Y, flattened front to back. */
function earLobe(r, h, depth, radial = 24) {
  const g = new THREE.ConeGeometry(r, h, radial, 2);
  g.translate(0, h / 2, 0);
  g.scale(1, 1, depth);
  g.computeVertexNormals();
  return g;
}
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), clamp(t, 0, 1)).getHex();
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const NOVA = {
  smooth: true,
  build({ root, joint, part }, y0) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const S = NOVA_SCALE;

    // Torso (hip pivot, scaled up): cropped jacket over cream belly fur, shoulders + red stripes, arms to the wheel
    const torso = joint(root, 0, y0 + 0.12, -0.27);
    torso.scale.setScalar(S);
    const body = new THREE.CapsuleGeometry(0.24, 0.14, 4, 16);
    body.scale(1.05, 1, 0.82);
    part(torso, body, (x, y) => mix(C.cream, C.jacket, smoothstep(-0.2, -0.15, y)), 0, 0.27, 0);
    part(torso, new THREE.CapsuleGeometry(0.012, 0.22, 2, 6), 0x9aa3b2, 0, 0.31, 0.2);  // zip
    const toLocal = (x, y, z) => V(x, y0 + y - torso.position.y, z - torso.position.z).divideScalar(S);
    for (const sx of [1, -1]) {
      part(torso, new THREE.SphereGeometry(0.095, 12, 8), C.jacket, sx * 0.25, 0.45, 0);  // shoulder
      const stripe = new THREE.CapsuleGeometry(0.024, 0.18, 3, 8);
      stripe.rotateX(Math.PI / 2);
      part(torso, stripe, C.red, sx * 0.255, 0.535, 0);
      const sh = V(sx * 0.26, 0.44, 0.03), hand = toLocal(sx * WHEEL_GRIP[0], WHEEL_GRIP[1], WHEEL_GRIP[2]);
      part(torso, capsuleBetween(0.062, sh, hand, 10), C.jacket);                             // sleeve
      const cuff = new THREE.TorusGeometry(0.062, 0.022, 5, 12);
      cuff.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), hand.clone().sub(sh).normalize()));
      const at = sh.clone().lerp(hand, 0.8);
      part(torso, cuff, C.red, at.x, at.y, at.z);                                        // red cuff
      part(torso, new THREE.SphereGeometry(0.075, 10, 8), C.orange, hand.x, hand.y, hand.z); // paw on the wheel
    }
    part(torso, new THREE.CylinderGeometry(0.11, 0.13, 0.16, 16, 1, true), C.orange, 0, 0.6, 0);  // neck

    // Scarf: static, high on the neck, short wind-swept ends over the shoulders (no animation: it clipped)
    const collar = new THREE.TorusGeometry(0.165, 0.065, 8, 20);
    collar.rotateX(Math.PI / 2 - 0.12); // a touch higher at the back
    part(torso, collar, C.red, 0, 0.6, 0);
    part(torso, new THREE.SphereGeometry(0.07, 12, 9), C.redDark, 0, 0.62, -0.19);     // knot
    for (const sx of [1, -1]) {
      const end = sweep([[0, 0, 0], [sx * 0.09, -0.01, -0.07], [sx * 0.2, -0.04, -0.12], [sx * 0.3, -0.07, -0.13]],
        (u) => lerp(0.06, 0.018, u), 8, 6);
      end.scale(1, 0.45, 1);
      part(torso, end, (x) => mix(C.red, C.redDark, Math.abs(x) / 0.3), sx * 0.02, 0.62, -0.18);
    }

    // Head (slightly bigger again): wide oval skull, cream mask + teardrop cheek tufts, tapered muzzle, visor
    const head = joint(torso, 0, 0.64, 0);
    head.scale.setScalar(1.06);
    const skull = new THREE.SphereGeometry(0.28, 24, 16);
    skull.scale(1.12, 0.95, 1);
    part(head, skull, C.orange, 0, 0.2, 0);
    const mask = new THREE.SphereGeometry(0.2, 14, 10);
    mask.scale(1.18, 0.62, 0.85);
    part(head, mask, C.cream, 0, 0.07, 0.11);
    for (const sx of [1, -1]) {
      for (const [len, w, x, y, a] of [[0.24, 0.075, 0.25, 0.08, 0.25], [0.16, 0.05, 0.24, 0.03, 0.5]]) {
        const tuft = teardrop(len, w, 8);
        tuft.scale(1, 1, 0.6);
        part(head, tuft, C.cream, sx * x, y, 0.02, { rot: [0, 0, -sx * (Math.PI / 2 + a)] });
      }
    }
    const muzzle = new THREE.CapsuleGeometry(0.105, 0.17, 3, 16);
    muzzle.rotateX(Math.PI / 2);
    taperZ(muzzle, -0.1, 0.2, 0.5);
    muzzle.scale(1, 0.8, 1);
    part(head, muzzle, (x, y) => mix(C.cream, C.orange, smoothstep(-0.03, 0.02, y)), 0, 0.12, 0.27);
    const nose = new THREE.SphereGeometry(0.048, 10, 6);
    nose.scale(1.2, 0.9, 1);
    part(head, nose, C.ink, 0, 0.135, 0.45);
    const visor = new THREE.CylinderGeometry(0.29, 0.3, 0.12, 32, 1, true, -1.65, 3.3);
    visor.scale(1.13, 1, 1.03);
    part(head, visor, C.gold, 0, 0.26, 0.01, { gloss: true });
    const strap = new THREE.CylinderGeometry(0.284, 0.29, 0.06, 20, 1, true, 1.6, Math.PI * 2 - 3.2);
    strap.scale(1.13, 1, 1.03);
    part(head, strap, C.strap, 0, 0.26, 0.01);
    const ears = [1, -1].map((sx) => {
      const ear = joint(head, sx * 0.16, 0.38, -0.03);
      part(ear, earLobe(0.14, 0.5, 0.45, 16), C.orange);
      part(ear, earLobe(0.095, 0.36, 0.28, 12), (x, y) => mix(0xf3c9a4, C.cream, y / 0.25), 0, 0.03, 0.035); // inner ear
      return { bone: ear, sx, twitch: 0, next: 1 + Math.random() * 3 };
    });

    // Tail: one continuous S-curve from the gap above the seat back, rising clear over the spoiler
    const tail = joint(root, 0, y0 + 0.66, -0.62);
    tail.scale.setScalar(S);
    // back over the deck first, then up: the tip stays under head height so the chase camera still sees her
    const tailPts = [[0, 0, 0], [0, 0.04, -0.2], [0, 0.14, -0.42], [0, 0.3, -0.6], [0, 0.42, -0.76], [0, 0.46, -0.92]];
    const tailGeo = sweep(tailPts, (u) => 0.135 * Math.sin(Math.PI * u ** 0.7) + 0.045 * (1 - u) + 0.003, 28, 12);
    // orange body into a cream tip (the tip is the furthest back)
    part(tail, tailGeo, (x, y, z) => mix(C.orange, C.cream, smoothstep(0.7, 0.78, -z)));

    // ---- Animation hook ----
    const st = { lean: 0, fold: 0, sway: 0 };
    return (dt, s) => {
      const ease = (rate) => 1 - Math.exp(-dt * rate);
      const speed = clamp(Math.abs(s.speed), 0, 1.3);
      st.lean = lerp(st.lean, s.steer * (0.7 + 0.5 * s.drift), ease(6));
      st.fold = lerp(st.fold, clamp(speed * 1.1 + s.boost * 0.5, 0, 1), ease(5));
      st.sway = lerp(st.sway, -st.lean, ease(3)); // the tail lags behind the lean: counterbalance

      // Lean into the turn (positive rotation.z tips her top toward -X = right); head turns to look into it
      torso.rotation.z = st.lean * 0.12;
      head.rotation.z = st.lean * 0.08;
      head.rotation.y = -st.lean * 0.2;
      head.rotation.x = -0.06 * st.fold; // tucks in at speed

      // Ears: random little twitches when stopped, fold back with speed / boost
      const idle = 1 - clamp(speed * 5, 0, 1);
      for (const e of ears) {
        e.next -= dt;
        if (e.next <= 0) { e.twitch = 1; e.next = 1.2 + Math.random() * 3.5; }
        e.twitch = Math.max(0, e.twitch - dt * 5);
        const tw = Math.sin(e.twitch * Math.PI) * idle;
        e.bone.rotation.x = -0.15 - st.fold * 0.95 + tw * 0.25;
        e.bone.rotation.z = -e.sx * (0.42 - st.fold * 0.18 + tw * 0.22);
      }

      // Tail: a subtle sway against the lean, a little lower at speed
      tail.rotation.y = st.sway * 0.22;
      tail.rotation.z = -st.sway * 0.06;
      tail.rotation.x = -0.12 * st.fold;
    };
  },
  avatar() {
    const [o, cr, g, j, rd, rk, ink] = [C.orange, C.cream, C.gold, C.jacket, C.red, C.redDark, C.ink].map(css);
    return `<svg class="driver-art" viewBox="0 0 48 48" aria-hidden="true">
    <defs><linearGradient id="nova-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a8"/><stop offset="0.45" stop-color="${g}"/><stop offset="1" stop-color="#c58a0a"/></linearGradient></defs>
    <path d="M10 47 C2 42 0 30 4 21 C6 17 9 15 11.5 15 C9.5 20 9.5 26 12 32 C13.5 37 14.5 42 14.5 47 Z" fill="${o}"/>
    <path d="M4 21 C6 17 9 15 11.5 15 C10.5 18 10 21 10.2 24 C8.2 22.4 6.2 21.6 4 21 Z" fill="${cr}"/>
    <path d="M5 48 C5 39 12 35 24 35 C36 35 43 39 43 48 Z" fill="${j}" stroke="#fff" stroke-opacity="0.3"/>
    <path d="M8.5 41 Q11 37.5 16 36.3 L17 38.6 Q13 39.4 10.8 43 Z M39.5 41 Q37 37.5 32 36.3 L31 38.6 Q35 39.4 37.2 43 Z" fill="${rd}"/>
    <path d="M24 39 V48" stroke="#9aa3b2" stroke-width="1"/>
    <path d="M30 35 Q37 33.5 41 30.5 Q44 29 47.5 30.5 Q43.5 32 41.5 34.3 Q37 37.5 31 38.5 Z" fill="${rd}"/>
    <path d="M31 37.2 Q38 37.2 42 38.4 Q45 39.4 47.5 42 Q43.5 41.4 40.5 41.2 Q36 40.7 31 40 Z" fill="${rk}"/>
    <path d="M15 33 Q24 38.5 33 33 L33.5 37 Q24 42 14.5 37 Z" fill="${rd}"/>
    <path d="M14.5 15 L9.5 0.8 L22 11 Z" fill="${o}"/><path d="M15.8 13.6 L11.6 4.4 L19.8 11.4 Z" fill="${cr}"/>
    <path d="M33.5 15 L38.5 0.8 L26 11 Z" fill="${o}"/><path d="M32.2 13.6 L36.4 4.4 L28.2 11.4 Z" fill="${cr}"/>
    <ellipse cx="24" cy="21.5" rx="11.5" ry="10.5" fill="${o}"/>
    <path d="M14 23.5 L4.5 27.5 L9.8 29 L6.5 32.5 L16.5 31 Z M34 23.5 L43.5 27.5 L38.2 29 L41.5 32.5 L31.5 31 Z" fill="${cr}"/>
    <path d="M13.5 23 Q14.5 32 24 34 Q33.5 32 34.5 23 Q30 27.5 24 27.5 Q18 27.5 13.5 23 Z" fill="${cr}"/>
    <path d="M20.5 22 Q24 21 27.5 22 L25.6 29 Q24 30 22.4 29 Z" fill="${o}"/>
    <ellipse cx="24" cy="29.6" rx="2.5" ry="1.7" fill="${ink}"/>
    <path d="M24 31.3 V32.4 M22 33 Q24 34.2 26 33" fill="none" stroke="${ink}" stroke-width="0.8" stroke-linecap="round"/>
    <rect x="10.3" y="18" width="3" height="4" rx="1" fill="#262a36"/><rect x="34.7" y="18" width="3" height="4" rx="1" fill="#262a36"/>
    <rect x="12" y="16.6" width="24" height="6.6" rx="3.3" fill="url(#nova-gold)" stroke="#fff" stroke-opacity="0.45" stroke-width="0.6"/>
    <path d="M14.8 18.6 H22.5" stroke="#fff" stroke-opacity="0.75" stroke-width="1.3" stroke-linecap="round"/>
  </svg>`;
  },

  kartArt() {
    const [o, cr, g, j, rd, rk, ink] = [C.orange, C.cream, C.gold, C.jacket, C.red, C.redDark, C.ink].map(css);
    return `<path d="M29 21.5 Q18 22.5 12.5 16 Q9.5 11 11 5 Q14 9.5 18.5 11.6 Q23.5 15 29.5 17 Z" fill="${o}"/>
    <path d="M11 5 Q14 9.5 18.5 11.6 Q15 12.2 12.8 13.6 Q10 9.8 11 5 Z" fill="${cr}"/>
    <rect x="28" y="14" width="11" height="9" rx="3" fill="${j}"/><rect x="28.5" y="14.2" width="6" height="1.6" rx="0.8" fill="${rd}"/>
    <path d="M33.5 16.5 L42 19" stroke="${j}" stroke-width="2.6" stroke-linecap="round"/><circle cx="42.5" cy="19.2" r="1.6" fill="${o}"/>
    <path d="M31 14.4 Q25 11.8 19 13.4 L20 15.2 Q25 14.6 31 16.2 Z" fill="${rd}"/>
    <path d="M31 15.6 Q26 16.2 21 18.6 L22.4 19.6 Q26.4 17.6 31.6 17.2 Z" fill="${rk}"/>
    <rect x="30.5" y="13.4" width="7" height="2.6" rx="1.2" fill="${rd}"/>
    <path d="M33 6.5 L36.4 6 L36.6 0.4 Z" fill="${o}" opacity="0.85"/>
    <path d="M30.6 7.4 L34.2 6.2 L29.6 0.3 Z" fill="${o}"/><path d="M31.2 6.8 L33.2 6.2 L30.4 2.4 Z" fill="${cr}"/>
    <circle cx="34" cy="10" r="5" fill="${o}"/>
    <path d="M33 12.6 L28.4 15.2 L33.6 14.8 Z" fill="${cr}"/>
    <path d="M37.8 9.6 L44.6 11.8 L38.4 13.8 Z" fill="${o}"/><path d="M38.4 12.3 L44 12.1 L38.4 14 Z" fill="${cr}"/>
    <circle cx="44.6" cy="11.8" r="0.95" fill="${ink}"/>
    <path d="M29.2 8.6 H34" stroke="#262a36" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="33.6" y="7.3" width="6" height="2.7" rx="1.3" fill="${g}" stroke="#fff" stroke-opacity="0.5" stroke-width="0.4"/>`;
  },
};

// ---------- Luna: the cosmic space yeti (the defender) ----------
// Same smooth standard as Nova. A heavyweight: torso + shoulder fur ~30% wider than Nova, so the white shoulder
// tufts overflow the seat back. No helmet: pear-shaped lavender head, white ruff around neck and cheeks, heavy
// white unibrow over a dark indigo face, glowing cyan eyes, two little tusks, glossy icy-cyan ram horns curving
// out, back and up (her silhouette from behind). Thick arms, indigo paws on the wheel, and a rounded shield pack
// on her back (above the seat back) with a glowing cyan crescent. Glow parts pulse via R.glow.
const L = {
  fur: 0xc4b5fd, belly: 0xddd6fe, furShade: 0xa594f0, white: 0xf8fafc, whiteShade: 0xdfe3f0, face: 0x312e81,
  eye: 0x38bdf8, horn: 0x06b6d4, hornTip: 0xcffafe, paw: 0x312e81, pack: 0x3a3f78, packEdge: 0x6f78c0,
  disc: 0x1e1b4b, tusk: 0xf8fafc, mouth: 0x1e1b4b, strap: 0x262a36,
};
const LUNA_WIDE = 1.3; // vs a standard driver's torso + shoulders

/** Fur: pushes vertices along their direction from the centre by a soft bumpy pattern (shared seam positions
 * get the same push, so it stays closed). */
function fluff(g, amp, freq = 9) {
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const len = v.length() || 1;
    const n = Math.sin(v.x * freq * 1.3 + 1.7) * Math.sin(v.y * freq + 0.4) * Math.sin(v.z * freq * 1.1 + 2.1);
    v.multiplyScalar(1 + (amp * n) / len);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
/** Crescent moon in the XY plane, opening toward +X, extruded toward +Z. */
function crescent(r, depth) {
  const r2 = r * 0.83, d = r * 0.45;
  const x = (r * r - r2 * r2 + d * d) / (2 * d), y = Math.sqrt(r * r - x * x);
  const a = Math.atan2(y, x), b = Math.atan2(y, x - d);
  const sh = new THREE.Shape();
  sh.absarc(0, 0, r, a, Math.PI * 2 - a, false);
  sh.absarc(d, 0, r2, Math.PI * 2 - b, b, true);
  return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: depth * 0.4, bevelSize: r * 0.06, bevelSegments: 2, curveSegments: 24 });
}

const LUNA = {
  smooth: true,
  build(R, y0) {
    const { root, joint, part } = R;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const S = NOVA_SCALE, W = LUNA_WIDE;

    // Torso: wide fluffy barrel, lighter belly; breathes (scale) and sways (springy lean) in update()
    const torso = joint(root, 0, y0 + 0.12, -0.27);
    torso.scale.setScalar(S);
    const body = fluff(new THREE.CapsuleGeometry(0.25, 0.12, 8, 28), 0.012, 14);
    body.scale(1.05 * W, 1, 0.86);
    part(torso, body, (x, y, z) => mix(L.fur, L.belly, smoothstep(0.08, 0.2, z) * smoothstep(0.42, 0.2, y + 0.27)), 0, 0.27, 0);
    const toLocal = (x, y, z) => V(x, y0 + y - torso.position.y, z - torso.position.z).divideScalar(S);
    for (const sx of [1, -1]) {
      // white shoulder tufts that spill over the seat back's edges
      const tuft = fluff(new THREE.SphereGeometry(0.15, 24, 16), 0.02, 18);
      tuft.scale(1.15, 0.85, 1);
      part(torso, tuft, (x, y) => mix(L.whiteShade, L.white, smoothstep(-0.1, 0.06, y)), sx * 0.33, 0.45, -0.01);
      // thick yeti arm, white fur cuff, big indigo paw on the wheel
      const sh = V(sx * 0.32, 0.42, 0.04), hand = toLocal(sx * WHEEL_GRIP[0], WHEEL_GRIP[1], WHEEL_GRIP[2]);
      part(torso, capsuleBetween(0.085, sh, hand, 16), (x, y) => mix(L.furShade, L.fur, smoothstep(0.1, 0.4, y)));
      const at = sh.clone().lerp(hand, 0.78);
      const cuff = fluff(new THREE.TorusGeometry(0.085, 0.04, 10, 20), 0.008, 30);
      cuff.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), hand.clone().sub(sh).normalize()));
      part(torso, cuff, L.white, at.x, at.y, at.z);
      const paw = new THREE.SphereGeometry(0.1, 20, 14);
      paw.scale(1, 0.85, 1.1);
      part(torso, paw, L.paw, hand.x, hand.y, hand.z);
    }
    part(torso, new THREE.CylinderGeometry(0.13, 0.16, 0.14, 24, 1, true), L.fur, 0, 0.6, 0); // neck
    const ruff = fluff(new THREE.TorusGeometry(0.2, 0.1, 20, 56), 0.011, 22);                // white neck ruff
    ruff.rotateX(Math.PI / 2);
    ruff.scale(1.15, 1, 1);
    part(torso, ruff, (x, y) => mix(L.whiteShade, L.white, smoothstep(-0.06, 0.05, y)), 0, 0.58, 0);

    // Defender shield pack: rounded slab on the upper back, straps over the shoulders, glowing crescent
    const pack = new THREE.CapsuleGeometry(0.15, 0.12, 8, 24);
    pack.scale(1.45, 1, 0.55);
    // lighter rim round the edge (x / 1.45 = undo the widening; the capsule's straight middle is 0.12 tall)
    part(torso, pack, (x, y) => mix(L.pack, L.packEdge, smoothstep(0.12, 0.2, Math.max(Math.abs(x) / 1.45, Math.abs(y) - 0.06))), 0, 0.5, -0.26);
    const disc = new THREE.CylinderGeometry(0.105, 0.105, 0.02, 32);
    disc.rotateX(Math.PI / 2);
    part(torso, disc, L.disc, 0, 0.51, -0.34);
    const moon = crescent(0.075, 0.012);
    moon.rotateY(Math.PI); // faces backwards
    part(torso, moon, L.eye, 0.012, 0.51, -0.348, { glow: true });
    for (const sx of [1, -1]) {
      const strap = sweep([[sx * 0.13, 0.66, -0.24], [sx * 0.17, 0.66, -0.08], [sx * 0.19, 0.58, 0.12], [sx * 0.18, 0.4, 0.2]],
        () => 0.022, 16, 8);
      part(torso, strap, L.strap);
    }

    // Head: big pear (wider at the jaw), on top of the ruff
    const head = joint(torso, 0, 0.62, 0);
    head.scale.setScalar(1.06);
    const prof = [[0.0, 0], [0.2, 0.02], [0.29, 0.1], [0.31, 0.18], [0.29, 0.28], [0.25, 0.38], [0.18, 0.47], [0.0, 0.53]];
    const pear = new THREE.LatheGeometry(new THREE.SplineCurve(prof.map(([r, y]) => new THREE.Vector2(r + 1e-4, y))).getPoints(20), 32);
    pear.scale(1.05, 1, 0.92);
    fluff(pear, 0.006, 20);
    part(head, pear, (x, y) => mix(L.fur, L.furShade, smoothstep(0.3, 0.55, y) * 0.5), 0, -0.02, 0);
    // dark indigo face patch set into the front, framed by the brow and the cheek ruff
    const face = new THREE.SphereGeometry(0.16, 28, 18);
    face.scale(1.2, 1, 0.45);
    part(head, face, L.face, 0, 0.18, 0.215);
    for (const sx of [1, -1]) {
      const eye = new THREE.SphereGeometry(0.036, 16, 12);
      eye.scale(1, 1.15, 0.6);
      part(head, eye, L.eye, sx * 0.066, 0.21, 0.278, { glow: true });
      const tusk = teardrop(0.065, 0.024, 12); // up from the lower lip, inside the mouth's curve
      part(head, tusk, L.tusk, sx * 0.034, 0.068, 0.292, { rot: [0.2, 0, -sx * 0.18] });
      // white cheek fur: soft round puffs framing the face (pointed teardrops read as spikes)
      for (const [r, x, y, z] of [[0.095, 0.2, 0.2, 0.12], [0.1, 0.21, 0.1, 0.13], [0.09, 0.15, 0.03, 0.18], [0.075, 0.07, -0.01, 0.22]]) {
        const puff = fluff(new THREE.SphereGeometry(r, 24, 16), r * 0.07, 22);
        puff.scale(1, 0.9, 0.75);
        part(head, puff, (px, py) => mix(L.whiteShade, L.white, smoothstep(-r, r * 0.5, py)), sx * x, y, z);
      }
    }
    const mouth = new THREE.TorusGeometry(0.055, 0.009, 6, 20, Math.PI);
    mouth.rotateZ(Math.PI);
    part(head, mouth, 0x5b4bb7, 0, 0.125, 0.286); // a lighter line so it reads on the dark face
    part(head, new THREE.SphereGeometry(0.035, 12, 8), L.white, 0, 0.5, 0.06); // a white tuft on top
    for (const [x, z, a] of [[0.05, 0.02, 0.5], [-0.05, 0.03, -0.4], [0, -0.04, 0.1]]) {
      const tf = teardrop(0.12, 0.04, 10);
      part(head, tf, L.white, x, 0.47, z, { rot: [-0.3, 0, a] });
    }
    // heavy white unibrow on its own joint (it lowers when she means business)
    const brow = joint(head, 0, 0.29, 0.2);
    const browGeo = fluff(sweep([[-0.19, -0.05, -0.05], [-0.1, 0.0, 0.02], [0, 0.015, 0.045], [0.1, 0.0, 0.02], [0.19, -0.05, -0.05]],
      (u) => 0.03 + 0.035 * Math.sin(Math.PI * u) ** 0.6, 28, 14), 0.004, 40);
    browGeo.scale(1, 0.8, 1);
    part(brow, browGeo, (x, y) => mix(L.whiteShade, L.white, smoothstep(-0.04, 0.03, y)));
    // ram horns: glossy, out from the sides, curling back and a little up, rounded tips
    for (const sx of [1, -1]) {
      const pts = [[0, 0, 0], [sx * 0.1, 0.04, -0.02], [sx * 0.2, 0.06, -0.09], [sx * 0.27, 0.08, -0.19], [sx * 0.29, 0.13, -0.29], [sx * 0.26, 0.2, -0.36]];
      const horn = sweep(pts, (u) => 0.072 * (1 - u) ** 0.75 + 0.014 * Math.sin(Math.PI * Math.min(1, u * 1.02)) + 0.012, 36, 16);
      part(head, horn, (x, y, z) => mix(L.horn, L.hornTip, smoothstep(0.25, 0.42, Math.hypot(x, z))), sx * 0.22, 0.32, -0.02, { gloss: true });
    }

    // ---- Animation hook ----
    const st = { t: 0, lean: 0, sway: 0, swayV: 0, def: 0 };
    return (dt, s) => {
      const ease = (rate) => 1 - Math.exp(-dt * rate);
      st.t += dt;
      const speed = clamp(Math.abs(s.speed), 0, 1.3);
      st.lean = lerp(st.lean, s.steer * (0.75 + 0.5 * s.drift), ease(4));
      // heavy momentum: the upper body is a soft spring chasing the lean (overshoots a little, settles slowly)
      const k = 34, c = 5.5, h = Math.min(dt, 1 / 30);
      st.swayV += ((st.lean - st.sway) * k - st.swayV * c) * h;
      st.sway += st.swayV * h;
      // defender mode: at top speed or right after a kart-to-kart bump
      const want = Math.max(s.bump ?? 0, smoothstep(0.88, 0.98, speed));
      st.def = lerp(st.def, want, ease(want > st.def ? 8 : 2));

      const br = Math.sin(st.t * 2.1); // slow heavy breathing
      torso.scale.set(S * (1 + 0.012 * br), S * (1 + 0.022 * br), S * (1 + 0.016 * br));
      torso.rotation.z = st.sway * 0.13;
      head.rotation.z = st.sway * 0.1;
      head.rotation.y = -st.lean * 0.16;
      head.rotation.x = -0.05 * speed - 0.05 * st.def; // chin down when she's defending
      brow.position.y = 0.29 - 0.028 * st.def;
      brow.rotation.x = 0.18 * st.def;
      if (R.glow) R.glow.color.setScalar(1 + st.def * (0.7 + 0.5 * Math.sin(st.t * 9)));
    };
  },

  avatar() {
    const [fur, sh, wh, ws, face, eye, horn, tip, ink] = [L.fur, L.furShade, L.white, L.whiteShade, L.face, L.eye, L.horn, L.hornTip, L.mouth].map(css);
    const hornL = 'M15 17.5 C8.5 19 3.5 16 2.6 9.5 C2.3 7.2 3.2 5.2 4.6 4.4 C5.2 8.6 7.6 12 14.6 12.6 Z';
    return `<svg class="driver-art" viewBox="0 0 48 48" aria-hidden="true">
    <defs><linearGradient id="luna-horn" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${horn}"/><stop offset="1" stop-color="${tip}"/></linearGradient>
    <radialGradient id="luna-eye"><stop offset="0" stop-color="#fff"/><stop offset="0.35" stop-color="${eye}"/><stop offset="1" stop-color="${eye}" stop-opacity="0"/></radialGradient></defs>
    <path d="M1 48 C1 38.5 9 34 24 34 C39 34 47 38.5 47 48 Z" fill="${fur}"/>
    <path d="M24 38 C29 38 32 41 32.5 48 H15.5 C16 41 19 38 24 38 Z" fill="#ddd6fe"/>
    <circle cx="7.5" cy="38.5" r="6" fill="${wh}"/><circle cx="12" cy="36" r="4.2" fill="${wh}"/><circle cx="4" cy="42" r="3.6" fill="${ws}"/>
    <circle cx="40.5" cy="38.5" r="6" fill="${wh}"/><circle cx="36" cy="36" r="4.2" fill="${wh}"/><circle cx="44" cy="42" r="3.6" fill="${ws}"/>
    <path d="${hornL}" fill="url(#luna-horn)"/>
    <path d="${hornL}" fill="url(#luna-horn)" transform="translate(48 0) scale(-1 1)"/>
    <path d="M24 6.5 C31 6.5 34.5 11.5 35 17.5 C36.6 21.5 37 26.5 34 30.5 C31 34 17 34 14 30.5 C11 26.5 11.4 21.5 13 17.5 C13.5 11.5 17 6.5 24 6.5 Z" fill="${fur}"/>
    <path d="M17 9.5 C19 7.6 22 6.8 24 6.8 C26 6.8 29 7.6 31 9.5 C28 8.8 20 8.8 17 9.5 Z" fill="${sh}" opacity="0.6"/>
    <path d="M21.5 7.5 Q23 3.5 24 3 Q25 3.5 26.5 7.5 Z" fill="${wh}"/>
    <ellipse cx="24" cy="22.6" rx="8" ry="6.8" fill="${face}"/>
    <path d="M11.8 23 Q9.5 27.5 12 30.5 Q11 34.5 15.5 34.7 Q17 37.8 21 36.4 Q24 38.8 27 36.4 Q31 37.8 32.5 34.7 Q37 34.5 36 30.5 Q38.5 27.5 36.2 23 Q34.5 29.6 24 30.2 Q13.5 29.6 11.8 23 Z" fill="${wh}"/>
    <circle cx="20.6" cy="22.4" r="3.6" fill="url(#luna-eye)" opacity="0.8"/><circle cx="27.4" cy="22.4" r="3.6" fill="url(#luna-eye)" opacity="0.8"/>
    <ellipse cx="20.6" cy="22.4" rx="1.6" ry="1.9" fill="${eye}"/><ellipse cx="27.4" cy="22.4" rx="1.6" ry="1.9" fill="${eye}"/>
    <circle cx="21.1" cy="21.7" r="0.55" fill="#fff"/><circle cx="27.9" cy="21.7" r="0.55" fill="#fff"/>
    <path d="M13.6 18.6 Q18.5 14.6 24 16.4 Q29.5 14.6 34.4 18.6 Q34 21.2 31 20.2 Q27 18.6 24 19.6 Q21 18.6 17 20.2 Q14 21.2 13.6 18.6 Z" fill="${wh}"/>
    <path d="M20.2 27.8 Q24 29.4 27.8 27.8" fill="none" stroke="${ink}" stroke-width="0.9" stroke-linecap="round"/>
    <path d="M20.3 28 L21.1 25.4 L21.9 28.2 Z M26.1 28.2 L26.9 25.4 L27.7 28 Z" fill="${wh}"/>
  </svg>`;
  },

  kartArt() {
    const [fur, wh, face, eye, horn, tip, pack, paw] = [L.fur, L.white, L.face, L.eye, L.horn, L.hornTip, L.pack, L.paw].map(css);
    return `<rect x="20.5" y="10" width="8" height="10.5" rx="3" fill="${pack}" stroke="${css(L.packEdge)}" stroke-width="0.9"/>
    <path d="M24.4 12.6 a2.4 2.4 0 1 0 0 4.6 a2 2 0 1 1 0 -4.6 Z" fill="${eye}"/>
    <rect x="26.5" y="12.5" width="14" height="10.5" rx="4" fill="${fur}"/>
    <circle cx="30" cy="13.5" r="3.6" fill="${wh}"/>
    <path d="M33 17 L42.2 19" stroke="${fur}" stroke-width="3.6" stroke-linecap="round"/><circle cx="42.8" cy="19.2" r="2" fill="${paw}"/>
    <path d="M31.5 6.5 C29.5 2.5 25.5 0.8 22 1.6 C21 1.9 20.3 2.7 20.1 3.7 C24 3 27.4 5 28.8 8.4 Z" fill="${horn}"/>
    <path d="M22 1.6 C21 1.9 20.3 2.7 20.1 3.7 C21.4 3.5 22.6 3.6 23.6 4 Z" fill="${tip}"/>
    <path d="M34.5 1.8 C39.5 1.8 41.2 5.6 41 9 C41.6 11.4 40.6 14 38 15 C35 16 30.5 15.6 29.2 13 C28.4 11 28.6 9 29.2 7.4 C29.6 4 31.5 1.8 34.5 1.8 Z" fill="${fur}"/>
    <ellipse cx="38.6" cy="9.4" rx="2.4" ry="3" fill="${face}"/>
    <circle cx="39.6" cy="8.8" r="0.95" fill="${eye}"/>
    <path d="M35.4 6.6 Q38.8 4.6 41.6 6.6 Q41.2 7.8 39.6 7.4 Q37.6 6.8 35.8 7.8 Z" fill="${wh}"/>
    <path d="M29.6 11 Q31 15.8 35 15.6 Q38 15.8 40.4 13 Q39 15.4 37 16.6 Q32.6 17.6 30 15.6 Q28.6 13.6 29.6 11 Z" fill="${wh}"/>
    <path d="M39.4 11.6 L40 10.3 L40.4 11.8 Z" fill="${wh}"/>`;
  },
};

// ---------- Mako: the street-biker shark (the bully) ----------
// Same smooth standard. No helmet: a bullet-shaped shark head pointing forward (teal on the flanks, slate on the
// crown, countershaded white underneath), a wide dark-crimson grin lined with chunky white cone teeth, three gill
// slits each side, angular wrap-around black shades with a red bridge. From behind: ONE tall swept-back dorsal fin
// with a V notch (Nova = two ears, Luna = two horns) and a vertical crescent tail behind the seat that swings like
// a rudder. Charcoal sleeveless biker vest over the white belly, red lapels + collar, two silver spikes per
// shoulder pad, muscular teal arms with small pectoral fin blades at the elbows.
const M = {
  teal: 0x2dd4bf, slate: 0x334155, white: 0xf8fafc, whiteShade: 0xdfe5ee, mouth: 0x4c0519, tooth: 0xffffff,
  gill: 0x1e293b, shades: 0x090d16, red: 0xef4444, redDark: 0xb91c1c, vest: 0x1e293b, vestEdge: 0x334155, spike: 0xe2e8f0,
};
const sharkSkin = (y, top = 0.2) => mix(mix(M.teal, M.slate, 0.35), M.slate, smoothstep(-0.02, top, y)); // flanks -> crown

/** The shark head's surface for t 0..1 (back -> snout tip) and a around the long axis (pi/2 = top, -pi/2 = belly):
 * a bullet that tapers into a rounded, slightly dropped snout, flatter underneath. */
function sharkHead(t, a, out = new THREE.Vector3()) {
  const z = 2 * t - 1, ring = Math.sqrt(Math.max(0, 1 - z * z));
  const x = ring * Math.cos(a), y = ring * Math.sin(a);
  const taper = lerp(1, 0.46, smoothstep(0.3, 1, t));
  return out.set(x * 0.29 * taper, y * 0.27 * (y > 0 ? 0.92 : 0.78) * taper - 0.06 * smoothstep(0.5, 1, t), lerp(-0.27, 0.52, t));
}
// Heads as surfaces: surf(t, a) -> point, t 0..1 back -> front along +Z, a round the Z axis (pi/2 = top).
/** A sphere bent into the surface surf. */
function surfGeo(surf, ws = 56, hs = 32) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.rotateX(Math.PI / 2); // poles on +-Z: the front tip is the +Z pole
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const z = clamp(p.getZ(i), -1, 1);
    surf((z + 1) / 2, Math.atan2(p.getY(i), p.getX(i)), v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
/** A point on surf with its outward normal and the 'up across the surface' direction for a curve (t(u), a(u)). */
function onSurf(surf, curve, u, du = 1e-3, side = 0) {
  const [t, a] = curve(u), [t2, a2] = curve(u + du);
  const P = surf(t, a), T = surf(t2, a2).sub(P).normalize();
  const n = new THREE.Vector3().crossVectors(surf(t, a + 1e-3).sub(P), surf(t + 1e-3, a).sub(P)).normalize();
  if (n.dot(new THREE.Vector3(P.x, P.y + 0.03, 0)) < 0) n.negate();
  const B = new THREE.Vector3().crossVectors(n, T).normalize();
  if (side ? side < 0 : B.y < 0) B.negate(); // side: one orientation for a whole ribbon (a flat crown flips B.y)
  return { P, n, B };
}
/** A thin shell stuck on surf along curve(u), u -1..1: edges at top(u) / bot(u) along the surface's 'up',
 * lifted lift (outer face) above the skin, with a rim so the edge reads from the side. */
function surfRibbon(surf, curve, top, bot, lift, segs = 48) {
  const pos = [], idx = [];
  const side = [-0.8, -0.4, 0, 0.4, 0.8].reduce((sum, u) => sum + onSurf(surf, curve, u, 1e-3, 1).B.y, 0) < 0 ? -1 : 1;
  for (let i = 0; i <= segs; i++) {
    const u = -1 + (2 * i) / segs, { P, n, B } = onSurf(surf, curve, u, 1e-3, side);
    for (const [h, l] of [[top(u), lift], [bot(u), lift], [bot(u), 0.002], [top(u), 0.002]]) {
      const q = P.clone().addScaledVector(B, h).addScaledVector(n, l);
      pos.push(q.x, q.y, q.z);
    }
    if (i < segs) {
      const a = i * 4, b = a + 4;
      for (const [j, k] of [[0, 1], [1, 2], [2, 3], [3, 0]]) idx.push(a + j, b + j, a + k, a + k, b + j, b + k);
    }
  }
  // wind the triangles so the outer face faces out (it depends on the curve's direction and side)
  const q = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const face = new THREE.Vector3().crossVectors(q(4).sub(q(0)), q(1).sub(q(0)));
  if (face.dot(onSurf(surf, curve, -1, 1e-3, side).n) < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** Piecewise linear through [u, value] pairs, mirrored for negative u (angular shades). */
const pw = (pts) => (u) => {
  const x = Math.abs(u);
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
  }
  return pts[pts.length - 1][1];
};
/** A fin from a 2D outline (x = back, y = up), extruded sideways (thickness on X), thinner toward its tip. */
function finGeo(shape, depth, tipY, thin = 0.35) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.6, bevelSize: depth * 0.5, bevelSegments: 4, curveSegments: 16 });
  g.translate(0, 0, -depth / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * lerp(1, thin, clamp(Math.abs(p.getY(i)) / tipY, 0, 1)));
  g.rotateY(Math.PI / 2); // shape x -> -Z (backwards), extrusion -> X
  g.computeVertexNormals();
  return g;
}
/** A cone tooth from base point b along dir, flattened against the surface normal n. */
function tooth(b, dir, n, r, h) {
  const g = new THREE.ConeGeometry(r, h, 10, 1);
  g.translate(0, h / 2, 0);
  g.scale(1, 1, 0.55);
  const X = new THREE.Vector3().crossVectors(dir, n).normalize(), Z = new THREE.Vector3().crossVectors(X, dir).normalize();
  g.applyMatrix4(new THREE.Matrix4().makeBasis(X, dir, Z).setPosition(b));
  return g;
}

const MAKO_BULK = 1.15; // the bully sits 15% bigger than the standard driver (user, build 37)
const MAKO_W = 1.4, MAKO_D = 1.0; // ...and his torso itself is broader + deeper (was 1.1 / 0.84): a muscular barrel
const MAKO = {
  smooth: true,
  gloss: { metalness: 0.8, roughness: 0.1 }, // the shades and the spikes
  build({ root, joint, part }, y0) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const S = NOVA_SCALE * MAKO_BULK; // torso (and everything on it: vest, head, fins) + tail; the mitts stay on the wheel

    // Torso: V-shaped, muscular; charcoal vest open over the white belly (red lapels down the V)
    const torso = joint(root, 0, y0 + 0.12, -0.27);
    torso.scale.setScalar(S);
    const body = new THREE.CapsuleGeometry(0.25, 0.14, 10, 32);
    const bp = body.attributes.position;
    for (let i = 0; i < bp.count; i++) bp.setX(i, bp.getX(i) * MAKO_W * lerp(0.9, 1.12, smoothstep(-0.2, 0.26, bp.getY(i))));
    body.scale(1, 1, MAKO_D);
    body.computeVertexNormals();
    const vOpen = (y) => lerp(0.04, 0.16, smoothstep(-0.26, 0.3, y)); // half-width of the vest's opening
    part(torso, body, (x, y, z) => {
      const open = z > 0 ? smoothstep(vOpen(y) + 0.012, vOpen(y) - 0.012, Math.abs(x)) : 0;
      return mix(mix(M.vest, M.vestEdge, smoothstep(0.15, 0.32, y) * 0.5), mix(M.whiteShade, M.white, smoothstep(-0.2, 0.2, y)), open);
    }, 0, 0.27, 0);
    const chest = (x, y) => { // the capsule's front surface, near enough for the lapels to sit on
      const w = 0.25 * MAKO_W * lerp(0.9, 1.12, smoothstep(-0.2, 0.26, y));
      return MAKO_D * 0.25 * Math.sqrt(Math.max(0, 1 - (x / w) ** 2)) * (y > 0.07 ? Math.sqrt(Math.max(0, 1 - ((y - 0.07) / 0.25) ** 2)) : 1);
    };
    for (const sx of [1, -1]) {
      const pts = [0.24, 0.17, 0.1, 0.03, -0.04].map((y) => { const x = sx * (vOpen(y) + 0.02); return [x, y + 0.27, chest(x, y) + 0.008]; });
      const lapel = sweep(pts, (u) => lerp(0.036, 0.016, u), 16, 10);
      part(torso, lapel, (x, y) => mix(M.red, M.redDark, smoothstep(0.4, 0.2, y)));
      // shoulder pad + two silver spikes
      const pad = new THREE.SphereGeometry(0.115, 24, 14);
      pad.scale(1.15, 0.62, 1.1);
      part(torso, pad, M.vest, sx * 0.37, 0.46, 0);
      for (const dz of [0.05, -0.05]) {
        const spike = new THREE.ConeGeometry(0.034, 0.12, 16, 1);
        spike.translate(0, 0.06, 0);
        part(torso, spike, M.spike, sx * 0.39, 0.49, dz, { rot: [0, 0, -sx * 0.45], gloss: true });
      }
      // muscular arm: bicep bulge, elbow, forearm to a mitt on the wheel; a pectoral fin blade at the elbow
      const sh = V(sx * 0.37, 0.41, 0.03);
      const hand = V(sx * WHEEL_GRIP[0], y0 + WHEEL_GRIP[1] - torso.position.y, WHEEL_GRIP[2] - torso.position.z).divideScalar(S);
      const elbow = sh.clone().lerp(hand, 0.5).add(V(sx * 0.07, -0.09, -0.03));
      const armPts = [sh, sh.clone().lerp(elbow, 0.5), elbow, elbow.clone().lerp(hand, 0.5), hand].map((q) => q.toArray());
      const arm = sweep(armPts, (u) => 0.062 + 0.03 * Math.exp(-(((u - 0.24) / 0.14) ** 2)) + 0.014 * Math.exp(-(((u - 0.72) / 0.12) ** 2)) - 0.012 * u, 32, 16);
      part(torso, arm, (x, y) => sharkSkin(y - 0.32, 0.12));
      const mitt = new THREE.SphereGeometry(0.078, 20, 14);
      mitt.scale(1, 0.85, 1.1);
      part(torso, mitt, (x, y) => mix(M.white, mix(M.teal, M.slate, 0.4), smoothstep(-0.05, 0.03, y)), hand.x, hand.y, hand.z);
      const fs = new THREE.Shape();
      fs.moveTo(0, 0); fs.quadraticCurveTo(0.06, 0.04, 0.14, 0.12); fs.quadraticCurveTo(0.08, 0.03, 0.09, -0.005); fs.lineTo(0, -0.02);
      const fin = finGeo(fs, 0.014, 0.12, 0.5);
      const fore = hand.clone().sub(elbow).normalize(), out = V(sx, 0.2, 0).normalize();
      const Y = out.clone().sub(fore.clone().multiplyScalar(out.dot(fore))).normalize(); // outward, square to the forearm
      const Zb = fore, Xb = new THREE.Vector3().crossVectors(Y, Zb); // the fin's -Z ('back') points up the forearm
      fin.applyMatrix4(new THREE.Matrix4().makeBasis(Xb, Y, Zb));
      const at = elbow.clone().lerp(hand, 0.18).addScaledVector(Y, 0.055);
      part(torso, fin, mix(M.teal, M.slate, 0.55), at.x, at.y, at.z);
    }
    const neck = new THREE.CylinderGeometry(0.15, 0.18, 0.16, 28, 1, true);
    part(torso, neck, (x, y, z) => (z > 0.05 ? M.white : sharkSkin(0.1)), 0, 0.6, 0);
    const collar = new THREE.TorusGeometry(0.185, 0.035, 10, 32, Math.PI * 1.25); // popped collar round the back
    collar.rotateZ(-Math.PI * 0.125);
    collar.rotateX(Math.PI / 2 + 0.25);
    collar.rotateY(Math.PI);
    part(torso, collar, M.red, 0, 0.6, -0.01);

    // Head: one bullet shape, countershaded; the line between dark and white rises a little toward the snout
    const head = joint(torso, 0, 0.6, 0.02);
    head.scale.setScalar(1.06);
    const C0 = V(0, 0.2, 0.04); // where the head shape sits on its joint
    part(head, surfGeo(sharkHead), (x, y, z) => {
      const line = -0.035 + 0.025 * smoothstep(-0.1, 0.4, z);
      return mix(sharkSkin(y), mix(M.whiteShade, M.white, smoothstep(-0.2, -0.06, y)), smoothstep(line + 0.035, line - 0.035, y));
    }, C0.x, C0.y, C0.z);
    const on = (g) => g.translate(C0.x, C0.y, C0.z);

    // the grin: a dark band across the lower front of the snout, corners curling up toward the cheeks
    const grin = (u) => [0.86 - 0.3 * u * u, -Math.PI / 2 + u * 1.42];
    const gTop = (u) => 0.024 - 0.01 * u * u, gBot = (u) => -0.05 + 0.04 * u * u;
    part(head, on(surfRibbon(sharkHead, grin, gTop, gBot, 0.006)), M.mouth);
    for (let i = 0; i < 9; i++) { // top row hangs down from the upper lip
      const u = -0.84 + (1.68 * i) / 8, { P, n, B } = onSurf(sharkHead, grin, u), w = 1 - 0.4 * u * u;
      const b = P.clone().addScaledVector(B, gTop(u) + 0.004).addScaledVector(n, 0.008);
      part(head, on(tooth(b, B.clone().negate().addScaledVector(n, 0.35).normalize(), n, 0.026 * w, 0.05 * w)), M.tooth);
    }
    const jaw = joint(head, 0, C0.y - 0.05, C0.z + 0.2); // lower teeth: they chomp
    for (let i = 0; i < 8; i++) {
      const u = -0.74 + (1.48 * i) / 7, { P, n, B } = onSurf(sharkHead, grin, u), w = 1 - 0.45 * u * u;
      const b = P.clone().addScaledVector(B, gBot(u) + 0.004).addScaledVector(n, 0.008).add(C0).sub(jaw.position);
      part(jaw, tooth(b, B.clone().addScaledVector(n, 0.5).normalize(), n, 0.022 * w, 0.04 * w), M.tooth);
    }
    // gill slits: three short dark grooves on each cheek, behind the mouth corners
    for (const side of [0, Math.PI]) {
      for (const t of [0.33, 0.39, 0.45]) {
        const gill = surfRibbon(sharkHead, (u) => [t + 0.012 * u * u, (side ? Math.PI : 0) + (side ? 1 : -1) * (-0.22 + 0.32 * u)],
          () => 0.006, () => -0.006, 0.004, 10);
        part(head, on(gill), M.gill);
      }
    }
    // shades: one angular black wrap across the brow ridge, red bridge on top (both glossy)
    const brow = (u) => [0.79 - 0.25 * u * u, Math.PI / 2 - u * 1.38];
    const sTop = pw([[0, 0.026], [0.12, 0.04], [0.55, 0.058], [0.86, 0.05], [1, 0.014]]);
    const sBot = pw([[0, 0.004], [0.12, -0.03], [0.45, -0.07], [0.82, -0.056], [1, -0.01]]);
    part(head, on(surfRibbon(sharkHead, brow, sTop, sBot, 0.02, 64)), M.shades, 0, 0, 0, { gloss: true });
    const bridgeTop = pw([[0, 0.034], [0.22, 0.04], [0.3, 0.028]]), bridgeBot = pw([[0, 0.006], [0.22, 0.02], [0.3, 0.02]]);
    part(head, on(surfRibbon(sharkHead, (u) => brow(u * 0.3), (u) => bridgeTop(u * 0.3), (u) => bridgeBot(u * 0.3), 0.028, 16)), M.red, 0, 0, 0, { gloss: true });

    // dorsal fin: tall, swept back from the crown, with a V 'battle notch' in its trailing edge
    const ds = new THREE.Shape();
    ds.moveTo(-0.13, 0);
    ds.quadraticCurveTo(-0.06, 0.2, 0.16, 0.4);  // leading edge up and back to the tip
    ds.quadraticCurveTo(0.13, 0.33, 0.12, 0.27); // trailing edge down...
    ds.lineTo(0.07, 0.235);                       // ...into the notch...
    ds.lineTo(0.12, 0.19);                        // ...and out again
    ds.quadraticCurveTo(0.1, 0.06, 0.15, -0.1); // the base dips at the back, where the crown falls away
    ds.lineTo(-0.13, -0.02);
    part(head, finGeo(ds, 0.05, 0.4, 0.3), (x, y) => mix(M.slate, mix(M.teal, M.slate, 0.55), smoothstep(0.38, 0.1, y)), 0, 0.41, -0.02);

    // Tail: a short tapered stalk out of the gap above the seat back, then a vertical crescent (a rudder)
    const tail = joint(root, 0, y0 + 0.68, -0.64);
    tail.scale.setScalar(S);
    part(tail, sweep([[0, 0, 0.06], [0, 0.005, -0.06], [0, 0.015, -0.17]], (u) => lerp(0.075, 0.035, u), 12, 16),
      (x, y) => mix(M.white, sharkSkin(0.1), smoothstep(-0.03, 0.01, y)));
    const ts = new THREE.Shape();
    ts.moveTo(0, -0.035);
    ts.quadraticCurveTo(0.03, 0.16, 0.2, 0.3);   // upper lobe: tall, swept back
    ts.quadraticCurveTo(0.12, 0.12, 0.12, 0.02); // its trailing edge into the fork
    ts.quadraticCurveTo(0.13, -0.06, 0.17, -0.13); // lower lobe: short
    ts.quadraticCurveTo(0.05, -0.08, 0, -0.035);
    part(tail, finGeo(ts, 0.03, 0.3, 0.4), (x, y) => mix(mix(M.teal, M.slate, 0.4), M.slate, smoothstep(0.05, 0.28, Math.abs(y))), 0, 0.015, -0.15);

    // ---- Animation hook ----
    const st = { t: 0, lean: 0, sway: 0, speed: 0, acc: 0, chomp: 0, fire: 0, boost: 0, idle: 3 };
    return (dt, s) => {
      const ease = (rate) => 1 - Math.exp(-dt * rate);
      st.t += dt;
      const speed = clamp(Math.abs(s.speed), 0, 1.3);
      st.acc = lerp(st.acc, (speed - st.speed) / Math.max(dt, 1e-3), ease(4)); // smoothed acceleration
      st.speed = speed;
      st.lean = lerp(st.lean, s.steer * (0.8 + 0.6 * s.drift), ease(7));
      st.sway = lerp(st.sway, st.lean, ease(3.5)); // the tail follows the steering a beat late

      // bully quirk: a chomp when he fires an item or hits a boost, and now and then while parked (lobby)
      if ((s.fire && !st.fire) || (s.boost && !st.boost)) st.chomp = 1;
      st.fire = s.fire ?? 0; st.boost = s.boost;
      st.idle -= dt * (speed < 0.05 ? 1 : 0);
      if (st.idle <= 0) { st.chomp = 1; st.idle = 3 + Math.random() * 4; }
      const c = st.chomp > 0 ? Math.abs(Math.sin((1 - st.chomp) * Math.PI * 2)) : 0; // two snaps
      st.chomp = Math.max(0, st.chomp - dt * 1.8);
      const bob = Math.sin(st.t * 15) * smoothstep(0.06, 0.3, st.acc); // head bob while he floors it

      torso.rotation.z = st.lean * 0.17;               // leans hard into the turn
      torso.rotation.x = 0.05 * speed;                 // hunched over the wheel at speed
      head.rotation.z = st.lean * 0.1;
      head.rotation.y = -st.lean * 0.24;
      head.rotation.x = -0.04 * speed + 0.05 * bob - 0.1 * c;
      jaw.rotation.x = 0.2 * c;

      // tail: a rudder (trailing edge to the side he steers), a lazy swish when idle
      const swish = Math.sin(st.t * 2.3) * 0.08 * (1 - clamp(speed * 2, 0, 0.7));
      tail.rotation.y = st.sway * 0.5 + swish;
      tail.rotation.z = -st.sway * 0.08;
      tail.rotation.x = -0.1 * speed;
    };
  },

  avatar() {
    const [teal, slate, wh, ws, mouth, gill, sh, red, vest, spike] = [M.teal, M.slate, M.white, M.whiteShade, M.mouth, M.gill, M.shades, M.red, M.vest, M.spike].map(css);
    // teeth along the grin's two quadratic edges (top: 12.5,26 Q24 31 35.5,26; bottom: 12.5,26 Q24 38.5 35.5,26)
    const q = (y0, yc, x) => { const u = (x - 12.5) / 23; return (1 - u) ** 2 * y0 + 2 * u * (1 - u) * yc + u * u * y0; };
    let teeth = '';
    for (let i = 0; i < 8; i++) { const x = 14.6 + i * 2.7, y = q(26, 31, x); teeth += `M${(x - 1.3).toFixed(1)} ${(y - 0.3).toFixed(1)} L${(x + 1.3).toFixed(1)} ${(y - 0.3).toFixed(1)} L${x.toFixed(1)} ${(y + 2.5).toFixed(1)} Z `; }
    for (let i = 0; i < 7; i++) { const x = 16 + i * 2.7, y = q(26, 38.5, x); teeth += `M${(x - 1.1).toFixed(1)} ${(y + 0.3).toFixed(1)} L${(x + 1.1).toFixed(1)} ${(y + 0.3).toFixed(1)} L${x.toFixed(1)} ${(y - 2).toFixed(1)} Z `; }
    return `<svg class="driver-art" viewBox="0 0 48 48" aria-hidden="true">
    <defs><linearGradient id="mako-skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${slate}"/><stop offset="1" stop-color="${css(mix(M.teal, M.slate, 0.2))}"/></linearGradient>
    <linearGradient id="mako-fin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${slate}"/><stop offset="1" stop-color="${css(mix(M.teal, M.slate, 0.55))}"/></linearGradient></defs>
    <path d="M3 48 C3 39.5 10 35 24 35 C38 35 45 39.5 45 48 Z" fill="${vest}" stroke="#fff" stroke-opacity="0.2"/>
    <path d="M18.5 35.5 L24 48 L29.5 35.5 Z" fill="${wh}"/>
    <path d="M17 35.6 L19.6 35.4 L24 45.5 L22.6 48 Z M31 35.6 L28.4 35.4 L24 45.5 L25.4 48 Z" fill="${red}"/>
    <ellipse cx="8.5" cy="39.5" rx="6" ry="3.4" fill="#2a3547"/><ellipse cx="39.5" cy="39.5" rx="6" ry="3.4" fill="#2a3547"/>
    <path d="M4.5 38.5 L3 32 L7.5 37 Z M9.5 37.2 L9.6 30.6 L12.6 36.6 Z M43.5 38.5 L45 32 L40.5 37 Z M38.5 37.2 L38.4 30.6 L35.4 36.6 Z" fill="${spike}"/>
    <path d="M17.5 12 Q20 3.5 32 0.4 Q29.6 2.8 29.3 4.6 L26.6 6.2 L28.9 8.2 Q28.8 10.4 30.2 12 Z" fill="url(#mako-fin)"/>
    <path d="M24 9 C35 9 41 16 41 24.5 C41 31.5 34 36.5 24 36.5 C14 36.5 7 31.5 7 24.5 C7 16 13 9 24 9 Z" fill="url(#mako-skin)"/>
    <path d="M7.4 27.5 Q15 31.8 24 31.8 Q33 31.8 40.6 27.5 C39 33.4 32.6 36.5 24 36.5 C15.4 36.5 9 33.4 7.4 27.5 Z" fill="${wh}"/>
    <path d="M12.5 26 Q24 31 35.5 26 Q24 38.5 12.5 26 Z" fill="${mouth}"/>
    <path d="${teeth}" fill="${wh}"/>
    <path d="M8.6 25.5 q1 2.5 0.4 5 M10.3 26.8 q0.9 2.2 0.3 4.4 M38.8 25.5 q-1 2.5 -0.4 5 M37.1 26.8 q-0.9 2.2 -0.3 4.4" fill="none" stroke="${gill}" stroke-width="0.9" stroke-linecap="round"/>
    <path d="M7.6 17.4 L21.6 16 L24 17.6 L26.4 16 L40.4 17.4 L39.4 21 L33.6 23.6 L27.6 22.6 L24 20.6 L20.4 22.6 L14.4 23.6 L8.6 21 Z" fill="${sh}"/>
    <path d="M21.6 16 L24 17.6 L26.4 16 L26 18.6 L24 19.8 L22 18.6 Z" fill="${red}"/>
    <path d="M10.5 18.6 L19 17.8 M29 17.8 L37.5 18.6" stroke="#fff" stroke-opacity="0.55" stroke-width="0.9" stroke-linecap="round"/>
  </svg>`;
  },

  kartArt() {
    const [teal, slate, wh, mouth, gill, sh, red, vest, spike] = [M.teal, M.slate, M.white, M.mouth, M.gill, M.shades, M.red, M.vest, M.spike].map(css);
    const skin = css(mix(M.teal, M.slate, 0.4));
    return `<path d="M29 12.4 L24.6 11.8 L24.6 14.2 L29 15.6 Z" fill="${skin}"/>
    <path d="M25.4 12.4 Q22.8 8.8 19.2 4.8 Q24.4 7 26 11.6 Z M25.4 13.6 Q23.4 16.8 20.6 18.8 Q25 18 26.2 14.2 Z" fill="${skin}"/>
    <rect x="28" y="14" width="11" height="9" rx="3" fill="${vest}"/><path d="M36 14.2 L39 14.6 L39 20 Z" fill="${wh}"/><path d="M35 14.2 L36.6 14.2 L38.6 19 Z" fill="${red}"/>
    <path d="M29 14.6 L28.4 11 L30.6 14.2 Z M31.6 14.2 L31.6 10.6 L33.4 14.2 Z" fill="${spike}"/>
    <path d="M33.5 16.5 L42 19" stroke="${skin}" stroke-width="3" stroke-linecap="round"/><circle cx="42.5" cy="19.2" r="1.7" fill="${skin}"/>
    <path d="M36.2 18.2 L33.8 21.6 L37.6 18.6 Z" fill="${skin}"/>
    <path d="M31.4 6.6 Q31 2.4 27.6 0.4 Q32.6 0.8 35 3.8 L34 4.6 L35.6 5.4 L36 5.8 Z" fill="${slate}"/>
    <path d="M29.6 12.4 C29 7.6 32.4 5 37 5.3 C41 5.6 44.6 8 46.6 10.6 C47 11.4 46.2 12.3 45 12.5 C41 13.7 35 14.9 31.6 14.5 C30.3 14.3 29.7 13.5 29.6 12.4 Z" fill="${skin}"/>
    <path d="M29.8 12.6 Q36 12.6 46.4 11.5 C46 12.3 45.4 12.5 45 12.6 C41 13.7 35 14.9 31.6 14.5 C30.4 14.3 29.9 13.6 29.8 12.6 Z" fill="${wh}"/>
    <path d="M37.4 11.6 Q41.5 12.3 45.6 10.9 Q42 14.4 38 13.1 Z" fill="${mouth}"/>
    <path d="M38.8 11.8 L40.2 11.9 L39.6 13 Z M41 11.9 L42.4 11.8 L41.8 12.9 Z M43.2 11.6 L44.4 11.3 L43.8 12.3 Z" fill="${wh}"/>
    <path d="M33 9.4 q0.6 1.6 0.2 3.2 M34.4 9.2 q0.6 1.6 0.2 3.2 M35.8 9 q0.6 1.6 0.2 3.2" fill="none" stroke="${gill}" stroke-width="0.5" stroke-linecap="round"/>
    <path d="M37.6 6.8 L44 7.8 L43.4 9.4 L39.4 10 Z" fill="${sh}"/><path d="M37.6 6.8 L41 7.3 L40.6 8 L37.8 7.6 Z" fill="${red}"/>`;
  },
};

// ---------- Rex: the cyber-raptor (the ace) ----------
// Same smooth standard. No helmet: a long emerald-to-cobalt raptor head (one bent sphere, `raptorHead`), mint
// jaw, a thin smile with two fangs, nostrils, and a wide glowing cyan-to-magenta visor straight across the eyes.
// An orange segmented crest runs down the back of the head onto the neck. Carbon racing suit with glowing
// cyan telemetry lines, orange collar + shoulder caps, clawed green hands. From behind: a long armoured tail
// with orange spine plates over the engine, two joints so it swings like a whip (counterbalance) as he drifts.
const X = {
  emerald: 0x059669, cobalt: 0x0284c7, mint: 0x6ee7b7, crest: 0xf97316, crestDark: 0xc2410c, cyan: 0x22d3ee,
  magenta: 0xe879f9, carbon: 0x1f2937, carbonLight: 0x334155, frame: 0x0b1220, mouth: 0x0f172a, fang: 0xf8fafc,
};
function raptorHead(t, a, out = new THREE.Vector3()) {
  const z = 2 * t - 1, ring = Math.sqrt(Math.max(0, 1 - z * z));
  const x = ring * Math.cos(a), y = ring * Math.sin(a);
  const sx = lerp(1, 0.56, smoothstep(0.3, 1, t)), sy = lerp(1, 0.5, smoothstep(0.25, 1, t));
  return out.set(x * 0.25 * sx, y * 0.25 * (y > 0 ? 0.92 : 0.8) * sy - 0.035 * smoothstep(0.5, 1, t), lerp(-0.24, 0.56, t));
}
/** Front of a standard (Nova-sized) torso capsule at (x, y) in torso space, for things stuck on the chest. */
const chestZ = (x, y) => {
  const dy = Math.max(0, Math.abs(y - 0.27) - 0.07), k = Math.sqrt(Math.max(0, 1 - (dy / 0.24) ** 2));
  return 0.82 * 0.24 * k * Math.sqrt(Math.max(0, 1 - (x / (0.252 * k)) ** 2));
};
/** A rounded crest / spine plate (x = back, y = up), height ~0.11 * size. */
function plateGeo(size) {
  const sh = new THREE.Shape();
  sh.moveTo(-0.05, -0.02);
  sh.quadraticCurveTo(-0.05, 0.08, 0.025, 0.11);
  sh.quadraticCurveTo(0.065, 0.06, 0.06, -0.02);
  sh.lineTo(-0.05, -0.02);
  const g = finGeo(sh, 0.026, 0.11, 0.45);
  g.scale(size, size, size);
  return g;
}

const REX = {
  smooth: true,
  build(R, y0) {
    const { root, joint, part } = R;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const S = NOVA_SCALE;

    // Torso: carbon racing suit, lighter side panels, glowing telemetry lines on the chest
    const torso = joint(root, 0, y0 + 0.12, -0.27);
    torso.scale.setScalar(S);
    const body = new THREE.CapsuleGeometry(0.24, 0.14, 10, 32);
    body.scale(1.05, 1, 0.82);
    part(torso, body, (x, y) => mix(mix(X.carbon, X.carbonLight, smoothstep(0.16, 0.22, Math.abs(x))), X.frame, smoothstep(0, -0.2, y) * 0.5), 0, 0.27, 0);
    const line = (pts, r = 0.0075) => pts.slice(1).forEach((q, i) => part(torso, capsuleBetween(r, pts[i], q, 8), X.cyan, 0, 0, 0, { glow: true }));
    for (const sx of [1, -1]) {
      const at = (x, y) => V(sx * x, y, chestZ(x, y) + 0.004);
      line([at(0.05, 0.47), at(0.11, 0.4), at(0.11, 0.2), at(0.16, 0.13)]);
      part(torso, new THREE.SphereGeometry(0.016, 12, 8), X.cyan, ...at(0.16, 0.13).toArray(), { glow: true });
      part(torso, new THREE.SphereGeometry(0.095, 20, 14), (x, y) => mix(X.crestDark, X.crest, smoothstep(-0.05, 0.06, y)), sx * 0.25, 0.45, 0); // shoulder cap
      // carbon sleeve with a glowing seam, clawed green hand on the wheel
      const sh = V(sx * 0.26, 0.44, 0.03);
      const hand = V(sx * WHEEL_GRIP[0], y0 + WHEEL_GRIP[1] - torso.position.y, WHEEL_GRIP[2] - torso.position.z).divideScalar(S);
      part(torso, capsuleBetween(0.062, sh, hand, 16), X.carbon);
      line([sh.clone().add(V(0, 0.06, 0)), hand.clone().lerp(sh, 0.15).add(V(0, 0.058, 0))], 0.006);
      const paw = new THREE.SphereGeometry(0.072, 20, 14);
      paw.scale(1, 0.85, 1.1);
      part(torso, paw, (x, y) => mix(X.mint, X.emerald, smoothstep(-0.05, 0.03, y)), hand.x, hand.y, hand.z);
      for (const dx of [-0.035, 0, 0.035]) {
        const claw = new THREE.ConeGeometry(0.011, 0.04, 10);
        claw.rotateX(Math.PI / 2 + 0.6);
        part(torso, claw, X.fang, hand.x + dx, hand.y + 0.04, hand.z + 0.06);
      }
    }
    part(torso, new THREE.CylinderGeometry(0.12, 0.15, 0.16, 24, 1, true), X.emerald, 0, 0.6, 0); // neck
    const collar = new THREE.TorusGeometry(0.16, 0.035, 10, 32);
    collar.rotateX(Math.PI / 2);
    part(torso, collar, X.crest, 0, 0.56, 0);
    for (const [y, z, a, sz] of [[0.66, -0.12, -0.7, 0.75], [0.6, -0.17, -0.9, 0.62]]) part(torso, plateGeo(sz), X.crest, 0, y, z, { rot: [a, 0, 0] });

    // Head: long raptor head, emerald snout into a cobalt crown, mint jaw
    const head = joint(torso, 0, 0.6, 0.02);
    head.scale.setScalar(1.06);
    const C0 = V(0, 0.2, 0.05);
    part(head, surfGeo(raptorHead, 48, 32), (x, y, z) => {
      const base = mix(X.emerald, X.cobalt, clamp(smoothstep(0.3, -0.2, z) * 0.7 + smoothstep(0, 0.2, y) * 0.5, 0, 1));
      return mix(base, X.mint, smoothstep(-0.02, -0.08, y) * 0.85);
    }, C0.x, C0.y, C0.z);
    const on = (g) => g.translate(C0.x, C0.y, C0.z);
    const smile = (u) => [0.95 - 0.42 * u * u, -Math.PI / 2 + u * 1.45];
    part(head, on(surfRibbon(raptorHead, smile, () => 0.006, () => -0.006, 0.004, 32)), X.mouth);
    for (const u of [-0.42, 0.42]) { // two little fangs
      const { P, n, B } = onSurf(raptorHead, smile, u);
      part(head, on(tooth(P.clone().addScaledVector(B, 0.004).addScaledVector(n, 0.006), B.clone().negate().addScaledVector(n, 0.3).normalize(), n, 0.014, 0.036)), X.fang);
    }
    for (const u of [-1, 1]) {
      const { P } = onSurf(raptorHead, (v) => [0.9, Math.PI / 2 - v * 0.42], u);
      part(head, on(new THREE.SphereGeometry(0.013, 10, 8)), X.mouth, P.x, P.y, P.z);
    }
    // the cyber-visor: dark frame + a glowing cyan -> magenta band wrapped straight across the eyes
    const eyes = (u) => [0.76 - 0.24 * u * u, Math.PI / 2 - u * 1.3]; // across the top of the snout, down to the eyes
    const vTop = pw([[0, 0.05], [0.85, 0.046], [1, 0.022]]), vBot = pw([[0, -0.028], [0.85, -0.036], [1, -0.012]]);
    part(head, on(surfRibbon(raptorHead, eyes, (u) => vTop(u) + 0.014, (u) => vBot(u) - 0.014, 0.016, 64)), X.frame, 0, 0, 0, { gloss: true });
    part(head, on(surfRibbon(raptorHead, eyes, vTop, vBot, 0.024, 64)), (x) => mix(X.magenta, X.cyan, smoothstep(-0.2, 0.2, -x)), 0, 0, 0, { glow: true });
    // crest: plates down the back of the head, tallest on the crown
    [[0.6, 0.8], [0.49, 1], [0.38, 1.05], [0.27, 1], [0.16, 0.9], [0.06, 0.8]].forEach(([t, sz]) => {
      const { P, n } = onSurf(raptorHead, (u) => [u, Math.PI / 2], t);
      part(head, plateGeo(sz), (x, y) => mix(X.crestDark, X.crest, smoothstep(0, 0.07 * sz, y)), P.x + C0.x, P.y + C0.y - 0.012, P.z + C0.z, { rot: [Math.atan2(n.z, n.y), 0, 0] });
    });

    // Tail: two joints (a whip), armour bands, spine plates; rises from behind the seat back over the engine
    const tail = joint(root, 0, y0 + 0.66, -0.72);
    tail.scale.setScalar(S);
    const armour = (x, y, z) => mix(mix(X.cobalt, X.emerald, smoothstep(0.02, -0.06, y) * 0.8), X.frame, smoothstep(0.8, 0.98, Math.abs(Math.sin(z * Math.PI / 0.09))) * 0.35);
    part(tail, sweep([[0, -0.02, 0.1], [0, 0.0, -0.12], [0, 0.03, -0.33]], (u) => lerp(0.11, 0.08, u), 20, 20), armour);
    const tail2 = joint(tail, 0, 0.03, -0.33);
    part(tail2, new THREE.SphereGeometry(0.08, 20, 14), armour); // hides the bend between the two halves
    part(tail2, sweep([[0, 0, 0], [0, 0.02, -0.18], [0, 0.07, -0.36], [0, 0.15, -0.52]], (u) => 0.08 * (1 - u) ** 0.8 + 0.004, 28, 20), armour);
    for (const [j, z, y, sz] of [[tail, -0.06, 0.1, 0.8], [tail, -0.2, 0.11, 0.75], [tail2, -0.04, 0.075, 0.7], [tail2, -0.18, 0.085, 0.6], [tail2, -0.32, 0.12, 0.48], [tail2, -0.44, 0.17, 0.36]]) {
      part(j, plateGeo(sz), X.crest, 0, y, z, { rot: [-0.25, 0, 0] });
    }

    // ---- Animation hook ----
    const st = { t: 0, lean: 0, s1: 0, s2: 0 };
    return (dt, s) => {
      const ease = (rate) => 1 - Math.exp(-dt * rate);
      st.t += dt;
      const speed = clamp(Math.abs(s.speed), 0, 1.3);
      st.lean = lerp(st.lean, s.steer * (0.7 + 0.5 * s.drift), ease(6));
      st.s1 = lerp(st.s1, st.lean * (1 + 0.9 * s.drift), ease(3));   // the tail swings out against the turn...
      st.s2 = lerp(st.s2, st.s1, ease(2.2));                          // ...and its tip follows a beat later (a whip)
      torso.rotation.z = st.lean * 0.1;                              // the ace stays composed
      head.rotation.z = st.lean * 0.06;
      head.rotation.y = -st.lean * 0.18;
      head.rotation.x = -0.04 * speed;
      const idle = Math.sin(st.t * 1.6) * 0.07 * (1 - clamp(speed * 2, 0, 0.8));
      tail.rotation.y = -st.s1 * 0.3 + idle * 0.5;
      tail2.rotation.y = -st.s2 * 0.42 + idle;
      tail.rotation.x = -0.06 * speed;
      if (R.glow) R.glow.color.setScalar(0.9 + 0.12 * Math.sin(st.t * 3) + 0.35 * s.boost); // visor + lines
    };
  },
  avatar() {
    const [em, co, mint, cr, crd, cy, mg, cb, fr, mo] = [X.emerald, X.cobalt, X.mint, X.crest, X.crestDark, X.cyan, X.magenta, X.carbon, X.frame, X.mouth].map(css);
    return `<svg class="driver-art" viewBox="0 0 48 48" aria-hidden="true">
    <defs><linearGradient id="rex-skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${co}"/><stop offset="0.75" stop-color="${em}"/></linearGradient>
    <linearGradient id="rex-visor" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${cy}"/><stop offset="1" stop-color="${mg}"/></linearGradient></defs>
    <path d="M4 48 C4 39 11 35 24 35 C37 35 44 39 44 48 Z" fill="${cb}" stroke="#fff" stroke-opacity="0.2"/>
    <path d="M13.5 48 V41.5 L17.5 38.5 M34.5 48 V41.5 L30.5 38.5" fill="none" stroke="${cy}" stroke-width="1.1" stroke-linecap="round"/>
    <circle cx="6.5" cy="41" r="4" fill="${cr}"/><circle cx="41.5" cy="41" r="4" fill="${cr}"/>
    <path d="M16.5 36 Q24 40 31.5 36 L30.5 33 Q24 36 17.5 33 Z" fill="${cr}"/>
    <path d="M17.5 12 Q14.6 7 18.8 5.6 Q18.6 1.4 22.4 1.8 Q24 -0.8 25.6 1.8 Q29.4 1.4 29.2 5.6 Q33.4 7 30.5 12 Z" fill="${cr}" stroke="${crd}" stroke-width="0.6"/>
    <path d="M24 6.5 C33 6.5 38.5 12 38.5 19 C38.5 26.5 34 33.5 24 33.5 C14 33.5 9.5 26.5 9.5 19 C9.5 12 15 6.5 24 6.5 Z" fill="url(#rex-skin)"/>
    <path d="M12.6 25 Q24 30.5 35.4 25 C33.6 30.6 29.6 33.5 24 33.5 C18.4 33.5 14.4 30.6 12.6 25 Z" fill="${mint}"/>
    <path d="M14 25.6 Q24 31 34 25.6" fill="none" stroke="${mo}" stroke-width="1" stroke-linecap="round"/>
    <path d="M18.2 27.6 L19.6 28.1 L18.7 30.1 Z M29.8 27.6 L28.4 28.1 L29.3 30.1 Z" fill="#fff"/>
    <ellipse cx="21.4" cy="23" rx="0.9" ry="0.7" fill="${mo}"/><ellipse cx="26.6" cy="23" rx="0.9" ry="0.7" fill="${mo}"/>
    <path d="M8 13.4 L40 13.4 L39.3 20.8 L8.7 20.8 Z" fill="${fr}"/>
    <path d="M9.2 14.6 L38.8 14.6 L38.2 19.6 L9.8 19.6 Z" fill="url(#rex-visor)"/>
    <path d="M11.5 16.2 H22" stroke="#fff" stroke-opacity="0.7" stroke-width="1" stroke-linecap="round"/>
  </svg>`;
  },

  kartArt() {
    const [em, co, mint, cr, cy, mg, cb, fr, mo] = [X.emerald, X.cobalt, X.mint, X.crest, X.cyan, X.magenta, X.carbon, X.frame, X.mouth].map(css);
    return `<path d="M29 13 Q19 11.5 6.5 6.8 Q5.6 7.8 7 9 Q18.5 15.5 29 17 Z" fill="${co}"/>
    <path d="M10 7.6 L11.6 5.4 L13 8.6 Z M15.4 9.4 L17.2 7.1 L18.6 10.4 Z M21 11 L22.8 8.8 L24 12 Z" fill="${cr}"/>
    <rect x="28" y="14" width="11" height="9" rx="3" fill="${cb}"/><path d="M30 22 V18 L33 16" fill="none" stroke="${cy}" stroke-width="0.8"/>
    <circle cx="30" cy="15" r="2.2" fill="${cr}"/>
    <path d="M33.5 16.5 L42 19" stroke="${cb}" stroke-width="2.6" stroke-linecap="round"/><circle cx="42.5" cy="19.2" r="1.7" fill="${em}"/>
    <path d="M29.4 4.6 L30.8 1.4 L32.2 4.2 Z M28.4 7.4 L28.6 4.6 L30.6 6 Z" fill="${cr}"/>
    <path d="M30 9.4 C30 5 33.6 2.8 37.6 3.1 C41 3.4 44 5.2 47 7.6 C47.6 8.2 47.4 9.2 46.6 9.6 C43 11.6 38 12.9 34 12.7 C31.6 12.5 30 11.3 30 9.4 Z" fill="${em}"/>
    <path d="M30.6 4.8 C32.4 3.4 35 2.8 37.6 3.1 C40.4 3.4 42.4 4.4 44 5.6 C40 5.2 34.4 5 30.6 4.8 Z" fill="${co}"/>
    <path d="M31 11.6 Q38 12 46.8 9.2 C46.4 9.8 46 9.8 45.6 10 C42 11.8 37.6 13 34 12.8 C32.6 12.6 31.6 12.2 31 11.6 Z" fill="${mint}"/>
    <path d="M37.6 10.9 Q42 10.6 46.2 9" fill="none" stroke="${mo}" stroke-width="0.5"/><path d="M41.4 10.6 L42.2 10.4 L41.9 11.8 Z" fill="#fff"/>
    <path d="M35.2 5.2 L43.6 6.2 L43.2 8.6 L35 8.2 Z" fill="${fr}"/><path d="M35.8 5.8 L43 6.7 L42.7 8 L35.6 7.6 Z" fill="${cy}"/>`;
  },
};

// ---------- Bolt: the overclocked TV-bot (the wild card) ----------
// Same smooth standard. No helmet: a boxy rounded yellow CRT monitor for a head, glass screen with a glowing cyan
// face that changes expression (^o^ cruising, >_< when it gets hairy, blinks, glitches), knobs on the side, and
// a spinning copper Tesla coil on top throwing little yellow sparks. Red crash-test stunt suit with white side
// stripes, black / yellow crash-test markers, a hazard-striped belt, two batteries with loose red / blue wires.
// From behind: twin booster pipes strapped to his back that puff sparks when he accelerates.
const B = {
  yellow: 0xfacc15, yellowDark: 0xca8a04, bezel: 0x1e293b, screen: 0x0b2530, face: 0x22d3ee, copper: 0xc2733c,
  copperLight: 0xf0a76a, spark: 0xfde047, flame: 0xfb923c, suit: 0xe8322f, suitDark: 0xb91c1c, stripe: 0xf8fafc,
  black: 0x111318, metal: 0x94a3b8, metalDark: 0x475569, battery: 0x16a34a, wireR: 0xef4444, wireB: 0x3b82f6, glove: 0xf8fafc,
};
/** A box with rounded edges (radius r) and exact smooth normals. */
function roundedBox(w, h, d, r, seg = 16) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const p = g.attributes.position, nrm = g.attributes.normal, v = new THREE.Vector3(), c = new THREE.Vector3();
  const ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r;
  if (Math.min(ix, iy, iz) < 0) throw new Error('roundedBox: r is more than half a side');
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(clamp(v.x, -ix, ix), clamp(v.y, -iy, iy), clamp(v.z, -iz, iz));
    const n = v.sub(c).normalize();
    nrm.setXYZ(i, n.x, n.y, n.z);
    p.setXYZ(i, c.x + n.x * r, c.y + n.y * r, c.z + n.z * r);
  }
  return g;
}
class Helix extends THREE.Curve {
  constructor(r, h, turns) { super(); Object.assign(this, { r, h, turns }); }
  getPoint(t, o = new THREE.Vector3()) { const a = t * this.turns * Math.PI * 2; return o.set(Math.cos(a) * this.r, t * this.h, Math.sin(a) * this.r); }
}

const BOLT = {
  smooth: true,
  gloss: { metalness: 0.55, roughness: 0.25 }, // screen glass, copper coil, pipes
  build(R, y0) {
    const { root, joint, part } = R;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const S = NOVA_SCALE;
    const hidden = 1e-4; // hide = scale down, set in update() only: a part baked at a tiny scale loses precision

    // Torso: red stunt suit, white side stripes, crash-test markers, hazard belt, batteries + loose wires
    const torso = joint(root, 0, y0 + 0.12, -0.27);
    torso.scale.setScalar(S);
    const body = new THREE.CapsuleGeometry(0.24, 0.14, 10, 32);
    body.scale(1.05, 1, 0.82);
    part(torso, body, (x, y) => mix(mix(B.suitDark, B.suit, smoothstep(-0.2, 0.1, y)), B.stripe, smoothstep(0.17, 0.19, Math.abs(x)) * smoothstep(0.235, 0.215, Math.abs(x))), 0, 0.27, 0);
    const marker = (r, x, y, z, rot) => [0, 1, 2, 3].forEach((q) => part(torso, new THREE.CircleGeometry(r, 8, q * Math.PI / 2, Math.PI / 2), q % 2 ? B.black : B.yellow, x, y, z, { rot }));
    marker(0.05, 0, 0.36, chestZ(0, 0.36) + 0.006, [0, 0, 0]);
    const belt = new THREE.TorusGeometry(0.21, 0.03, 10, 64);
    belt.rotateX(Math.PI / 2);
    belt.scale(1.13, 1, 0.9);
    part(torso, belt, (x, y, z) => mix(B.yellow, B.black, smoothstep(-0.25, 0.25, Math.sin(Math.atan2(z, x) * 14 + y * 60))), 0, 0.12, 0);
    for (const sx of [1, -1]) {
      part(torso, new THREE.SphereGeometry(0.09, 20, 14), B.suit, sx * 0.25, 0.45, 0); // shoulder
      marker(0.04, sx * 0.3, 0.46, 0, [0, sx * Math.PI / 2, 0]);
      // battery on the belt, wire up to the neck
      part(torso, new THREE.CylinderGeometry(0.035, 0.035, 0.12, 20), (x, y) => (y > 0.03 ? B.black : B.battery), sx * 0.15, 0.17, 0.2);
      part(torso, new THREE.CylinderGeometry(0.014, 0.014, 0.02, 12), B.copperLight, sx * 0.15, 0.24, 0.2);
      part(torso, sweep([[sx * 0.15, 0.25, 0.2], [sx * 0.22, 0.34, 0.22], [sx * 0.17, 0.48, 0.2], [sx * 0.07, 0.6, 0.1]], () => 0.011, 20, 8), sx > 0 ? B.wireR : B.wireB);
      // red sleeve, black cuff, chunky white glove on the wheel
      const sh = V(sx * 0.26, 0.44, 0.03);
      const hand = V(sx * WHEEL_GRIP[0], y0 + WHEEL_GRIP[1] - torso.position.y, WHEEL_GRIP[2] - torso.position.z).divideScalar(S);
      part(torso, capsuleBetween(0.062, sh, hand, 16), B.suit);
      const cuff = new THREE.TorusGeometry(0.06, 0.02, 8, 16);
      cuff.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), hand.clone().sub(sh).normalize()));
      const at = sh.clone().lerp(hand, 0.8);
      part(torso, cuff, B.black, at.x, at.y, at.z);
      part(torso, new THREE.SphereGeometry(0.08, 20, 14), B.glove, hand.x, hand.y, hand.z);
    }
    part(torso, sweep([[0.09, 0.3, 0.19], [0.13, 0.42, 0.2], [0.04, 0.6, 0.12]], () => 0.009, 16, 8), B.yellow); // a third wire
    // ribbed metal neck
    part(torso, new THREE.CylinderGeometry(0.075, 0.09, 0.14, 20), B.metalDark, 0, 0.6, 0);
    for (const y of [0.57, 0.62]) {
      const rib = new THREE.TorusGeometry(0.085, 0.014, 8, 24);
      rib.rotateX(Math.PI / 2);
      part(torso, rib, B.metal, 0, y, 0);
    }
    // twin booster pipes strapped to the back, nozzles up and back
    const puffs = [];
    for (const sx of [1, -1]) {
      const rot = [-0.28, 0, -sx * 0.08];
      part(torso, new THREE.CylinderGeometry(0.052, 0.058, 0.34, 24), (x, y) => mix(B.metalDark, B.metal, smoothstep(-0.17, 0.12, y)), sx * 0.11, 0.6, -0.25, { rot, gloss: true });
      const noz = new THREE.CylinderGeometry(0.06, 0.045, 0.07, 24, 1, true);
      noz.translate(0, 0.2, 0);
      part(torso, noz, B.black, sx * 0.11, 0.6, -0.25, { rot });
      const tip = V(0, 0.24, 0).applyEuler(new THREE.Euler(...rot)).add(V(sx * 0.11, 0.6, -0.25));
      const puff = joint(torso, tip.x, tip.y, tip.z);
      puff.rotation.set(...rot);
      for (let i = 0; i < 5; i++) { // a little starburst of spark streaks
        const a = (i / 5) * Math.PI * 2;
        part(puff, capsuleBetween(0.01, V(Math.cos(a) * 0.015, 0.01, Math.sin(a) * 0.015), V(Math.cos(a) * 0.05, 0.09 + 0.02 * (i % 2), Math.sin(a) * 0.05), 6), i % 2 ? B.spark : B.flame, 0, 0, 0, { glow: true });
      }
      part(puff, new THREE.SphereGeometry(0.03, 12, 8), B.spark, 0, 0.02, 0, { glow: true });
      puffs.push(puff);
    }
    for (const y of [0.5, 0.68]) part(torso, sweep([[-0.2, y - 0.02, -0.12], [0, y, -0.27], [0.2, y - 0.02, -0.12]], () => 0.016, 16, 8), B.black); // straps

    // Head: the CRT monitor
    const head = joint(torso, 0, 0.62, 0);
    const HC = V(0, 0.27, 0.02);
    part(head, roundedBox(0.56, 0.44, 0.42, 0.08), (x, y, z) => mix(B.yellowDark, B.yellow, smoothstep(-0.2, 0.1, y + z * 0.5)), HC.x, HC.y, HC.z);
    part(head, roundedBox(0.45, 0.34, 0.06, 0.025, 10), B.bezel, 0, HC.y, HC.z + 0.195);              // front at +0.225
    part(head, roundedBox(0.39, 0.28, 0.03, 0.012, 10), B.screen, 0, HC.y, HC.z + 0.22, { gloss: true }); // glass at +0.235
    for (const y of [0.06, -0.05]) part(head, new THREE.CylinderGeometry(0.03, 0.03, 0.04, 16), B.black, -0.285, HC.y + y, 0.1, { rot: [0, 0, Math.PI / 2] }); // knobs
    for (const z of [-0.12, -0.06, 0]) part(head, capsuleBetween(0.01, V(0.08, 0, z), V(0.2, 0, z), 6), B.yellowDark, 0, HC.y + 0.222, HC.z); // vents
    // face glyphs on the glass: two expressions, each on its own joint (shown / hidden by scale)
    const stroke = (j, a, b) => part(j, capsuleBetween(0.013, V(...a, 0), V(...b, 0), 8), B.face, 0, 0, 0, { glow: true });
    const faceZ = HC.z + 0.24;
    const happy = joint(head, 0, HC.y, faceZ), happyEyes = joint(happy, 0, 0.03, 0);
    for (const sx of [1, -1]) { stroke(happyEyes, [sx * 0.12, -0.015], [sx * 0.085, 0.02]); stroke(happyEyes, [sx * 0.085, 0.02], [sx * 0.05, -0.015]); }
    part(happy, new THREE.TorusGeometry(0.03, 0.012, 8, 24), B.face, 0, -0.065, 0, { glow: true });
    const strain = joint(head, 0, HC.y, faceZ);
    for (const sx of [1, -1]) { stroke(strain, [sx * 0.12, 0.06], [sx * 0.065, 0.035]); stroke(strain, [sx * 0.065, 0.035], [sx * 0.12, 0.01]); }
    stroke(strain, [-0.045, -0.075], [0.045, -0.075]);
    // Tesla coil: dark base, copper stalk + helix (spins), toroid top; sparks crackle off the top
    part(head, new THREE.CylinderGeometry(0.045, 0.055, 0.05, 20), B.black, 0, HC.y + 0.24, 0);
    const coil = joint(head, 0, HC.y + 0.26, 0);
    part(coil, new THREE.CylinderGeometry(0.012, 0.014, 0.3, 12), B.copper, 0, 0.15, 0, { gloss: true });
    part(coil, new THREE.TubeGeometry(new Helix(0.036, 0.2, 7), 160, 0.008, 8), B.copper, 0, 0.03, 0, { gloss: true });
    const top = new THREE.TorusGeometry(0.048, 0.022, 12, 28);
    top.rotateX(Math.PI / 2);
    part(coil, top, B.copperLight, 0, 0.31, 0, { gloss: true });
    part(coil, new THREE.SphereGeometry(0.03, 16, 12), B.copperLight, 0, 0.31, 0, { gloss: true });
    part(coil, new THREE.SphereGeometry(0.014, 10, 8), B.copper, 0.068, 0.31, 0, { gloss: true }); // a nub, so the spin shows
    const sparks = [0, 1, 2, 3].map(() => {
      const j = joint(head, 0, HC.y + 0.57, 0);
      const pts = [[0.05, 0], [0.085, 0.03], [0.11, -0.015], [0.15, 0.012], [0.17, -0.01]];
      pts.slice(1).forEach((q, i) => part(j, capsuleBetween(0.006, V(pts[i][0], pts[i][1], 0), V(q[0], q[1], 0), 6), B.spark, 0, 0, 0, { glow: true }));
      return j;
    });

    // ---- Animation hook ----
    const st = { t: 0, lean: 0, wz: 0, wzV: 0, wx: 0, wxV: 0, kick: 1, sparkT: 0, speed: 0, acc: 0, face: 0, faceHold: 0, blink: 3, glitch: 4, glitchT: 0 };
    return (dt, s) => {
      const ease = (rate) => 1 - Math.exp(-dt * rate);
      st.t += dt;
      const speed = clamp(Math.abs(s.speed), 0, 1.3), h = Math.min(dt, 1 / 30);
      st.acc = lerp(st.acc, (speed - st.speed) / Math.max(dt, 1e-3), ease(4));
      st.speed = speed;
      st.lean = lerp(st.lean, s.steer * (0.9 + 0.6 * s.drift), ease(8));
      // the head is on a loose spring and gets random kicks (wild card), more at speed or after a bump
      if ((st.kick -= dt) <= 0) {
        st.wzV += (Math.random() - 0.5) * (2 + 4 * speed);
        st.wxV += (Math.random() - 0.5) * (1 + 2 * speed);
        st.kick = 0.4 + Math.random() * 1.6;
      }
      if (s.bump) st.wzV += (Math.random() - 0.5) * 6 * dt * 10;
      st.wzV += (-st.wz * 70 - st.wzV * 5) * h; st.wz += st.wzV * h;
      st.wxV += (-st.wx * 70 - st.wxV * 5) * h; st.wx += st.wxV * h;
      torso.rotation.z = st.lean * 0.16;
      head.rotation.z = st.lean * 0.12 + st.wz * 0.25;
      head.rotation.x = -0.03 * speed + st.wx * 0.2;
      head.rotation.y = -st.lean * 0.15;

      // expression: >_< when it gets hairy, ^o^ otherwise (held a moment so it doesn't flicker), blinks
      const hairy = s.bump || s.drift > 0.5 || (Math.abs(s.steer) > 0.85 && speed > 0.4) || st.acc > 0.3 ? 1 : 0;
      st.faceHold -= dt;
      if (hairy !== st.face && st.faceHold <= 0) { st.face = hairy; st.faceHold = 0.5; }
      happy.scale.setScalar(st.face ? hidden : 1);
      strain.scale.setScalar(st.face ? 1 : hidden);
      st.blink -= dt;
      if (st.blink < -0.12) st.blink = 2 + Math.random() * 3;
      happyEyes.scale.y = st.blink < 0 ? 0.15 : 1;
      // glitch: the picture jumps sideways for a moment now and then
      if ((st.glitch -= dt) <= 0) { st.glitchT = 0.09; st.glitch = 3 + Math.random() * 5; }
      st.glitchT -= dt;
      const gx = st.glitchT > 0 ? 0.025 * Math.sign(Math.sin(st.t * 80)) : 0;
      happy.position.x = strain.position.x = gx;

      // coil spins faster with speed; sparks crackle (more at speed / on a boost)
      coil.rotation.y += dt * (4 + 14 * speed + 10 * s.boost);
      if ((st.sparkT -= dt) <= 0) {
        st.sparkT = 0.05;
        for (const j of sparks) {
          const on = Math.random() < 0.25 + 0.45 * speed + 0.3 * s.boost;
          j.scale.setScalar(on ? 0.7 + 0.6 * Math.random() : hidden);
          j.rotation.set((Math.random() - 0.5) * 0.8, Math.random() * Math.PI * 2, (Math.random() - 0.3) * 1.2);
        }
      }
      // booster pipes puff sparks while he floors it (or boosts)
      const puff = Math.max(clamp(st.acc * 5, 0, 1), s.boost);
      for (const j of puffs) {
        j.scale.setScalar(puff > 0.15 ? puff * (0.6 + 0.6 * Math.random()) : hidden);
        j.rotation.y = Math.random() * Math.PI * 2;
      }
      if (R.glow) R.glow.color.setScalar(0.88 + 0.12 * Math.random());
    };
  },
  avatar() {
    const [y, yd, bz, sc, fc, cu, cul, sp, su, st, bk, me, md, wr, wb] = [B.yellow, B.yellowDark, B.bezel, B.screen, B.face, B.copper, B.copperLight, B.spark, B.suit, B.stripe, B.black, B.metal, B.metalDark, B.wireR, B.wireB].map(css);
    return `<svg class="driver-art" viewBox="0 0 48 48" aria-hidden="true">
    <defs><linearGradient id="bolt-tv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${y}"/><stop offset="1" stop-color="${yd}"/></linearGradient></defs>
    <rect x="6.5" y="27" width="5" height="12" rx="1.6" fill="${me}" transform="rotate(-8 9 33)"/><rect x="36.5" y="27" width="5" height="12" rx="1.6" fill="${me}" transform="rotate(8 39 33)"/>
    <rect x="6.6" y="25.6" width="5.4" height="2.4" rx="0.8" fill="${bk}" transform="rotate(-8 9 33)"/><rect x="36" y="25.6" width="5.4" height="2.4" rx="0.8" fill="${bk}" transform="rotate(8 39 33)"/>
    <path d="M4 48 C4 39 11 35 24 35 C37 35 44 39 44 48 Z" fill="${su}" stroke="#fff" stroke-opacity="0.25"/>
    <path d="M9.5 39 L11 48 M38.5 39 L37 48" stroke="${st}" stroke-width="1.6"/>
    <path d="M24 42 V38 A4 4 0 0 1 28 42 Z M24 42 V46 A4 4 0 0 1 20 42 Z" fill="${y}"/><path d="M24 42 H28 A4 4 0 0 1 24 46 Z M24 42 H20 A4 4 0 0 1 24 38 Z" fill="${bk}"/>
    <path d="M15 47 Q13 40 21 35.6 M33 47 Q36 40 27 35.6" fill="none" stroke-width="1" stroke-linecap="round" stroke="${wr}"/><path d="M33 47 Q36 40 27 35.6" fill="none" stroke="${wb}" stroke-width="1"/>
    <rect x="20.5" y="31" width="7" height="5" rx="1" fill="${md}"/><path d="M20.5 32.6 H27.5 M20.5 34.4 H27.5" stroke="${me}" stroke-width="0.8"/>
    <rect x="7" y="10.5" width="34" height="22" rx="5.5" fill="url(#bolt-tv)" stroke="#fff" stroke-opacity="0.35" stroke-width="0.6"/>
    <rect x="10" y="13.3" width="28" height="16.4" rx="3.4" fill="${bz}"/>
    <rect x="11.4" y="14.6" width="25.2" height="13.8" rx="2.6" fill="${sc}"/>
    <path d="M15.5 22.4 L18.2 19.2 L20.9 22.4 M27.1 22.4 L29.8 19.2 L32.5 22.4" fill="none" stroke="${fc}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="24" cy="25.4" r="1.7" fill="none" stroke="${fc}" stroke-width="1.3"/>
    <path d="M13 16.4 Q16 15.4 19 15.6" stroke="#fff" stroke-opacity="0.35" stroke-width="0.9" fill="none" stroke-linecap="round"/>
    <rect x="21.6" y="8.4" width="4.8" height="2.4" rx="0.8" fill="${bk}"/>
    <path d="M24 8.4 V3" stroke="${cu}" stroke-width="1"/>
    <path d="M22.3 8 L25.7 7.1 L22.3 6.2 L25.7 5.3 L22.3 4.4 L25.7 3.5" fill="none" stroke="${cu}" stroke-width="0.8"/>
    <circle cx="24" cy="2.6" r="1.9" fill="${cul}"/>
    <path d="M26.4 2 L29 3.2 L28 4.1 L31.2 5.4 M21.6 1.8 L19.2 0.8 L19.8 2.8 L16.8 3.2" fill="none" stroke="${sp}" stroke-width="0.8" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
  },

  kartArt() {
    const [y, yd, bz, fc, cu, cul, sp, fl, su, st, gl, me, bk] = [B.yellow, B.yellowDark, B.bezel, B.face, B.copper, B.copperLight, B.spark, B.flame, B.suit, B.stripe, B.glove, B.metal, B.black].map(css);
    return `<rect x="24.4" y="5.6" width="3.4" height="11" rx="1.2" fill="${me}" transform="rotate(-16 26 11)"/>
    <path d="M22.6 4.6 L23.4 1.6 L24.4 4 L26 2 L25.6 5" fill="none" stroke="${fl}" stroke-width="0.8" stroke-linejoin="round"/>
    <rect x="28" y="14" width="11" height="9" rx="3" fill="${su}"/><path d="M28.4 17.4 H38.6" stroke="${st}" stroke-width="0.8"/>
    <path d="M33.5 16.5 L42 19" stroke="${su}" stroke-width="2.6" stroke-linecap="round"/><circle cx="42.6" cy="19.2" r="1.9" fill="${gl}"/>
    <rect x="33" y="12.2" width="3" height="2.4" fill="${bk}"/>
    <rect x="29" y="3.4" width="15" height="9.4" rx="2.6" fill="${y}"/><rect x="29" y="10" width="15" height="2.8" rx="1.2" fill="${yd}"/>
    <rect x="42.2" y="4.4" width="2.6" height="7.4" rx="1" fill="${bz}"/><path d="M43.5 6.4 V8.6" stroke="${fc}" stroke-width="0.8" stroke-linecap="round"/>
    <circle cx="31.6" cy="9.6" r="0.9" fill="${bk}"/>
    <path d="M36.5 3.4 V-0.4" stroke="${cu}" stroke-width="0.8"/><circle cx="36.5" cy="0.6" r="1.3" fill="${cul}"/>
    <path d="M38 0.6 L39.6 1.6 L39 2.4 L41 3" fill="none" stroke="${sp}" stroke-width="0.6" stroke-linejoin="round"/>`;
  },
};

// ---------- Koda: the red panda (the drifter) ----------
// Same smooth standard. No helmet: a round rust head with cream bandit markings (muzzle, cheeks, brow spots),
// dark tear marks, shiny black eyes, rounded white-rimmed ears, and a red headband tied at the back with two
// streaming ends that flutter at speed. Bamboo-green bomber jacket with cream ribbed knit collar, cuffs and hem,
// dark paws. From behind: a huge fluffy ring-striped tail that curls up the right side of the seat like a
// paintbrush, on a spring so it swings out in drifts.
const K = {
  rust: 0xc2410c, rustDark: 0x9a3412, cream: 0xfff7ed, creamShade: 0xf5dcc0, mask: 0x7c2d12, dark: 0x1c1917,
  paw: 0x3b1a0a, band: 0xdc2626, bandDark: 0xa51d1d, jacket: 0x6f8f3a, jacketLight: 0x9cb85e, knit: 0xfef3c7,
  ring: 0xfcd9a8,
};

const KODA = {
  smooth: true,
  build(R, y0) {
    const { root, joint, part } = R;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const S = NOVA_SCALE;

    // Torso: bamboo bomber jacket (soft vertical bamboo stripes), ribbed knit collar + hem, zip
    const torso = joint(root, 0, y0 + 0.12, -0.27);
    torso.scale.setScalar(S);
    const body = new THREE.CapsuleGeometry(0.24, 0.14, 10, 32);
    body.scale(1.08, 1, 0.84);
    part(torso, body, (x, y, z) => mix(K.jacket, K.jacketLight, 0.35 * (0.5 + 0.5 * Math.sin(Math.atan2(x, z) * 9)) + 0.15 * smoothstep(0, 0.3, y)), 0, 0.27, 0);
    part(torso, new THREE.CapsuleGeometry(0.01, 0.26, 2, 6), 0x3f4a2a, 0, 0.27, chestZ(0, 0.27) + 0.012); // zip
    const knit = (r, tube, y, sx = 1.08, sz = 0.86) => {
      const g = new THREE.TorusGeometry(r, tube, 10, 48);
      g.rotateX(Math.PI / 2);
      g.scale(sx, 1, sz);
      part(torso, g, (x, yy) => mix(K.knit, K.rust, smoothstep(0.012, 0.006, Math.abs(yy)) * 0.9), 0, y, 0);
    };
    knit(0.15, 0.045, 0.58, 1, 1);    // collar (a rust stripe round the middle of the rib)
    knit(0.205, 0.035, 0.06);          // hem
    for (const sx of [1, -1]) {
      part(torso, new THREE.SphereGeometry(0.095, 20, 14), K.jacket, sx * 0.25, 0.45, 0); // shoulder
      const sh = V(sx * 0.26, 0.44, 0.03);
      const hand = V(sx * WHEEL_GRIP[0], y0 + WHEEL_GRIP[1] - torso.position.y, WHEEL_GRIP[2] - torso.position.z).divideScalar(S);
      part(torso, capsuleBetween(0.064, sh, hand, 16), K.jacket);
      const cuff = new THREE.TorusGeometry(0.062, 0.024, 8, 18);
      cuff.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), hand.clone().sub(sh).normalize()));
      const at = sh.clone().lerp(hand, 0.8);
      part(torso, cuff, K.knit, at.x, at.y, at.z);
      const paw = new THREE.SphereGeometry(0.075, 20, 14);
      paw.scale(1, 0.85, 1.1);
      part(torso, paw, K.paw, hand.x, hand.y, hand.z);
    }
    part(torso, new THREE.CylinderGeometry(0.12, 0.14, 0.14, 24, 1, true), K.rust, 0, 0.6, 0); // neck

    // Head: round rust head, cream muzzle + cheeks + brow spots, dark tear marks, glossy eyes
    const head = joint(torso, 0, 0.62, 0);
    head.scale.setScalar(1.06);
    const HY = 0.22, A = [0.3, 0.265, 0.27];
    const skull = new THREE.SphereGeometry(1, 40, 28);
    skull.scale(...A);
    part(head, skull, (x, y, z) => mix(K.rust, K.rustDark, clamp(smoothstep(0.12, 0.27, y) * 0.35 + smoothstep(0, -0.25, z) * 0.45, 0, 1)), 0, HY, 0);
    const fz = (x, y) => A[2] * Math.sqrt(Math.max(0, 1 - (x / A[0]) ** 2 - ((y - HY) / A[1]) ** 2)); // front of the head
    const muzzle = new THREE.SphereGeometry(0.12, 28, 18);
    muzzle.scale(1.3, 0.85, 0.9);
    part(head, muzzle, (x, y) => mix(K.creamShade, K.cream, smoothstep(-0.08, 0.04, y)), 0, 0.13, fz(0, 0.13) - 0.04);
    const nose = new THREE.SphereGeometry(0.036, 16, 12);
    nose.scale(1.35, 0.9, 0.9);
    part(head, nose, K.dark, 0, 0.17, 0.318, { gloss: true });
    for (const sx of [1, -1]) {
      const smile = new THREE.TorusGeometry(0.02, 0.0055, 6, 14, Math.PI);
      smile.rotateZ(Math.PI);
      part(head, smile, K.dark, sx * 0.02, 0.112, 0.31); // the little 'w' mouth
      const cheek = new THREE.SphereGeometry(0.1, 24, 16);
      cheek.scale(1, 0.85, 0.5);
      part(head, cheek, K.cream, sx * 0.19, 0.13, fz(0.19, 0.13) - 0.02, { rot: [0, sx * 0.65, 0] });
      const brow = new THREE.SphereGeometry(0.04, 18, 12);
      brow.scale(1.3, 0.8, 0.5);
      part(head, brow, K.cream, sx * 0.1, 0.33, fz(0.1, 0.33) - 0.004, { rot: [-0.4, sx * 0.35, 0] });
      const tear = new THREE.SphereGeometry(0.035, 16, 12);
      tear.scale(0.65, 1.6, 0.4);
      part(head, tear, K.mask, sx * 0.135, 0.19, fz(0.135, 0.19) - 0.006, { rot: [0, sx * 0.45, sx * 0.4] });
      part(head, new THREE.SphereGeometry(0.04, 20, 14), K.dark, sx * 0.1, 0.245, fz(0.1, 0.245) - 0.014, { gloss: true });
      part(head, new THREE.SphereGeometry(0.012, 10, 8), 0xffffff, sx * 0.1 + 0.012, 0.262, fz(0.1, 0.245) + 0.02, { glow: true });
    }
    // rounded ears with cream rims and dark insides
    const ears = [1, -1].map((sx) => {
      const ear = joint(head, sx * 0.2, 0.42, -0.03);
      ear.rotation.z = -sx * 0.5;
      const outer = new THREE.SphereGeometry(0.1, 24, 16);
      outer.scale(1, 1.1, 0.42);
      outer.translate(0, 0.08, 0);
      part(ear, outer, (x, y) => mix(K.rust, K.cream, smoothstep(0.072, 0.092, Math.hypot(x, (y - 0.08) / 1.1))));
      const inner = new THREE.SphereGeometry(0.066, 20, 14);
      inner.scale(1, 1.1, 0.3);
      part(ear, inner, K.mask, 0, 0.085, 0.022);
      return { bone: ear, sx, twitch: 0, next: 1 + Math.random() * 3 };
    });
    // red headband round the forehead, knot at the back, two streaming ends (they flutter at speed)
    const band = new THREE.TorusGeometry(0.236, 0.032, 12, 56);
    band.rotateX(Math.PI / 2);
    band.scale(1.08, 1, 0.98);
    part(head, band, K.band, 0, 0.375, -0.005, { rot: [-0.08, 0, 0] });
    part(head, new THREE.SphereGeometry(0.045, 16, 12), K.bandDark, 0, 0.385, -0.235);
    const tails = [1, -1].map((sx) => {
      const j = joint(head, 0, 0.385, -0.25);
      const end = sweep([[0, 0, 0], [sx * 0.05, -0.02, -0.08], [sx * 0.08, -0.06, -0.17], [sx * 0.1, -0.08, -0.26]], (u) => lerp(0.04, 0.022, u), 16, 10);
      end.scale(1, 0.4, 1);
      part(j, end, (x) => mix(K.band, K.bandDark, Math.abs(x) / 0.1));
      return { j, sx };
    });

    // Tail: huge, fluffy, ring-striped, curling up the right side of the seat; rings follow the tube's length
    const tail = joint(root, 0, y0 + 0.6, -0.7);
    tail.scale.setScalar(S);
    const tailPts = [[0, 0, 0.06], [-0.03, -0.02, -0.12], [-0.17, 0, -0.26], [-0.34, 0.12, -0.25], [-0.43, 0.3, -0.13], [-0.43, 0.46, 0], [-0.37, 0.57, 0.08]];
    const tailCurve = new THREE.CatmullRomCurve3(tailPts.map((q) => new THREE.Vector3(...q)));
    const samples = tailCurve.getSpacedPoints(120);
    const along = (x, y, z) => { // u of the nearest point on the tail's spine
      let best = 0, bd = Infinity;
      samples.forEach((q, i) => { const d = (q.x - x) ** 2 + (q.y - y) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; best = i; } });
      return best / 120;
    };
    const fur = (u, v) => (0.15 * Math.sin(Math.PI * u) ** 0.6 + 0.055 * (1 - u) + 0.003) * (1 + 0.07 * Math.sin(v * Math.PI * 18 + u * 60) * Math.sin(u * 70));
    part(tail, sweep(tailPts, fur, 64, 24), (x, y, z) => {
      const u = along(x, y, z);
      const ring = smoothstep(0.5, 0.75, 0.5 + 0.5 * Math.cos(u * Math.PI * 2 * 3.5));
      return mix(mix(K.rust, K.ring, ring * smoothstep(0.08, 0.16, u)), K.rustDark, smoothstep(0.9, 0.99, u) * 0.7);
    });

    // ---- Animation hook ----
    const st = { t: 0, lean: 0, sway: 0, swayV: 0 };
    return (dt, s) => {
      const ease = (rate) => 1 - Math.exp(-dt * rate);
      st.t += dt;
      const speed = clamp(Math.abs(s.speed), 0, 1.3), h = Math.min(dt, 1 / 30);
      st.lean = lerp(st.lean, s.steer * (0.8 + 0.6 * s.drift), ease(7));
      // the big tail is a soft spring that swings out hard in a drift
      const want = st.lean * (0.5 + 1.3 * s.drift);
      st.swayV += ((want - st.sway) * 30 - st.swayV * 4.5) * h;
      st.sway += st.swayV * h;
      torso.rotation.z = st.lean * 0.13;
      head.rotation.z = st.lean * 0.1;
      head.rotation.y = -st.lean * 0.2;
      head.rotation.x = -0.05 * speed;
      tail.rotation.y = -st.sway * 0.22 + Math.sin(st.t * 1.3) * 0.04;
      tail.rotation.z = st.sway * 0.12;
      // ears: little twitches when stopped, back with speed
      const idle = 1 - clamp(speed * 5, 0, 1);
      for (const e of ears) {
        e.next -= dt;
        if (e.next <= 0) { e.twitch = 1; e.next = 1.2 + Math.random() * 3.5; }
        e.twitch = Math.max(0, e.twitch - dt * 5);
        const tw = Math.sin(e.twitch * Math.PI) * idle;
        e.bone.rotation.x = -0.1 - 0.4 * speed + tw * 0.25;
        e.bone.rotation.z = -e.sx * (0.5 + tw * 0.2);
      }
      // headband ends stream back and flutter
      for (const { j, sx } of tails) {
        j.rotation.x = 0.25 - 0.45 * speed + Math.sin(st.t * 13 + sx) * 0.1 * speed;
        j.rotation.y = Math.sin(st.t * 9 + sx * 2) * 0.15 * speed;
      }
    };
  },
  avatar() {
    const [ru, rd, cr, cs, mk, dk, bd, bdd, jk, jl, kn, rg] = [K.rust, K.rustDark, K.cream, K.creamShade, K.mask, K.dark, K.band, K.bandDark, K.jacket, K.jacketLight, K.knit, K.ring].map(css);
    return `<svg class="driver-art" viewBox="0 0 48 48" aria-hidden="true">
    <defs><linearGradient id="koda-fur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${rd}"/><stop offset="0.6" stop-color="${ru}"/></linearGradient>
    <clipPath id="koda-tail"><path d="M1 48 C-1.5 38 1 26 8.5 21.5 C12 19.5 14.6 21.6 13.4 25 C9.4 30.5 8.4 38.5 10.4 48 Z"/></clipPath></defs>
    <path d="M1 48 C-1.5 38 1 26 8.5 21.5 C12 19.5 14.6 21.6 13.4 25 C9.4 30.5 8.4 38.5 10.4 48 Z" fill="${ru}"/>
    <g clip-path="url(#koda-tail)" fill="${rg}"><rect x="-2" y="25.5" width="18" height="3.4" transform="rotate(-24 6 27)"/><rect x="-2" y="33" width="18" height="3.4" transform="rotate(-10 6 34)"/><rect x="-2" y="41" width="18" height="3.4"/></g>
    <path d="M5 48 C5 39.5 12 35.5 24 35.5 C36 35.5 43 39.5 43 48 Z" fill="${jk}" stroke="#fff" stroke-opacity="0.2"/>
    <path d="M12 41 V48 M18 37.6 V48 M30 37.6 V48 M36 41 V48" stroke="${jl}" stroke-opacity="0.6" stroke-width="1.2"/>
    <path d="M24 38.4 V48" stroke="#3f4a2a" stroke-width="1"/>
    <path d="M14.6 35.8 Q24 40.6 33.4 35.8 L32.4 33.2 Q24 37.6 15.6 33.2 Z" fill="${kn}"/><path d="M15.2 34.6 Q24 39 32.8 34.6" fill="none" stroke="${ru}" stroke-width="0.8"/>
    <path d="M10.2 15.6 C7.4 9.4 8.6 4.6 12.8 4.2 C16.6 4 19.2 7.2 19.8 10.6 Z M37.8 15.6 C40.6 9.4 39.4 4.6 35.2 4.2 C31.4 4 28.8 7.2 28.2 10.6 Z" fill="${cr}"/>
    <path d="M11.8 13.4 C10.6 9.6 11.4 6.8 13.4 6.6 C15.6 6.6 17.2 8.6 17.6 10.8 Z M36.2 13.4 C37.4 9.6 36.6 6.8 34.6 6.6 C32.4 6.6 30.8 8.6 30.4 10.8 Z" fill="${mk}"/>
    <ellipse cx="24" cy="21.5" rx="14.6" ry="13" fill="url(#koda-fur)"/>
    <path d="M38.2 15 Q43 12.6 47.6 15 Q44 16.4 41 17.6 Z M38.6 17.2 Q43.2 18.2 46.6 21.8 Q42.6 21.4 39.4 19.8 Z" fill="${bdd}"/>
    <path d="M9.6 15.2 Q24 9.8 38.4 15.2 L38.9 18.6 Q24 13.4 9.1 18.6 Z" fill="${bd}"/>
    <path d="M9.8 21.4 Q10.8 29 18.4 29.6 Q15.4 25.8 15.6 21.6 Q12.6 23 9.8 21.4 Z M38.2 21.4 Q37.2 29 29.6 29.6 Q32.6 25.8 32.4 21.6 Q35.4 23 38.2 21.4 Z" fill="${cr}"/>
    <ellipse cx="19" cy="17.8" rx="2.5" ry="1.4" fill="${cr}"/><ellipse cx="29" cy="17.8" rx="2.5" ry="1.4" fill="${cr}"/>
    <path d="M17.8 23.6 Q16.4 26.2 17.2 28.6 M30.2 23.6 Q31.6 26.2 30.8 28.6" fill="none" stroke="${mk}" stroke-width="1.6" stroke-linecap="round"/>
    <ellipse cx="24" cy="28" rx="6.6" ry="5" fill="${cs}"/><ellipse cx="24" cy="27.4" rx="6" ry="4.4" fill="${cr}"/>
    <circle cx="19" cy="21.6" r="2.3" fill="${dk}"/><circle cx="29" cy="21.6" r="2.3" fill="${dk}"/>
    <circle cx="19.8" cy="20.8" r="0.75" fill="#fff"/><circle cx="29.8" cy="20.8" r="0.75" fill="#fff"/>
    <ellipse cx="24" cy="25.4" rx="2.1" ry="1.4" fill="${dk}"/>
    <path d="M22 27.6 Q23 28.7 24 27.6 Q25 28.7 26 27.6" fill="none" stroke="${dk}" stroke-width="0.8" stroke-linecap="round"/>
  </svg>`;
  },

  kartArt() {
    const [ru, rd, cr, mk, dk, bd, jk, kn, rg, pw] = [K.rust, K.rustDark, K.cream, K.mask, K.dark, K.band, K.jacket, K.knit, K.ring, K.paw].map(css);
    return `<defs><clipPath id="koda-ktail"><path d="M28 18.4 C20 19.6 15.6 15.2 16 9.6 C16.4 4.8 20 2 24.4 3 C21.4 5.4 21 9 22.4 12 C23.8 14.6 26.2 15 28.4 14.6 Z"/></clipPath></defs>
    <path d="M28 18.4 C20 19.6 15.6 15.2 16 9.6 C16.4 4.8 20 2 24.4 3 C21.4 5.4 21 9 22.4 12 C23.8 14.6 26.2 15 28.4 14.6 Z" fill="${ru}"/>
    <g clip-path="url(#koda-ktail)" fill="${rg}"><rect x="14" y="5" width="12" height="2.2" transform="rotate(-30 20 6)"/><rect x="14" y="10" width="10" height="2.2" transform="rotate(10 19 11)"/><rect x="20" y="14.6" width="6" height="6" /></g>
    <path d="M23.6 3.2 C22.6 3.6 22 4.4 21.8 5.2 C23 5 24 4.2 24.4 3 Z" fill="${rd}"/>
    <rect x="28" y="14" width="11" height="9" rx="3" fill="${jk}"/><rect x="28" y="13.4" width="8" height="2" rx="1" fill="${kn}"/>
    <path d="M33.5 16.5 L42 19" stroke="${jk}" stroke-width="2.8" stroke-linecap="round"/><circle cx="42.6" cy="19.2" r="1.7" fill="${pw}"/>
    <path d="M31 3.6 C30.2 1.4 31 -0.2 32.8 0.2 C34.4 0.6 35 2 34.8 3.4 Z" fill="${cr}"/><path d="M31.8 3.2 C31.4 1.8 31.8 0.9 32.8 1.1 C33.8 1.3 34 2.2 33.9 3.1 Z" fill="${mk}"/>
    <circle cx="34.6" cy="8.6" r="5.6" fill="${ru}"/>
    <path d="M38.4 8.4 Q42.6 8 43 10.4 Q42.6 12.6 39.2 12.6 Q37.4 11.4 38.4 8.4 Z" fill="${cr}"/><circle cx="42.8" cy="9.8" r="0.9" fill="${dk}"/>
    <path d="M35.4 10.2 Q36.6 13 39.6 13.2 Q36.6 14.2 34.6 12.6 Z" fill="${cr}"/>
    <circle cx="38.2" cy="7" r="0.95" fill="${dk}"/><ellipse cx="37.6" cy="5.2" rx="1.2" ry="0.6" fill="${cr}"/>
    <path d="M29.2 6.2 Q34 3.6 39.6 5.6" fill="none" stroke="${bd}" stroke-width="1.6"/>
    <path d="M29.6 6 Q26.4 5 24.6 6.6 Q27 7.2 29.4 7.6 Z" fill="${bd}"/>`;
  },
};

// ---------- Pip: the penguin chick (steady) ----------
// No helmet: a round black-and-white emperor-chick puffball in an oversized cream / grey striped knit sweater,
// pink knit beanie with a huge fluffy white pom-pom (the highest point: it bobs with every change of speed or
// direction), oversized brass aviator goggles over the eyes and beak. Short flippers on the wheel. 0.75x the
// standard driver, so he sits on a thick brown corduroy booster cushion to see over the wheel.
const P = {
  black: 0x1f2229, blackSoft: 0x2f333c, white: 0xf8fafc, down: 0x9ca3af, beak: 0x30343c, feet: 0x52525b,
  cream: 0xf5ecd7, grey: 0xc9ccd3, pink: 0xf472b6, pinkDark: 0xdb2777, pom: 0xfdfdfd, pomShade: 0xd9dde4,
  brass: 0xc8963e, lens: 0x2f6470, strap: 0x6b4423, cord: 0x8b5a2b, cordDark: 0x5e3a18,
};
const PIP_SCALE = 0.75; // x the standard driver

const PIP = {
  smooth: true,
  gloss: { metalness: 0.75, roughness: 0.25 }, // brass goggles + lenses
  build(R, y0) {
    const { root, joint, part } = R;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const S = NOVA_SCALE * PIP_SCALE;

    // Booster cushion on the seat (full size, not scaled with Pip): brown corduroy ridges running front to back,
    // darker welted edges
    const CW = 0.6, CH = 0.19, CD = 0.55;
    part(root, roundedBox(CW, CH, CD, 0.05, 24), (x, y, z) => {
      const ridge = 0.5 + 0.5 * Math.cos((x / 0.06) * Math.PI * 2);
      const edge = Math.max(smoothstep(CW / 2 - 0.045, CW / 2, Math.abs(x)), smoothstep(CD / 2 - 0.045, CD / 2, Math.abs(z)), smoothstep(CH / 2 - 0.03, CH / 2, Math.abs(y)) * 0.4);
      return mix(mix(P.cord, P.cordDark, 0.35 * ridge), P.cordDark, edge * 0.7);
    }, 0, y0 + 0.115, -0.2);

    // Torso: the round chick body inside the sweater (pivot at the bottom, on the cushion)
    const torso = joint(root, 0, y0 + 0.2, -0.17);
    torso.scale.setScalar(S);
    const sweater = (x, y, z) => { // y in torso space: soft horizontal stripes + vertical knit ribs
      const stripe = smoothstep(-0.25, 0.25, Math.sin((y / 0.1) * Math.PI * 2));
      const rib = 0.5 + 0.5 * Math.sin(Math.atan2(x, z) * 24);
      return mix(mix(P.cream, P.grey, stripe), 0x8e8a80, 0.08 * rib);
    };
    const BY = 0.22, hemY = BY - 0.15;
    const body = new THREE.SphereGeometry(0.26, 64, 40);
    body.scale(1.1, 0.83, 1);
    part(torso, body, (x, y, z) => (y + BY > hemY ? sweater(x, y + BY, z) : mix(P.down, P.blackSoft, smoothstep(-0.18, -0.215, y))), 0, BY, 0);
    const ring = (r, tube, y, sx, sz, color) => {
      const g = new THREE.TorusGeometry(r, tube, 10, 48);
      g.rotateX(Math.PI / 2);
      g.scale(sx, 1, sz);
      part(torso, g, color, 0, y, 0);
    };
    const knitRib = (x, y, z) => mix(P.cream, 0xb9b3a5, 0.25 * (0.5 + 0.5 * Math.sin(Math.atan2(x, z) * 30)));
    ring(0.2, 0.032, hemY, 1.3, 1.2, knitRib);     // ribbed hem
    ring(0.17, 0.05, 0.38, 1.05, 1, knitRib);      // rolled turtleneck where the head sits
    // little grey feet poking out under the sweater
    for (const sx of [1, -1]) {
      const foot = new THREE.SphereGeometry(0.06, 20, 12);
      foot.scale(1, 0.45, 1.4);
      part(torso, foot, P.feet, sx * 0.09, 0.03, 0.2, { rot: [0, sx * 0.25, 0] });
    }
    // flipper arms: short striped sleeves, ribbed cuffs, black flippers wrapped round the wheel
    const toLocal = (x, y, z) => V(x, y0 + y - torso.position.y, z - torso.position.z).divideScalar(S);
    for (const sx of [1, -1]) {
      const sh = V(sx * 0.25, 0.27, 0.05);
      const hand = toLocal(sx * WHEEL_GRIP[0], WHEEL_GRIP[1], WHEEL_GRIP[2]);
      const wrist = sh.clone().lerp(hand, 0.55);
      part(torso, capsuleBetween(0.062, sh, wrist, 20), sweater);
      const dir = hand.clone().sub(sh).normalize();
      const cuff = new THREE.TorusGeometry(0.055, 0.022, 8, 20);
      cuff.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir));
      part(torso, cuff, knitRib, wrist.x, wrist.y, wrist.z);
      const flip = new THREE.SphereGeometry(1, 24, 14);
      flip.scale(0.034, 0.062, 0.12);
      flip.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir));
      const at = wrist.clone().lerp(hand, 0.62);
      part(torso, flip, P.black, at.x, at.y, at.z);
    }

    // Head: black with the white face mask; the goggles, the beanie and the pom-pom
    const head = joint(torso, 0, 0.36, 0);
    const HY = 0.2, HA = [0.25, 0.235, 0.235]; // a big chick head
    const skull = new THREE.SphereGeometry(1, 48, 32);
    skull.scale(...HA);
    part(head, skull, (x, y, z) => {
      const lobe = Math.min(((Math.abs(x) - 0.09) / 0.12) ** 2 + ((y - 0.01) / 0.12) ** 2, ((Math.abs(x) - 0.025) / 0.085) ** 2 + ((y + 0.08) / 0.085) ** 2);
      const white = smoothstep(1.15, 0.85, lobe) * smoothstep(-0.02, 0.06, z);
      return mix(P.black, P.white, white);
    }, 0, HY, 0);
    const fz = (x, y) => HA[2] * Math.sqrt(Math.max(0, 1 - (x / HA[0]) ** 2 - ((y - HY) / HA[1]) ** 2));
    const beak = new THREE.ConeGeometry(0.032, 0.085, 20);
    beak.rotateX(Math.PI / 2 + 0.25);
    part(head, beak, P.beak, 0, HY - 0.06, fz(0, HY - 0.06) + 0.02);
    // oversized brass aviator goggles on a leather strap
    const GY = HY + 0.035;
    const strap = new THREE.TorusGeometry(0.25, 0.02, 10, 56);
    strap.rotateX(Math.PI / 2);
    part(head, strap, P.strap, 0, GY, -0.005);
    for (const sx of [1, -1]) {
      const at = V(sx * 0.1, GY, fz(sx * 0.1, GY) + 0.018);
      part(head, new THREE.TorusGeometry(0.078, 0.022, 14, 36), P.brass, at.x, at.y, at.z, { rot: [0, sx * 0.42, 0], gloss: true });
      const lens = new THREE.SphereGeometry(0.076, 28, 16);
      lens.scale(1, 1, 0.35);
      part(head, lens, (x, y) => mix(P.lens, 0x9fd3dc, smoothstep(0.02, 0.06, y - x * sx * 0.4) * 0.6), at.x, at.y, at.z, { rot: [0, sx * 0.42, 0], gloss: true });
    }
    const bridge = new THREE.CapsuleGeometry(0.014, 0.04, 4, 10);
    bridge.rotateZ(Math.PI / 2);
    part(head, bridge, P.brass, 0, GY + 0.01, fz(0, GY) + 0.03, { gloss: true });
    // pink knit beanie (ribs) + folded cuff
    const BR = 0.258, BS = 1.12, cap = Math.PI * 0.36;
    const beanie = new THREE.SphereGeometry(BR, 56, 20, 0, Math.PI * 2, 0, cap);
    beanie.scale(1, BS, 1);
    part(head, beanie, (x, y, z) => mix(P.pink, P.pinkDark, 0.3 * (0.5 + 0.5 * Math.sin(Math.atan2(x, z) * 22)) + 0.15 * smoothstep(0.2, 0.05, y)), 0, HY, 0);
    const cuff = new THREE.TorusGeometry(BR * Math.sin(cap) - 0.004, 0.03, 12, 56);
    cuff.rotateX(Math.PI / 2);
    part(head, cuff, (x, y, z) => mix(P.pinkDark, P.pink, 0.45 * (0.5 + 0.5 * Math.sin(Math.atan2(x, z) * 28))), 0, HY + BR * Math.cos(cap) * BS, 0);
    // the giant pom-pom on its own joint (bobs)
    const pom = joint(head, 0, HY + BR * BS - 0.02, -0.01);
    const ball = fluff(new THREE.SphereGeometry(0.16, 72, 48), 0.009, 110);
    ball.translate(0, 0.13, 0);
    part(pom, ball, (x, y) => mix(P.pomShade, P.pom, smoothstep(0.02, 0.18, y)));

    // ---- Animation hook ----
    const st = { t: 0, lean: 0, speed: 0, px: 0, pz: 0, vx: 0, vz: 0, nod: 0 };
    return (dt, s) => {
      const ease = (rate) => 1 - Math.exp(-dt * rate);
      const h = Math.min(dt, 1 / 30);
      st.t += dt;
      const speed = clamp(Math.abs(s.speed), 0, 1.3);
      const accel = h > 0 ? (speed - st.speed) / h : 0;
      st.speed = speed;
      st.lean = lerp(st.lean, s.steer * (0.8 + 0.5 * s.drift), ease(7));
      // careful little driver: small lean, head tucked in at speed, a tiny breathing bounce
      torso.rotation.z = st.lean * 0.1;
      torso.scale.set(S, S * (1 + 0.015 * Math.sin(st.t * 2.4)), S);
      head.rotation.z = st.lean * 0.12;
      head.rotation.y = -st.lean * 0.15;
      const bump = s.bump || 0;
      st.nod = lerp(st.nod, -0.06 * speed + 0.05 * bump, ease(6));
      head.rotation.x = st.nod;
      // the pom-pom: a springy weight. Speeding up throws it back, braking forward, turns sideways;
      // road buzz and bumps keep it bouncing
      const fx = -clamp(accel, -3, 3) * 0.25 + bump * 2 * Math.sin(st.t * 31) + speed * 0.25 * Math.sin(st.t * 17);
      const fz2 = -st.lean * (1.2 + 0.8 * s.drift);
      st.vx += ((fx - st.px) * 70 - st.vx * 5) * h;
      st.px += st.vx * h;
      st.vz += ((fz2 - st.pz) * 70 - st.vz * 5) * h;
      st.pz += st.vz * h;
      pom.rotation.x = clamp(-0.1 * speed + st.px * 0.5, -0.9, 0.9);
      pom.rotation.z = clamp(st.pz * 0.35, -0.9, 0.9);
    };
  },
  avatar() {
    const [bk, wh, cr, gr, pk, pd, pm, br, ln, st, bkS] = [P.black, P.white, P.cream, P.grey, P.pink, P.pinkDark, P.pom, P.brass, P.lens, P.strap, P.blackSoft].map(css);
    return `<svg class="driver-art" viewBox="0 0 48 48" aria-hidden="true">
    <defs><clipPath id="pip-sw"><path d="M8 48 C8 39 14 35 24 35 C34 35 40 39 40 48 Z"/></clipPath></defs>
    <path d="M8 48 C8 39 14 35 24 35 C34 35 40 39 40 48 Z" fill="${cr}"/>
    <g clip-path="url(#pip-sw)" fill="${gr}"><rect x="0" y="38.5" width="48" height="3"/><rect x="0" y="44.5" width="48" height="3"/></g>
    <ellipse cx="24" cy="35.4" rx="9.4" ry="2.8" fill="${cr}" stroke="#b9b3a5" stroke-width="0.6"/>
    <ellipse cx="24" cy="26" rx="12.4" ry="11.2" fill="${bk}"/>
    <path d="M13.8 26.5 C13.6 21 17.6 18.6 21.4 20.6 Q24 22 26.6 20.6 C30.4 18.6 34.4 21 34.2 26.5 C33.8 32.6 28.6 35.2 24 35.2 C19.4 35.2 14.2 32.6 13.8 26.5 Z" fill="${wh}"/>
    <path d="M22.2 28.6 L25.8 28.6 L24 32.2 Z" fill="${bkS}"/>
    <path d="M11.8 24.8 H36.2" stroke="${st}" stroke-width="2.2"/>
    <circle cx="18.6" cy="24.8" r="4.8" fill="${ln}" stroke="${br}" stroke-width="1.8"/><circle cx="29.4" cy="24.8" r="4.8" fill="${ln}" stroke="${br}" stroke-width="1.8"/>
    <path d="M16.4 23.4 Q17.6 21.8 19.6 21.8 M27.2 23.4 Q28.4 21.8 30.4 21.8" fill="none" stroke="#9fd3dc" stroke-width="1" stroke-linecap="round"/>
    <path d="M23.4 24.2 H24.6" stroke="${br}" stroke-width="1.6"/>
    <path d="M12.4 18.6 C12.4 10 17.6 6.4 24 6.4 C30.4 6.4 35.6 10 35.6 18.6 Z" fill="${pk}"/>
    <path d="M16 18.4 V9.6 M20 18.4 V7.2 M24 18.4 V6.6 M28 18.4 V7.2 M32 18.4 V9.6" stroke="${pd}" stroke-opacity="0.35" stroke-width="1"/>
    <rect x="11.2" y="16.4" width="25.6" height="4.6" rx="2.3" fill="${pd}"/>
    <circle cx="24" cy="5.2" r="5" fill="${pm}"/><circle cx="21.6" cy="3.6" r="1.6" fill="#fff"/><circle cx="26.6" cy="6.8" r="1.4" fill="#e5e7eb"/>
  </svg>`;
  },
  kartArt() {
    const [bk, wh, cr, gr, pk, pd, pm, br, ln, cd, cdd] = [P.black, P.white, P.cream, P.grey, P.pink, P.pinkDark, P.pom, P.brass, P.lens, P.cord, P.cordDark].map(css);
    return `<defs><clipPath id="pip-kbody"><circle cx="33.6" cy="14" r="5.4"/></clipPath></defs>
    <rect x="26.5" y="16.6" width="14" height="5.6" rx="1.6" fill="${cd}"/>
    <path d="M29 17 V22 M31.5 17 V22 M34 17 V22 M36.5 17 V22 M39 17 V22" stroke="${cdd}" stroke-width="0.6"/>
    <circle cx="33.6" cy="14" r="5.4" fill="${cr}"/>
    <g clip-path="url(#pip-kbody)" fill="${gr}"><rect x="27" y="10.6" width="14" height="1.6"/><rect x="27" y="14" width="14" height="1.6"/><rect x="27" y="17.4" width="14" height="1.6"/></g>
    <path d="M36 13 Q39.6 13.6 42.2 17.6" fill="none" stroke="${bk}" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="34.8" cy="7.6" r="4.4" fill="${bk}"/>
    <path d="M36.4 5.6 C39.4 5.2 40.2 9.6 37.2 10.6 C36 10 35.8 7.6 36.4 5.6 Z" fill="${wh}"/>
    <path d="M38.8 8.6 L41.2 9.4 L38.8 10.2 Z" fill="#30343c"/>
    <path d="M30.4 7 H37" stroke="#6b4423" stroke-width="1"/><circle cx="38.2" cy="7" r="2" fill="${ln}" stroke="${br}" stroke-width="0.9"/>
    <path d="M30.2 6 C30.2 2.6 32.2 1.4 34.8 1.4 C37.4 1.4 39.4 2.6 39.4 6 Z" fill="${pk}"/><rect x="29.8" y="4.6" width="10" height="1.8" rx="0.9" fill="${pd}"/>
    <circle cx="34" cy="0.6" r="2.5" fill="${pm}"/>`;
  },
};

// ---------- Hex: the imp-wizard (trickster) ----------
// No body, no helmet: a floating, pointed indigo wizard hood (enchanted cloth) with nothing inside but a
// pitch-black void and two big glowing neon-amber eyes. It hovers above the seat (the wheel turns by itself).
// From behind: the long floppy tip of the hood trailing like a windsock (3 joints), and two faint glowing rune
// rings (violet + amber) slowly spinning in a horizontal plane behind his back.
const H = {
  indigo: 0x2e1f6b, violet: 0x5b2bb5, violetLight: 0x8b5cf6, hem: 0x1e1450, rim: 0x6d44c9, void: 0x040208,
  amber: 0xffb21e, amberCore: 0xfff3c4, runeV: 0x8a63e8, runeA: 0xe0a030,
};
const HEX_HOOD = 0.3; // hood radius (before the standard 1.25 scale)

const HEX = {
  smooth: true,
  build(R, y0) {
    const { root, joint, part } = R;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const S = NOVA_SCALE, HR = HEX_HOOD;
    const baseY = y0 + 0.74, baseZ = -0.18;
    const hood = joint(root, 0, baseY, baseZ);
    hood.scale.setScalar(S);

    // The hood: a sphere with the face opening cut out (tilted a little down), pulled into a point that leans
    // back, flaring into a wavy hem at the bottom. deform() shapes the shell, the void lining and the rim alike.
    const OPEN = 0.78, TILT = 0.2;
    const deform = (g) => {
      const p = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const y = v.y / HR;
        if (y > 0) {
          const k = y ** 1.5;
          v.x *= 1 - 0.5 * k;
          v.z = v.z * (1 - 0.5 * k) - 0.18 * HR * k;
          v.y *= 1 + 0.55 * k;
        } else {
          const f = smoothstep(0, -1, y);
          v.x *= 1 + 0.2 * f;
          v.z *= 1 + 0.2 * f;
          v.y += 0.06 * HR * f ** 3 * Math.sin(Math.atan2(v.x, v.z) * 7);
        }
        p.setXYZ(i, v.x, v.y, v.z * 0.88); // a little shallower front to back (clears the seat back + wheel)
      }
      g.computeVertexNormals();
      return g;
    };
    const shell = (r) => {
      const g = new THREE.SphereGeometry(r, 64, 48, 0, Math.PI * 2, OPEN, Math.PI - OPEN);
      g.rotateX(Math.PI / 2 + TILT);
      return g;
    };
    part(hood, deform(shell(HR)), (x, y, z) => {
      const a = Math.atan2(x, z);
      const fold = 0.5 + 0.5 * Math.sin(a * 6 + y * 9);
      const speck = smoothstep(0.92, 0.99, Math.sin(x * 97 + 1.3) * Math.sin(y * 83 + 0.4) * Math.sin(z * 89 + 2.2) * 0.5 + 0.5);
      const c = mix(mix(H.indigo, H.violet, smoothstep(-0.25, 0.5, y) * 0.8), H.hem, 0.35 * fold);
      return mix(mix(c, H.hem, smoothstep(-0.27, -0.36, y) * 0.8), H.violetLight, speck * 0.7);
    });
    const lining = shell(HR * 0.94);
    const ix = lining.index.array;
    for (let i = 0; i < ix.length; i += 3) [ix[i], ix[i + 2]] = [ix[i + 2], ix[i]]; // faces turned inward: the void
    part(hood, deform(lining), H.void);
    const rim = new THREE.TorusGeometry(HR * Math.sin(OPEN) * 0.97, HR * 0.07, 12, 64);
    rim.translate(0, 0, HR * Math.cos(OPEN) * 0.97);
    rim.rotateX(TILT);
    part(hood, deform(rim), (x, y) => mix(H.rim, H.violet, smoothstep(0, 0.2, y)));

    // Eyes: two big amber glows floating in the dark (a joint, so they blink and squint)
    const eyes = joint(hood, 0, -0.04, 0.13);
    for (const sx of [1, -1]) {
      const eye = new THREE.SphereGeometry(0.07, 24, 16);
      eye.scale(1, 0.62, 0.35);
      part(eyes, eye, H.amber, sx * 0.085, 0, 0, { rot: [0, sx * 0.2, -sx * 0.28], glow: true });
      const core = new THREE.SphereGeometry(0.03, 16, 12);
      core.scale(1, 0.6, 0.4);
      part(eyes, core, H.amberCore, sx * 0.085, 0.003, 0.014, { rot: [0, sx * 0.2, -sx * 0.28], glow: true });
    }

    // The floppy tip: three tapered segments, each on its own joint, ball joints hiding the seams
    const SEG = [[0.055, 0.042, 0.22], [0.042, 0.028, 0.22], [0.028, 0.012, 0.2]];
    const tips = [];
    let parent = joint(hood, 0, 1.42 * HR, -0.13 * HR);
    SEG.forEach(([r0, r1, len], i) => {
      const j = i ? joint(parent, 0, 0, -SEG[i - 1][2]) : parent;
      part(j, new THREE.SphereGeometry(r0, 18, 12), (x, y) => mix(H.indigo, H.violet, 0.5 + y * 4));
      part(j, sweep([[0, 0, 0], [0, 0.004, -len / 2], [0, 0, -len]], (u) => lerp(r0, r1, u), 16, 14), (x, y, z) => mix(H.violet, H.indigo, clamp(-z / len, 0, 1) * 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(Math.atan2(x, y) * 4))));
      tips.push(j);
      parent = j;
    });
    part(tips[2], new THREE.SphereGeometry(0.03, 16, 12), H.violetLight, 0, 0, -SEG[2][2]); // tassel bead

    // Rune rings behind his back: thin glowing hoops with little glyphs, spinning opposite ways
    const runes = joint(hood, 0, -0.06, -0.5);
    const ringOf = (r, color, y, n) => {
      const j = joint(runes, 0, y, 0);
      const hoop = new THREE.TorusGeometry(r, 0.006, 6, 72);
      hoop.rotateX(Math.PI / 2);
      part(j, hoop, color, 0, 0, 0, { glow: true });
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, kind = i % 3;
        const g = kind === 0 ? new THREE.BoxGeometry(0.008, 0.03, 0.012)
          : kind === 1 ? new THREE.OctahedronGeometry(0.016) : new THREE.TorusGeometry(0.012, 0.004, 6, 12);
        if (kind === 1) g.scale(1, 1.4, 0.4);
        part(j, g, color, Math.sin(a) * r, 0, Math.cos(a) * r, { rot: [0, a, 0], glow: true });
      }
      return j;
    };
    const ringA = ringOf(0.24, H.runeV, 0, 9), ringB = ringOf(0.17, H.runeA, 0.07, 6);

    // ---- Animation hook ----
    const st = { t: 0, lean: 0, back: 0, speed: 0, blink: 0, next: 2 + Math.random() * 3, squint: 0 };
    const REST = [0.55, -0.85, -0.75], WIND = [0.3, -0.2, -0.12]; // droops behind when parked; streams back at speed
    return (dt, s) => {
      const ease = (rate) => 1 - Math.exp(-dt * rate);
      st.t += dt;
      const speed = clamp(Math.abs(s.speed), 0, 1.3), h = Math.max(dt, 1e-3);
      const accel = (speed - st.speed) / h;
      st.speed = speed;
      st.lean = lerp(st.lean, s.steer * (0.8 + 0.5 * s.drift), ease(5));
      st.back = lerp(st.back, clamp(accel * 0.12, -0.25, 0.25), ease(4)); // floats back a little when speeding up
      // hovering: a slow bob and drift, leaning into turns, peering into the corner
      hood.position.y = baseY + 0.035 * Math.sin(st.t * 2.1) + 0.012 * Math.sin(st.t * 5.3);
      hood.position.z = baseZ - st.back * 0.25;
      hood.rotation.z = st.lean * 0.16 + 0.03 * Math.sin(st.t * 1.3);
      hood.rotation.y = -st.lean * 0.28 + 0.05 * Math.sin(st.t * 0.7);
      hood.rotation.x = 0.06 * speed - st.back * 0.3 + 0.02 * Math.sin(st.t * 1.7);
      // the tip droops when parked and streams back like a windsock at speed, rippling down its length
      const k = clamp(speed * 1.3, 0, 1);
      tips.forEach((j, i) => {
        const wave = Math.sin(st.t * (5 + 9 * k) - i * 1.2) * (0.05 + 0.16 * k) * (0.6 + 0.4 * i);
        j.rotation.x = lerp(REST[i], WIND[i], k) + wave;
        j.rotation.y = (st.lean * 0.3 + Math.sin(st.t * (3 + 5 * k) - i * 0.9) * 0.08 * (1 + k)) * (i ? 0.7 : 1);
      });
      // rune rings: slow when parked, faster with speed, drift and boost
      const spin = 0.6 + 1.8 * speed + 2.5 * (s.drift || 0) + 3 * (s.boost || 0);
      ringA.rotation.y += dt * spin;
      ringB.rotation.y -= dt * spin * 1.4;
      runes.rotation.x = 0.08 * Math.sin(st.t * 0.9);
      runes.rotation.z = 0.08 * Math.sin(st.t * 0.7 + 1) - st.lean * 0.08;
      // eyes: blink now and then, squint on a boost / firing an item / a bump; the glow breathes
      st.next -= dt;
      if (st.next <= 0) { st.blink = 1; st.next = 2.5 + Math.random() * 4; }
      st.blink = Math.max(0, st.blink - dt * 7);
      st.squint = lerp(st.squint, Math.max(s.boost || 0, s.fire || 0, s.bump || 0), ease(10));
      eyes.scale.y = Math.max(0.08, (1 - Math.sin(st.blink * Math.PI)) * (1 - 0.4 * st.squint));
      if (R.glow) R.glow.color.setScalar(0.8 + 0.12 * Math.sin(st.t * 2.6) + 0.2 * st.squint);
    };
  },
  avatar() {
    const [ig, vi, vl, hm, rm, vo, am, ac, rv, ra] = [H.indigo, H.violet, H.violetLight, H.hem, H.rim, H.void, H.amber, H.amberCore, H.runeV, H.runeA].map(css);
    return `<svg class="driver-art" viewBox="0 0 48 48" aria-hidden="true">
    <defs><linearGradient id="hex-cloth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${vi}"/><stop offset="1" stop-color="${ig}"/></linearGradient>
    <radialGradient id="hex-eye"><stop offset="0" stop-color="${ac}"/><stop offset="0.55" stop-color="${am}"/><stop offset="1" stop-color="${am}" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="24" cy="40" rx="20" ry="4.6" fill="none" stroke="${rv}" stroke-width="1.1" stroke-opacity="0.75"/>
    <ellipse cx="24" cy="38" rx="14" ry="3.2" fill="none" stroke="${ra}" stroke-width="1" stroke-opacity="0.75"/>
    <path d="M27 9 C31 3 38 1.6 43.4 4.2 C44.8 5 44.4 6.6 43 6.4 C38.6 5.6 35 7.6 32.6 11.6 Z" fill="${vi}"/><circle cx="44" cy="5.4" r="1.6" fill="${vl}"/>
    <path d="M24 5.6 C14 5.6 8 15 8 26 C8 34 6.4 39.6 4.6 43.4 L10 41.6 L13.4 44.8 L17.6 42 L24 45.6 L30.4 42 L34.6 44.8 L38 41.6 L43.4 43.4 C41.6 39.6 40 34 40 26 C40 15 34 5.6 24 5.6 Z" fill="url(#hex-cloth)"/>
    <path d="M14 36 C13 27 16.4 17.6 24 17.6 C31.6 17.6 35 27 34 36 C30.6 39.4 17.4 39.4 14 36 Z" fill="${rm}"/>
    <path d="M15.8 35 C15.2 27.4 18.2 19.8 24 19.8 C29.8 19.8 32.8 27.4 32.2 35 C29 37.6 19 37.6 15.8 35 Z" fill="${vo}"/>
    <ellipse cx="19.4" cy="28.4" rx="5" ry="3.6" fill="url(#hex-eye)"/><ellipse cx="28.6" cy="28.4" rx="5" ry="3.6" fill="url(#hex-eye)"/>
    <path d="M16.6 27 Q19.4 25.4 22.4 28.6 Q19.4 30.6 16.6 27 Z M31.4 27 Q28.6 25.4 25.6 28.6 Q28.6 30.6 31.4 27 Z" fill="${am}"/>
    <path d="M18 27.8 Q19.6 27 21 28.4 M30 27.8 Q28.4 27 27 28.4" stroke="${ac}" stroke-width="0.9" fill="none" stroke-linecap="round"/>
    <circle cx="9" cy="39" r="0.9" fill="${rv}"/><circle cx="39" cy="41" r="0.9" fill="${rv}"/><circle cx="35.6" cy="35.6" r="0.8" fill="${ra}"/><circle cx="12" cy="35.4" r="0.8" fill="${ra}"/>
    <path d="M16 13 Q20 9.4 25 9.6" stroke="${vl}" stroke-opacity="0.5" stroke-width="1" fill="none"/><circle cx="12.2" cy="22" r="0.6" fill="${vl}"/><circle cx="36" cy="18" r="0.6" fill="${vl}"/><circle cx="33" cy="12" r="0.5" fill="${hm}"/>
  </svg>`;
  },
  kartArt() {
    const [ig, vi, vl, rm, vo, am, rv, ra] = [H.indigo, H.violet, H.violetLight, H.rim, H.void, H.amber, H.runeV, H.runeA].map(css);
    return `<ellipse cx="24.5" cy="11" rx="6" ry="1.8" fill="none" stroke="${rv}" stroke-width="0.8"/>
    <ellipse cx="24.5" cy="9.6" rx="4.2" ry="1.3" fill="none" stroke="${ra}" stroke-width="0.8"/>
    <path d="M32 4.4 C28.6 0.6 24 0.4 20.4 2.6 C19.4 3.2 19.8 4.4 20.8 4.2 C24.2 3.4 27 4.4 29.6 6.8 Z" fill="${vi}"/><circle cx="20.2" cy="3.6" r="1" fill="${vl}"/>
    <path d="M35.4 3.2 C30 3.2 28.2 8.6 28.4 13 C28.6 15.6 27.6 17.4 26.8 18.6 L30.4 17.8 L33 19 L35.6 17.6 L38.4 18.6 L40.6 17.2 C41.4 14.6 42 12.4 41.6 9.6 C41.2 6 38.8 3.2 35.4 3.2 Z" fill="${ig}"/>
    <path d="M37.6 6.4 C40.4 6.8 42.4 9.4 42 12.6 C41.6 15 39.6 16 37.6 15.2 C36 13.4 35.8 8.6 37.6 6.4 Z" fill="${rm}"/>
    <path d="M38 7.6 C40.2 8 41.2 10 40.9 12.4 C40.6 14 39.4 14.6 38.2 14.2 C37.2 12.6 37 9.4 38 7.6 Z" fill="${vo}"/>
    <path d="M38.6 10.4 Q40 9.8 41 10.8 Q39.8 11.6 38.6 10.4 Z" fill="${am}"/>`;
  },
};

const DRIVERS = { Nova: NOVA, Luna: LUNA, Mako: MAKO, Rex: REX, Bolt: BOLT, Koda: KODA, Pip: PIP, Hex: HEX };
