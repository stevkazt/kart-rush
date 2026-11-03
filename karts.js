// Kart bodies: looks only, every kart keeps the same physics (collider, wheel spots, grip).
//
// KART_BODIES[i] = {
//   name, tag
//   build({ add, frame, y0 }) -> the shell. add(geo, color, x, y, z, parent) in the kart's drawn metres
//                                (faces +Z, left = +X, ground at y = -0.61); color = a hex or a paint role
//   wheels                    -> drawn wheels: x, front / rear z, radius, width, hub radius + colour;
//                                optional knobs (tread blocks round each tyre), hubs (a colour per wheel: FL, FR, RL, RR)
//   flames                    -> [x, y, z] of each boost flame (1 or 2)
//   art(body, accent)         -> the shell in the 2D side view (nose to the right; the driver sits at x 28-46)
// }
//
// A driver brings the seat and steering wheel (main.js: bodyGeometry), so a shell only has to leave room:
// - the cockpit stays open above y 0.2 for |x| < 0.55, z -0.7 to 0.35
// - nothing enters DRIVER_ZONE, the space behind the seat that belongs to tails, packs and fins
import * as THREE from 'three';
import { roundedBox } from './drivers.js';

/** Behind the seat, above the car: the car stays out, and the driver's tail stays in (dev/test.sh fit). */
export const DRIVER_ZONE = { x: 0.5, y: 0.5, z: -1.15, seat: -0.72 };

const CHROME = 0xc9ced8, DARK = 0x26262e, IRON = 0x6b6e78;
const box = (w, h, d, r = 0.05, seg = 3) => roundedBox(w, h, d, r, seg);
/** The top half of a tube along X: a wheel arch. */
function arch(r, width) {
  const g = new THREE.CylinderGeometry(r, r, width, 14, 1, true, 0, Math.PI);
  g.rotateZ(Math.PI / 2);
  return g;
}
const pipe = (r, len, seg = 10) => new THREE.CylinderGeometry(r, r, len, seg);
const lying = (g) => { g.rotateX(Math.PI / 2); return g; };
/** A round bar from point a to point b, already in place: add it at 0, 0, 0. */
function tube(a, b, r = 0.03, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}
/** A flat fin in the kart's side view: pts = [z, y] corners, thickness along X. */
function fin(pts, thick = 0.035) {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2);
  g.rotateY(-Math.PI / 2); // the shape's x becomes the kart's z
  return g;
}

// The kart everyone knows: floor pan, nose, side pods, engine, wide spoiler, twin pipes.
// Modelled full size in `frame`, which draws it smaller (CFG.kart.look).
function classic({ add, frame, y0 }) {
  add(box(1.5, 0.22, 2.6, 0.07), 'body', 0, y0 - 0.1, 0, frame);
  add(box(1.15, 0.32, 0.7, 0.09), 'body', 0, y0 + 0.05, 1.1, frame);
  add(box(1.9, 0.16, 0.25, 0.05), 0x333333, 0, y0 - 0.12, 1.5, frame);
  for (const sx of [1, -1]) {
    add(box(0.28, 0.3, 1.1, 0.08), 'accent', sx * 0.72, y0 + 0.05, 0, frame);
    add(box(0.06, 0.45, 0.06, 0.02, 1), 0x222222, sx * 0.6, y0 + 0.35, -1.35, frame);
    add(lying(pipe(0.08, 0.4, 8)), 0x444444, sx * 0.22, y0 + 0.1, -1.4, frame);
  }
  add(box(0.75, 0.38, 0.5, 0.06), 0x777a85, 0, y0 + 0.12, -1.05, frame);
  add(box(1.7, 0.08, 0.42, 0.03), 'accent', 0, y0 + 0.6, -1.4, frame);
}

// Long nose, chrome grille, open wheel arches, fat rear tyres; from behind an exposed engine between two tall stacks.
function hotRod({ add }) {
  add(box(0.94, 0.16, 1.9, 0.05), 'body', 0, -0.13, -0.1);                 // floor
  for (const sx of [1, -1]) {
    add(box(0.14, 0.26, 0.86, 0.06), 'body', sx * 0.54, -0.05, -0.12);       // cockpit sides
    add(arch(0.285, 0.22), 'accent', sx * 0.72, -0.335, 0.86);              // front arch
    add(arch(0.36, 0.44), 'accent', sx * 0.72, -0.285, -0.62);              // rear arch
    add(new THREE.SphereGeometry(0.085, 12, 8), CHROME, sx * 0.42, 0.13, 1.12); // headlight
    add(box(0.2, 0.05, 0.42, 0.02, 1), DARK, sx * 0.47, -0.12, 0.28);       // step
    // tall stack beside the engine, out of the driver's space, fed from the block
    add(pipe(0.05, 0.56), CHROME, sx * 0.58, 0.2, -1.02);
    add(new THREE.CylinderGeometry(0.08, 0.055, 0.09, 10), CHROME, sx * 0.58, 0.51, -1.02);
    add(new THREE.CapsuleGeometry(0.035, 0.26, 3, 8).rotateZ(Math.PI / 2), CHROME, sx * 0.43, 0.04, -1.02);
    for (const z of [-0.8, -0.92, -1.04]) add(box(0.05, 0.1, 0.07, 0.015, 1), CHROME, sx * 0.21, 0.26, z); // rocker heads
  }
  add(box(0.68, 0.24, 1.0, 0.1), 'body', 0, 0.03, 0.72);                   // hood
  add(box(0.2, 0.02, 0.98, 0.008, 1), 'accent', 0, 0.156, 0.72);           // hood stripe
  add(box(0.6, 0.28, 0.07, 0.03), CHROME, 0, 0.03, 1.22);                  // grille
  for (const x of [-0.18, -0.06, 0.06, 0.18]) add(box(0.05, 0.2, 0.02, 0.005, 1), DARK, x, 0.03, 1.26);
  add(box(0.8, 0.22, 0.4, 0.06), 'body', 0, -0.02, -0.72);                 // tub behind the seat
  add(box(0.34, 0.24, 0.42, 0.04), IRON, 0, 0.18, -0.92);                  // engine block
  add(box(0.26, 0.1, 0.28, 0.03), CHROME, 0, 0.35, -0.92);                 // blower
}

// A round toy shell: a bowl with a coloured rim, domed nose, big headlights, a ducktail and one round pipe.
function bubble({ add }) {
  const RX = 0.68, RY = 0.52, RZ = 1.12, CY = 0.04, RIM = 1.2; // the shell: part of an ellipsoid, open on top
  const rimR = Math.sin(RIM), rimY = CY + Math.cos(RIM) * RY;
  const bowl = new THREE.SphereGeometry(1, 24, 9, 0, Math.PI * 2, RIM, Math.PI - RIM);
  bowl.scale(RX, RY, RZ);
  add(bowl, 'body', 0, CY, 0);
  const rim = new THREE.TorusGeometry(1, 0.05, 6, 28);
  rim.rotateX(Math.PI / 2);
  rim.scale(RX * rimR, 1, RZ * rimR);
  add(rim, 'accent', 0, rimY, 0);
  const floor = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
  floor.scale(RX * rimR, 1, RZ * rimR);
  add(floor, 0x2a2a3a, 0, rimY - 0.08, 0); // shuts the bowl under the driver
  const dome = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(0.5, 0.2, 0.5);
  add(dome, 'body', 0, rimY - 0.03, 0.56); // nose
  add(box(0.6, 0.07, 0.3, 0.03), 'accent', 0, rimY + 0.05, -0.98).rotation.x = 0.28; // ducktail, growing out of the rim
  for (const sx of [1, -1]) {
    const fender = (z, r) => { // a soft bump over each wheel
      const g = new THREE.SphereGeometry(r, 12, 7);
      g.scale(0.62, 0.75, 1.05);
      add(g, 'body', sx * 0.6, -0.18, z);
    };
    fender(0.66, 0.36);
    fender(-0.64, 0.38);
    add(new THREE.SphereGeometry(0.12, 12, 8), 0xfff4c2, sx * 0.3, 0.32, 0.8); // big eye-like headlights
    add(new THREE.TorusGeometry(0.115, 0.022, 5, 12), CHROME, sx * 0.3, 0.32, 0.87);
  }
  add(lying(pipe(0.085, 0.2, 12)), CHROME, 0, -0.14, -1.12);
}

// Open wheels and a needle nose: a thin tub, side pods, a front wing, and from behind one big wing over one centre pipe.
function formula({ add }) {
  add(box(0.72, 0.16, 1.9, 0.05), 'body', 0, -0.2, -0.2);                  // floor
  add(new THREE.CylinderGeometry(0.1, 0.26, 1.15, 12).rotateX(Math.PI / 2).scale(1, 0.72, 1), 'body', 0, -0.1, 0.92); // needle nose
  add(new THREE.SphereGeometry(0.105, 10, 6).scale(1, 0.72, 1.4), 'accent', 0, -0.1, 1.5);
  add(box(0.34, 0.03, 0.9, 0.012, 1), 'accent', 0, 0.075, 0.82).rotation.x = 0.17; // stripe down the nose
  add(box(1.5, 0.035, 0.26, 0.012, 1), 'accent', 0, -0.36, 1.36);          // front wing
  add(tube([0.14, -0.35, 1.32], [0.08, -0.17, 1.2], 0.022), DARK, 0, 0, 0);
  add(tube([-0.14, -0.35, 1.32], [-0.08, -0.17, 1.2], 0.022), DARK, 0, 0, 0);
  add(box(0.72, 0.28, 0.5, 0.05), 'body', 0, -0.02, -0.92);                // engine cover
  add(box(0.42, 0.06, 0.03, 0.01, 1), 0xe8322f, 0, -0.08, -1.2);           // rain light
  add(box(0.5, 0.1, 0.16, 0.02, 1), DARK, 0, -0.27, -1.2);                 // diffuser
  add(lying(pipe(0.07, 0.16, 10)), CHROME, 0, 0.05, -1.24);                // the one centre pipe
  for (const sx of [1, -1]) {
    add(box(0.14, 0.26, 0.92, 0.05), 'body', sx * 0.5, -0.06, -0.14);      // cockpit sides
    add(box(0.26, 0.24, 0.8, 0.07), 'accent', sx * 0.68, -0.14, -0.28);    // side pod...
    add(box(0.2, 0.15, 0.03, 0.01, 1), DARK, sx * 0.68, -0.13, 0.13);      // ...and its intake
    add(box(0.035, 0.17, 0.32, 0.01, 1), 'body', sx * 0.75, -0.3, 1.36);   // wing end plate
    // suspension: thin arms out to the bare wheels
    add(tube([sx * 0.2, -0.13, 0.86], [sx * 0.7, -0.32, 0.95]), DARK, 0, 0, 0);
    add(tube([sx * 0.2, -0.2, 0.72], [sx * 0.7, -0.4, 0.95]), DARK, 0, 0, 0);
    add(tube([sx * 0.34, -0.1, -0.86], [sx * 0.66, -0.26, -0.72]), DARK, 0, 0, 0);
    // the big wing, on two pylons behind the driver's space
    add(tube([sx * 0.22, 0.02, -1.2], [sx * 0.22, 0.58, -1.3], 0.028), DARK, 0, 0, 0);
    add(box(0.04, 0.2, 0.42, 0.012, 1), 'body', sx * 0.68, 0.67, -1.34);
  }
  add(box(1.36, 0.045, 0.36, 0.015, 1), 'accent', 0, 0.68, -1.32).rotation.x = -0.14; // main plane
  add(box(1.36, 0.03, 0.14, 0.012, 1), 'body', 0, 0.75, -1.49).rotation.x = -0.45;    // flap
}

// A heavy armoured tub up on huge knobby tyres: bull bar, roof lamps on the hood, from behind a spare wheel between two pipes.
function monster({ add }) {
  const plate = (w, h, d, x, y, z, color = 'accent') => add(box(w, h, d, 0.015, 1), color, x, y, z);
  add(box(1.08, 0.18, 2.0, 0.05), 'body', 0, -0.06, -0.08);                // floor, up off the road
  add(box(1.0, 0.34, 0.86, 0.08), 'body', 0, 0.1, 0.78);                   // hood
  plate(0.62, 0.05, 0.56, 0, 0.28, 0.78, DARK);                            // armour on the hood...
  plate(0.2, 0.09, 0.3, 0, 0.32, 0.82, IRON);                              // ...and its scoop
  add(box(0.98, 0.32, 0.54, 0.07), 'body', 0, 0.07, -0.94);                // rear deck
  add(lying(pipe(0.32, 0.2, 18)), 0x1f1f24, 0, 0.1, -1.32);                // the spare
  add(lying(pipe(0.15, 0.22, 10)), CHROME, 0, 0.1, -1.32);
  add(box(0.08, 0.12, 0.16, 0.02, 1), IRON, 0, 0.1, -1.2);
  add(tube([-0.56, -0.02, 1.3], [0.56, -0.02, 1.3], 0.045, 8), CHROME, 0, 0, 0); // bull bar
  add(tube([-0.56, 0.24, 1.3], [0.56, 0.24, 1.3], 0.03, 8), CHROME, 0, 0, 0);
  for (const sx of [1, -1]) {
    add(box(0.16, 0.36, 1.08, 0.05), 'body', sx * 0.56, 0.04, -0.16);      // cockpit wall
    plate(0.04, 0.2, 0.76, sx * 0.65, 0.05, -0.16);                        // armour plate on it
    add(arch(0.54, 0.42), 'body', sx * 0.83, -0.17, 0.84);               // fenders, high over the tyres
    add(arch(0.57, 0.46), 'body', sx * 0.83, -0.13, -0.72);
    add(tube([sx * 0.3, -0.02, 1.2], [sx * 0.3, -0.02, 1.3], 0.03), CHROME, 0, 0, 0);
    add(tube([sx * 0.46, -0.02, 1.3], [sx * 0.46, 0.24, 1.3], 0.03), CHROME, 0, 0, 0);
    add(new THREE.SphereGeometry(0.075, 10, 7), 0xfff4c2, sx * 0.3, 0.13, 1.3); // lamps inside the bar
    add(tube([sx * 0.46, -0.1, 0.84], [sx * 0.7, -0.18, 0.84], 0.05), IRON, 0, 0, 0); // axles
    add(tube([sx * 0.46, -0.1, -0.72], [sx * 0.7, -0.14, -0.72], 0.055), IRON, 0, 0, 0);
    add(tube([sx * 0.46, 0.1, 0.62], [sx * 0.66, -0.14, 0.72], 0.035), CHROME, 0, 0, 0); // shocks
    add(tube([sx * 0.46, 0.1, -0.5], [sx * 0.66, -0.12, -0.6], 0.035), CHROME, 0, 0, 0);
    add(lying(pipe(0.07, 0.3, 10)), DARK, sx * 0.44, 0.03, -1.3);          // a pipe either side of the spare
  }
}

// No shell at all: a tube frame with panels clipped on, springs in the open, lamps up top, a bamboo rack over the motor.
function buggy({ add }) {
  const BAR = 0x30343c, BAMBOO = 0xc9b458, BAND = 0x6f8f3a, SPRING = 0xf2b632;
  const bar = (a, b, r = 0.032, color = BAR) => add(tube(a, b, r), color, 0, 0, 0);
  add(box(0.86, 0.09, 1.62, 0.03, 1), DARK, 0, -0.2, -0.14);               // floor pan
  add(box(0.56, 0.1, 0.5, 0.035), 'body', 0, 0.06, 0.82).rotation.x = 0.32; // nose panel
  add(box(0.36, 0.05, 0.3, 0.02, 1), 'accent', 0, 0.14, 0.76).rotation.x = 0.32;
  add(box(0.44, 0.3, 0.42, 0.04), IRON, 0, -0.03, -0.96);                  // the motor, in plain sight
  add(box(0.3, 0.07, 0.3, 0.02, 1), BAR, 0, 0.16, -0.96);
  for (const sx of [1, -1]) {
    const x = sx * 0.58;
    bar([x, -0.16, 0.52], [x, -0.16, -1.05]);                              // lower rail
    bar([x, 0.2, 0.36], [x, 0.2, -0.72]);                                  // upper rail
    bar([x, -0.16, -0.72], [x, 0.76, -0.72]);                              // roll bar upright, beside the seat
    bar([x, 0.76, -0.72], [x * 0.86, 0.76, -0.48], 0.026);
    bar([x, 0.62, -0.72], [x, -0.1, -1.18]);                               // its brace, down past the motor
    bar([x, 0.2, 0.36], [sx * 0.34, 0.66, 0.46]);                          // screen frame
    bar([x, -0.16, 0.52], [x, 0.2, 0.36]);
    bar([sx * 0.34, 0.66, 0.46], [sx * 0.2, 0.08, 0.74], 0.026);
    bar([x, -0.16, 0.52], [sx * 0.3, -0.16, 1.2]);                         // front frame
    bar([sx * 0.3, -0.16, 1.2], [sx * 0.2, 0.08, 1.02], 0.026);
    add(box(0.05, 0.22, 0.72, 0.02, 1), 'accent', x, 0.02, -0.16);         // door panel clipped to the rails
    // wheels on long arms with a spring on each
    bar([sx * 0.42, -0.2, 0.9], [sx * 0.72, -0.34, 0.92], 0.024);
    bar([sx * 0.3, -0.05, 0.86], [sx * 0.68, -0.16, 0.92], 0.024, IRON);
    bar([sx * 0.42, -0.2, -0.82], [sx * 0.72, -0.3, -0.68], 0.024);
    add(tube([sx * 0.3, 0.1, 0.72], [sx * 0.62, -0.22, 0.9], 0.052, 8), SPRING, 0, 0, 0);
    add(tube([sx * 0.46, 0.2, -0.72], [sx * 0.62, -0.2, -0.72], 0.058, 8), SPRING, 0, 0, 0);
    add(new THREE.SphereGeometry(0.075, 10, 7), 0xfff4c2, sx * 0.17, 0.72, 0.47); // lamps on the screen frame
    add(new THREE.CapsuleGeometry(0.03, 0.26, 2, 6).rotateX(Math.PI / 2), CHROME, sx * 0.14, -0.12, -1.28); // two short pipes
    bar([sx * 0.46, 0.34, -1.22], [sx * 0.46, -0.08, -1.14], 0.024);       // rack posts
  }
  bar([-0.3, -0.16, 1.2], [0.3, -0.16, 1.2]);
  bar([-0.2, 0.08, 1.02], [0.2, 0.08, 1.02], 0.026);
  bar([-0.34, 0.66, 0.46], [0.34, 0.66, 0.46], 0.026);
  bar([-0.58, -0.1, -1.18], [0.58, -0.1, -1.18]);
  for (const y of [0.22, 0.34]) for (const z of [-1.18, -1.28]) { // the bamboo rack: canes with dark bands
    bar([-0.62, y, z], [0.62, y, z], 0.03, BAMBOO);
    for (const x of [-0.3, 0.3]) bar([x - 0.02, y, z], [x + 0.02, y, z], 0.033, BAND);
  }
}

// Whatever was lying around: a crooked tub of panels that don't match, a plank deck, a tied-on battery, two different pipes.
function junker({ add }) {
  const RUST = 0x9a4f24, PRIMER = 0x7d8378, WOOD = 0x8b6239, ROPE = 0xd8c79a;
  add(box(1.14, 0.2, 2.1, 0.03, 1), RUST, 0, -0.14, -0.08);                // floor
  add(box(0.92, 0.3, 0.86, 0.04, 2), 'body', 0.02, 0.0, 0.76).rotation.z = -0.03; // hood, not quite straight
  add(box(0.42, 0.03, 0.5, 0.01, 1), PRIMER, -0.2, 0.16, 0.72).rotation.z = -0.03; // a panel off another car
  add(box(0.32, 0.03, 0.3, 0.01, 1), RUST, 0.26, 0.15, 0.92).rotation.y = 0.2;
  add(box(1.22, 0.1, 0.1, 0.02, 1), IRON, -0.04, -0.2, 1.24).rotation.z = 0.07; // a bumper hanging on by one bolt
  add(new THREE.SphereGeometry(0.11, 10, 7), 0xfff4c2, 0.28, 0.1, 1.16);   // one big headlight...
  add(box(0.15, 0.1, 0.05, 0.015, 1), 0xffa63d, -0.3, 0.09, 1.2);          // ...one square one
  // crate sides: planks at slightly different angles
  for (const [sx, y, a, c] of [[1, 0.13, 0.03, WOOD], [1, -0.02, -0.02, 0x7a5430], [-1, 0.13, -0.025, 0x7a5430], [-1, -0.02, 0.02, WOOD]])
    add(box(0.1, 0.13, 1.12, 0.012, 1), c, sx * 0.6, y, -0.16).rotation.x = a;
  add(box(0.04, 0.2, 0.5, 0.01, 1), 'accent', 0.665, 0.05, -0.26).rotation.z = 0.05; // a door from somewhere else
  add(box(0.04, 0.2, 0.34, 0.01, 1), PRIMER, -0.665, 0.05, 0.04).rotation.z = -0.06;
  add(box(1.06, 0.1, 0.62, 0.02, 1), WOOD, 0, 0.0, -1.0).rotation.z = 0.025; // plank deck
  add(box(0.36, 0.26, 0.34, 0.03), IRON, -0.06, 0.15, -0.96);              // an old motor
  add(box(0.26, 0.2, 0.26, 0.015, 1), 0x24262c, 0.34, 0.14, -1.12).rotation.y = 0.22; // the loose battery...
  add(pipe(0.03, 0.04, 6), 0xe8322f, 0.27, 0.26, -1.1);                    // ...its terminals...
  add(pipe(0.03, 0.04, 6), 0x222222, 0.41, 0.26, -1.13);
  add(tube([0.27, 0.27, -1.1], [0.1, 0.12, -0.96], 0.012, 4), 0xe8322f, 0, 0, 0); // ...and a wire to the motor
  add(tube([0.2, 0.25, -1.28], [0.2, 0.0, -1.28], 0.012, 4), ROPE, 0, 0, 0);
  add(tube([0.48, 0.25, -1.04], [0.48, 0.0, -1.04], 0.012, 4), ROPE, 0, 0, 0);
  // mismatched pipes: a fat chrome one low on the left, a thin rusty one bent up on the right
  add(lying(pipe(0.1, 0.36, 10)), CHROME, 0.34, -0.14, -1.3);
  add(tube([-0.3, -0.12, -1.12], [-0.34, -0.12, -1.3], 0.04), RUST, 0, 0, 0);
  add(tube([-0.34, -0.12, -1.3], [-0.42, 0.26, -1.34], 0.04), RUST, 0, 0, 0);
  for (const sx of [1, -1]) add(arch(0.34, 0.26), sx > 0 ? RUST : 'body', sx * 0.73, -0.31, 0.82);
  add(arch(0.38, 0.3), 'body', 0.72, -0.29, -0.66);
  add(arch(0.38, 0.3), PRIMER, -0.72, -0.29, -0.66);
}

// A rocket on wheels: a cone for a nose, no engine to see, spats over the wheels; from behind one big nozzle and three fins.
function comet({ add }) {
  const GLOW = 0x7ef0ff;
  add(box(0.96, 0.16, 1.5, 0.06), 'body', 0, -0.14, -0.2);                 // floor
  add(new THREE.ConeGeometry(0.48, 1.3, 16).rotateX(Math.PI / 2).scale(1, 0.72, 1), 'body', 0, -0.03, 1.0); // nose cone
  add(new THREE.ConeGeometry(0.12, 0.27, 12).rotateX(Math.PI / 2).scale(1, 0.72, 1), 'accent', 0, -0.03, 1.525); // its tip
  add(new THREE.TorusGeometry(0.335, 0.022, 5, 18).scale(1, 0.72, 1), 'accent', 0, -0.03, 0.72); // ring round the cone
  add(new THREE.CylinderGeometry(0.46, 0.34, 0.5, 16).rotateX(Math.PI / 2).scale(1, 0.72, 1), 'body', 0, 0.0, -1.0); // tail, narrowing to the nozzle
  for (const sx of [1, -1]) {
    add(new THREE.CapsuleGeometry(0.15, 0.98, 4, 12).rotateX(Math.PI / 2).scale(0.85, 1, 1), 'body', sx * 0.52, 0.01, -0.2); // long cockpit flanks
    const spat = (r, y, z) => add(new THREE.SphereGeometry(r, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.5, 0.82, 1.25), 'accent', sx * 0.76, y, z); // half domes: the wheels show below
    spat(0.38, -0.36, 0.8);
    spat(0.42, -0.33, -0.7);
    add(box(0.42, 0.04, 0.5, 0.012, 1), 'body', sx * 0.56, -0.18, 0.3);    // running boards
    const side = add(fin([[-0.9, 0], [-1.42, 0], [-1.62, 0.5], [-1.36, 0.5]]), 'accent', sx * 0.3, 0.03, 0); // two fins, leaning out
    side.rotation.z = sx * -1.05;
  }
  add(fin([[-1.0, 0.25], [-1.42, 0.25], [-1.66, 0.84], [-1.42, 0.84]].map(([z, y]) => [Math.min(z, -1.16), y])), 'accent', 0, 0, 0); // top fin, behind the driver's space
  // the big nozzle: chrome bell, dark throat, bright ring
  add(new THREE.CylinderGeometry(0.31, 0.25, 0.26, 18, 1, true).rotateX(Math.PI / 2).scale(1, 0.9, 1), CHROME, 0, 0.0, -1.34);
  add(new THREE.CircleGeometry(0.28, 18).rotateY(Math.PI), 0x12141c, 0, 0, -1.3);
  add(new THREE.TorusGeometry(0.2, 0.03, 6, 18), GLOW, 0, 0, -1.31);
}

// (flames + wheels of Classic: where the frame used to draw them)
export const KART_BODIES = [
  {
    name: 'Classic', tag: 'The one that started it', build: classic,
    wheels: { x: 0.7315, fz: 0.687, rz: -0.6545, fr: 0.308, rr: 0.308, fw: 0.262, rw: 0.339, hub: 0.139, hubColor: 0xdddddd },
    flames: [[0.169, 0.052, -1.276], [-0.169, 0.052, -1.276]],
    art: (b, a) => `<rect x="3" y="9" width="15" height="4" rx="1.5" fill="${a}" stroke="#fff" stroke-opacity="0.25" stroke-width="0.6"/><rect x="9" y="12" width="3" height="10" fill="#555"/>
    <path d="M8 22 H50 L64 25 Q67 26 67 29 V32 H6 Q4 32 4 29 V25 Q4 22 8 22 Z" fill="${b}" stroke="#fff" stroke-opacity="0.3" stroke-width="0.7"/>
    <rect x="22" y="20" width="22" height="7" rx="2" fill="${a}"/>`,
    artFront: () => `<rect x="62" y="29" width="7" height="3" rx="1" fill="#333"/>
    <circle cx="15" cy="34" r="7.5" fill="#222"/><circle cx="15" cy="34" r="3" fill="#888"/>
    <circle cx="55" cy="35" r="6.5" fill="#222"/><circle cx="55" cy="35" r="2.6" fill="#888"/>`,
  },
  {
    name: 'Hot Rod', tag: 'All engine, no manners', build: hotRod,
    wheels: { x: 0.72, fz: 0.86, rz: -0.62, fr: 0.25, rr: 0.32, fw: 0.17, rw: 0.4, hub: 0.11, hubColor: CHROME },
    flames: [[0.58, 0.52, -1.1], [-0.58, 0.52, -1.1]],
    art: (b, a) => `<rect x="7" y="4" width="3" height="20" rx="1" fill="#c9ced8"/><rect x="6" y="3" width="5" height="2.4" rx="1" fill="#c9ced8"/>
    <rect x="11" y="15" width="10" height="9" rx="1.5" fill="#6b6e78"/><rect x="12.5" y="12" width="7" height="3.4" rx="1" fill="#c9ced8"/>
    <path d="M6 24 H42 L44 20 H66 Q69 20 69 23 V30 H6 Z" fill="${b}" stroke="#fff" stroke-opacity="0.3" stroke-width="0.7"/>
    <rect x="44" y="20" width="25" height="2.4" rx="1" fill="${a}"/><rect x="24" y="22" width="18" height="4" rx="1.5" fill="${a}"/>`,
    artFront: (b, a) => `<rect x="67" y="20.5" width="3" height="9" rx="1" fill="#c9ced8"/>
    <path d="M3 31 A11.5 11.5 0 0 1 26 31 Z" fill="${a}"/><path d="M50 32 A8 8 0 0 1 66 32 Z" fill="${a}"/>
    <circle cx="14.5" cy="33.5" r="9" fill="#222"/><circle cx="14.5" cy="33.5" r="3.6" fill="#c9ced8"/>
    <circle cx="58" cy="36" r="6" fill="#222"/><circle cx="58" cy="36" r="2.4" fill="#c9ced8"/>`,
  },
  {
    name: 'Bubble', tag: 'Small, round and very pleased', build: bubble,
    wheels: { x: 0.74, fz: 0.66, rz: -0.64, fr: 0.27, rr: 0.29, fw: 0.2, rw: 0.24, hub: 0.15, hubColor: 0xf4f1e6 },
    flames: [[0, -0.14, -1.24]],
    art: (b, a) => `<path d="M4 18 L15 20 L14 23 L3 21 Z" fill="${a}"/>
    <path d="M4 27 C4 20 12 18 22 20 H46 C56 18 69 21 69 29 C69 33 62 36 50 36 H20 C10 36 4 33 4 27 Z" fill="${b}" stroke="#fff" stroke-opacity="0.3" stroke-width="0.7"/>
    <path d="M16 20.4 H52" stroke="${a}" stroke-width="2.4" stroke-linecap="round"/>`,
    artFront: (b) => `<circle cx="61" cy="23" r="3.6" fill="#fff4c2"/><rect x="0" y="29" width="5" height="4" rx="1.5" fill="#c9ced8"/>
    <circle cx="16" cy="36" r="6" fill="#222"/><circle cx="16" cy="36" r="3.4" fill="#f4f1e6"/>
    <circle cx="56" cy="36" r="5.6" fill="#222"/><circle cx="56" cy="36" r="3.2" fill="#f4f1e6"/>
    <path d="M8.5 34 A7.5 7.5 0 0 1 23.5 34 Z M49 34 A7 7 0 0 1 63 34 Z" fill="${b}"/>`,
  },
  {
    name: 'Formula', tag: 'Low, loud and always late on the brakes', build: formula,
    wheels: { x: 0.8, fz: 0.95, rz: -0.72, fr: 0.25, rr: 0.31, fw: 0.2, rw: 0.38, hub: 0.11, hubColor: 0x30343c },
    flames: [[0, 0.05, -1.55]],
    art: (b, a) => `<rect x="2" y="9" width="15" height="3" rx="1" fill="${a}" stroke="#fff" stroke-opacity="0.25" stroke-width="0.5"/><rect x="2" y="7" width="2.4" height="8" rx="0.6" fill="${b}"/><rect x="8" y="11" width="2.4" height="15" fill="#30343c"/>
    <path d="M7 24 H44 L69 29 Q70.5 30 69 31.5 L46 34 H7 Z" fill="${b}" stroke="#fff" stroke-opacity="0.3" stroke-width="0.7"/>
    <rect x="22" y="26" width="20" height="6.5" rx="2" fill="${a}"/>`,
    artFront: (b, a) => `<rect x="58" y="36.5" width="13" height="2" rx="0.8" fill="${a}"/>
    <circle cx="13" cy="35" r="7" fill="#222"/><circle cx="13" cy="35" r="2.6" fill="#30343c"/>
    <circle cx="56" cy="36" r="5.6" fill="#222"/><circle cx="56" cy="36" r="2.1" fill="#30343c"/>`,
  },
  {
    name: 'Monster', tag: 'It does not go round things', build: monster,
    wheels: { x: 0.83, fz: 0.84, rz: -0.72, fr: 0.44, rr: 0.48, fw: 0.34, rw: 0.38, hub: 0.2, hubColor: CHROME, knobs: 11 },
    flames: [[0.44, 0.03, -1.56], [-0.44, 0.03, -1.56]],
    art: (b, a) => `<circle cx="4.5" cy="20" r="5" fill="#1f1f24"/><circle cx="4.5" cy="20" r="2" fill="#c9ced8"/>
    <path d="M6 15 H44 L46 12 H66 Q68 12 68 14 V25 H6 Z" fill="${b}" stroke="#fff" stroke-opacity="0.3" stroke-width="0.7"/>
    <rect x="50" y="9.5" width="10" height="3" rx="0.8" fill="#6b6e78"/><rect x="23" y="15" width="19" height="5" rx="1" fill="${a}"/>`,
    artFront: (b, a) => `<path d="M68 12 H70.5 V25 H68" fill="none" stroke="#c9ced8" stroke-width="1.5"/>
    <path d="M3 25 A12.5 12.5 0 0 1 28 25 Z M45 25 A12 12 0 0 1 69 25 Z" fill="${b}"/>
    <circle cx="15.5" cy="31" r="11.5" fill="#222" stroke="#111" stroke-width="1.6" stroke-dasharray="2.4 1.8"/><circle cx="15.5" cy="31" r="5" fill="#c9ced8"/>
    <circle cx="57" cy="31.5" r="11" fill="#222" stroke="#111" stroke-width="1.6" stroke-dasharray="2.4 1.8"/><circle cx="57" cy="31.5" r="4.6" fill="#c9ced8"/>`,
  },
  {
    name: 'Buggy', tag: 'Half the car, twice the fun', build: buggy,
    wheels: { x: 0.8, fz: 0.92, rz: -0.68, fr: 0.31, rr: 0.36, fw: 0.2, rw: 0.28, hub: 0.13, hubColor: 0xf2b632, knobs: 9 },
    flames: [[0.14, -0.12, -1.6], [-0.14, -0.12, -1.6]],
    art: (b, a) => `<path d="M3 15 V19 M7 15 V19" stroke="#c9b458" stroke-width="2"/><rect x="1" y="14" width="14" height="2" rx="1" fill="#c9b458"/><rect x="1" y="18.5" width="14" height="2" rx="1" fill="#c9b458"/>
    <rect x="9" y="22" width="11" height="9" rx="1.5" fill="#6b6e78"/>
    <path d="M20 8 V30 M20 12 L8 30 M8 30 H60 L68 25 L56 19 L49 8 M20 21 H48 L56 19" fill="none" stroke="#30343c" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M50 21 L66 25 L60 29 L49 27 Z" fill="${b}" stroke="#fff" stroke-opacity="0.3" stroke-width="0.6"/>
    <rect x="23" y="23" width="20" height="6" rx="1" fill="${a}"/>`,
    artFront: () => `<circle cx="50" cy="8" r="2.4" fill="#fff4c2"/><path d="M15 32 L19 22 M58 32 L55 22" stroke="#f2b632" stroke-width="2.6"/>
    <circle cx="14.5" cy="33.5" r="8.5" fill="#222" stroke="#111" stroke-width="1.4" stroke-dasharray="2 1.6"/><circle cx="14.5" cy="33.5" r="3.2" fill="#f2b632"/>
    <circle cx="58" cy="35" r="7" fill="#222" stroke="#111" stroke-width="1.4" stroke-dasharray="2 1.6"/><circle cx="58" cy="35" r="2.8" fill="#f2b632"/>`,
  },
  {
    name: 'Junker', tag: 'Held together by rope and optimism', build: junker,
    wheels: { x: 0.74, fz: 0.82, rz: -0.66, fr: 0.27, rr: 0.32, fw: 0.2, rw: 0.28, hub: 0.12, hubColor: IRON, hubs: [IRON, 0xe8b23a, 0xc9ced8, 0x9a4f24] },
    flames: [[0.34, -0.14, -1.68], [-0.42, 0.28, -1.5]],
    art: (b, a) => `<path d="M3 30 V14 L1.5 11" fill="none" stroke="#9a4f24" stroke-width="2.4"/><rect x="5" y="17" width="9" height="8" rx="1" fill="#24262c"/><rect x="6.5" y="15.5" width="2" height="1.6" fill="#e8322f"/>
    <rect x="4" y="25" width="22" height="3" rx="0.6" fill="#8b6239" transform="rotate(-1.5 15 26)"/><rect x="4" y="29" width="62" height="4" rx="1" fill="#9a4f24"/>
    <rect x="22" y="20" width="24" height="4.4" rx="0.6" fill="#8b6239" transform="rotate(1 34 22)"/><rect x="22" y="25" width="24" height="4.4" rx="0.6" fill="#7a5430" transform="rotate(-1 34 27)"/>
    <path d="M46 21 L66 19.5 Q68 19.5 68 22 V30 H46 Z" fill="${b}" stroke="#fff" stroke-opacity="0.3" stroke-width="0.7"/>
    <rect x="50" y="20.5" width="9" height="5" rx="0.5" fill="#7d8378"/><rect x="28" y="20.5" width="10" height="8.4" rx="0.5" fill="${a}"/>`,
    artFront: () => `<rect x="64" y="31" width="7" height="2.4" rx="0.6" fill="#6b6e78" transform="rotate(5 67 32)"/><circle cx="66.5" cy="24" r="2.4" fill="#fff4c2"/>
    <circle cx="14.5" cy="34.5" r="7.5" fill="#222"/><circle cx="14.5" cy="34.5" r="3" fill="#c9ced8"/>
    <circle cx="56" cy="35.5" r="6.4" fill="#222"/><circle cx="56" cy="35.5" r="2.6" fill="#e8b23a"/>`,
  },
  {
    name: 'Comet', tag: 'Nobody has seen the engine', build: comet,
    wheels: { x: 0.76, fz: 0.8, rz: -0.7, fr: 0.26, rr: 0.29, fw: 0.14, rw: 0.18, hub: 0.17, hubColor: 0x7ef0ff },
    flames: [[0, 0, -1.72]],
    art: (b, a) => `<path d="M16 22 L4 5 L8 5 L23 22 Z" fill="${a}"/><rect x="3" y="20" width="6" height="11" rx="1.5" fill="#c9ced8"/>
    <path d="M7 21 H46 L69 28.5 Q70.5 29.5 69 30.5 L46 34 H7 Z" fill="${b}" stroke="#fff" stroke-opacity="0.3" stroke-width="0.7"/>
    <path d="M62 26.3 L70 29.2 Q70.5 29.5 70 30 L62 31.3 Z" fill="${a}"/><path d="M12 28 L3 40 L8 40 L22 30 Z" fill="${a}"/>`,
    artFront: (b, a) => `<circle cx="16" cy="35.5" r="6.4" fill="#222"/><circle cx="16" cy="35.5" r="3.8" fill="#7ef0ff"/>
    <circle cx="54" cy="36" r="5.8" fill="#222"/><circle cx="54" cy="36" r="3.4" fill="#7ef0ff"/>
    <path d="M7 35 A9 8 0 0 1 25 35 Z M46 35 A8 7.5 0 0 1 62 35 Z" fill="${a}"/>`,
  },
];

export const bodyNamed = (name) => KART_BODIES.find((b) => b.name === name) ?? KART_BODIES[0];
