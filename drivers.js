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
function bakeRig({ root, bones }, colors, smooth = false) {
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
        ? new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.2, envMap: skyEnv(), envMapIntensity: 1.2 })
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
 * update(dt, s) runs every frame with s = { speed 0..1, steer -1..1 (+ = right), drift 0..1, boost 0/1, bump 0/1 }.
 */
export function buildRider(r, colors, y0) {
  const R = rig();
  const spec = DRIVERS[r.name] ?? FALLBACK;
  const update = spec.build(R, y0) ?? null;
  const baked = bakeRig(R, colors, !!spec.smooth);
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
/** A tube along a smooth curve through pts, radius radius(u) for u 0..1 along it. */
export function sweep(pts, radius, tubular = 40, radial = 16) {
  const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
  const g = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const p = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    curve.getPointAt(i / tubular, c);
    const r = radius(i / tubular);
    for (let j = 0; j <= radial; j++) {
      const n = i * (radial + 1) + j;
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

const DRIVERS = { Nova: NOVA, Luna: LUNA };
