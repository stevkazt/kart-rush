// Drives the game in headless Chrome over the DevTools protocol. Run via dev/test.sh.
//   node test.mjs <port> autopilot <seconds>  -> full race with dev/autopilot.js, prints lap log
//   node test.mjs <port> trace <seconds> <probe.js> -> autopilot race plus an extra script that pushes to __log
//   node test.mjs <port> profile <seconds>   -> autopilot race with drawing switched off; prints the
//                                                functions using the most CPU (JS cost, not software GL)
//   node test.mjs <port> shots <idx,idx,...>  -> screenshots with the player parked at those track samples
//   node test.mjs <port> studio <view,...>    -> lobby close-ups of the player's driver (views: STUDIO below)
//   node test.mjs <port> eval <js expr>       -> prints the expression ~1 s after GO
//   node test.mjs <port> tap <seconds>        -> on open grass at top speed, hold RIGHT for <seconds>,
//                                                prints heading change / slip / yaw rate
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , debugPort, mode, arg] = process.argv;
const here = path.dirname(fileURLToPath(import.meta.url));
const tag = process.env.SHOT_TAG ? `${process.env.SHOT_TAG}-` : ''; // screenshot file name prefix (build + commit)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
let id = 0;
const pending = {};
const errors = [];
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending[m.id]) pending[m.id](m.result ?? m);
  if (m.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(m.params.exceptionDetails).slice(0, 400));
};
await new Promise((r) => { ws.onopen = r; });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x })).result?.value;

await send('Runtime.enable');
// DRIVER=Luna: race / pose as that driver (the player's pick is read from localStorage at boot)
await send('Page.enable');
// a saved profile so the lobby opens (not the hello screen)
await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.getItem('kartrush.profile') || localStorage.setItem('kartrush.profile', '{"name":"Test","age":30}')` });
if (process.env.DRIVER) await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('kartrush.driver', ${JSON.stringify(process.env.DRIVER)})` });
await send('Page.navigate', { url: `http://localhost:${process.env.GAME_PORT}/index.html${process.env.TRACK ? `?track=${process.env.TRACK}` : ''}` });
// wait for the page (a track with heights takes longer to build), then START
for (let t = 0; t < 60 && (await ev(`typeof __s !== 'undefined' && __s.phase === 'menu'`)) !== true; t++) await sleep(500);
await sleep(500);
if (mode !== 'studio' && mode !== 'pick') await ev(`document.getElementById('btn-start').click()`);

if (mode === 'autopilot' || mode === 'trace') {
  await ev(fs.readFileSync(path.join(here, 'autopilot.js'), 'utf8'));
  if (mode === 'trace') await ev(fs.readFileSync(process.argv[5], 'utf8')); // extra probe, logs to __log
  await sleep(+arg * 1000);
  console.log(await ev('__log.join("\\n")'));
} else if (mode === 'profile') {
  await ev(fs.readFileSync(path.join(here, 'autopilot.js'), 'utf8'));
  await ev('__r.render = () => {}');
  await sleep(4000); // countdown
  await send('Profiler.enable');
  await send('Profiler.start');
  await sleep(+arg * 1000);
  const { profile } = await send('Profiler.stop');
  const self = {}, dt = profile.timeDeltas, total = dt.reduce((a, b) => a + b, 0);
  const byId = Object.fromEntries(profile.nodes.map((n) => [n.id, n]));
  profile.samples.forEach((id, i) => {
    const f = byId[id].callFrame, name = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`;
    self[name] = (self[name] || 0) + dt[i];
  });
  for (const [name, t] of Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.log(`${((t / total) * 100).toFixed(1).padStart(5)}%  ${name}`);
  }
} else if (mode === 'shots') {
  while ((await ev('__s.phase')) !== 'race') await sleep(200);
  for (const spec of arg.split(',')) {
    const [idx, lane = 0] = spec.split(':').map(Number);
    await ev(`__resetKart(__k, ${idx}, ${lane}); __snap()`);
    await sleep(2500);
    // ITEMS=1: parked items on the road ahead (kart-local x, z; y = the ground under the kart) to judge their size
    if (process.env.ITEMS) await ev(`(() => { window.__parked?.forEach((m) => m.removeFromParent());
      window.__parked = [['green', 2, 7], ['red', -2.5, 10], ['banana', 0.8, 5], ['banana', 3, 14], ['mushroom', -1, 18]].map(([kind, x, z]) =>
        __spawn(kind, __k.group.localToWorld(__k.group.position.clone().set(x, -0.61, z)))); })()`);
    await sleep(300);
    const s = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(process.env.OUT_DIR, `${tag}shot-${idx}${process.env.ITEMS ? '-items' : ''}.png`), Buffer.from(s.data, 'base64'));
  }
} else if (mode === 'studio') {
  // camera + look-at in kart-local space (kart faces +Z, left = +X), fov, and a forced rider pose (null = live)
  const STUDIO = {
    front: [[1.4, 1.5, 2.2], [0, 0.9, -0.3], 30, null],
    side: [[2.6, 1.2, -0.3], [0, 0.85, -0.5], 32, null],
    back: [[-0.9, 1.9, -3.4], [0, 0.9, -0.6], 30, null],
    chase: [[0, 3.5, -4.6], [0, -0.1, 8], 66, { speed: 1, steer: 0, drift: 0, boost: 0 }],
    fast: [[-1.2, 1.8, -3.2], [0, 0.9, -0.6], 32, { speed: 1, steer: 0, drift: 0, boost: 1 }],
    turn: [[0, 1.9, -3.4], [0, 0.9, -0.6], 30, { speed: 0.8, steer: 1, drift: 0.6, boost: 0 }],
    face: [[0.5, 1.15, 1.3], [0, 1.0, -0.2], 26, null],
    profile: [[6, 0.6, 0], [0, 0.3, 0], 30, null], // whole kart side-on: chassis vs driver proportions
    items: [[1.2, 1.4, 1.2], [1.2, -0.5, 5], 40, null], // item close-up: a banana, green, red parked ahead (on the road)
  };
  await ev(`(() => { document.getElementById('overlay').style.display = 'none';
    const r0 = __r.render.bind(__r);
    __r.render = (sc, c) => { const v = window.__view; if (v) {
      c.clearViewOffset(); c.fov = v[2]; c.updateProjectionMatrix();
      c.position.copy(__k.group.localToWorld(c.position.set(...v[0])));
      c.lookAt(__k.group.localToWorld(c.up.clone().set(...v[1])));
      if (v[3]) for (let i = 0; i < 20; i++) __k.rider.update?.(1 / 120, v[3]); }
      r0(sc, c); }; })()`);
  for (const name of arg.split(',')) {
    if (name === 'items') await ev(`[['banana', 1.2, 4.5], ['green', 2.6, 6.5], ['red', -0.3, 7]].forEach(([kind, x, z]) =>
      __spawn(kind, __k.group.localToWorld(__k.group.position.clone().set(x, -0.61, z))))`);
    await ev(`window.__view = ${JSON.stringify(STUDIO[name])}`);
    await sleep(2000);
    const s = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(process.env.OUT_DIR, `${tag}studio-${name}.png`), Buffer.from(s.data, 'base64'));
  }
} else if (mode === 'pick') {
  // lobby picker screens: open driver / kart / track, screenshot, tap the 3rd card, screenshot again
  const tap = async (sel) => {
    const r = JSON.parse(await ev(`JSON.stringify(document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect())`));
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  };
  const shot = async (name) => {
    const s = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(process.env.OUT_DIR, `${tag}pick-${name}.png`), Buffer.from(s.data, 'base64'));
  };
  await sleep(1500);
  for (const kind of arg.split(',')) {
    await tap(`.setup [data-pick="${kind}"]`);
    await sleep(2500);
    await shot(kind);
    await tap('#pick-list .pick-card:nth-child(3)');
    await sleep(2500);
    await shot(`${kind}-picked`);
    await tap('#btn-pick-done');
    await sleep(1500);
  }
} else if (mode === 'eval') {
  await sleep(5000); // countdown + ~1 s of racing
  console.log(await ev(`(() => { try { return String(${arg}); } catch (e) { return 'ERR ' + e.stack; } })()`));
} else if (mode === 'tap') {
  while ((await ev('__s.phase')) !== 'race') await sleep(100);
  // Teleport onto open grass outside the track heading +X at ~90 km/h, so no wall can interfere.
  await ev(`(() => { const b = __k.body; b.position.set(-60, 0.65, -200);
    b.quaternion.setFromAxisAngle({x:0,y:1,z:0}, Math.PI/2); b.velocity.set(25,0,0); b.angularVelocity.set(0,0,0);
    __in.gas = true; window.__m = {maxSlip:0, maxYaw:0}; window.__h0 = null;
    setInterval(() => { const f = b.quaternion.vmult({x:0,y:0,z:1}), v = b.velocity;
      if (Math.hypot(v.x, v.z) > 3 && window.__h0 !== null) {
        __m.maxSlip = Math.max(__m.maxSlip, Math.abs(Math.atan2(f.x*v.z - f.z*v.x, f.x*v.x + f.z*v.z)) * 57.3);
        __m.maxYaw = Math.max(__m.maxYaw, Math.abs(b.angularVelocity.y)); }
      window.__hd = Math.atan2(f.x, f.z) * 57.3; }, 16); })()`);
  await sleep(1500);
  await ev(`window.__h0 = __hd; __in.right = true; setTimeout(() => { __in.right = false; window.__hr = __hd; }, ${+arg * 1000});`);
  await sleep(+arg * 1000 + 1500);
  const rel = (x) => `((${x} - __h0 + 540) % 360 - 180).toFixed(1)`;
  console.log(`hold RIGHT ${arg}s:`, await ev(`'heading at release ' + ${rel('__hr')} + ' / +1.5s ' + ${rel('__hd')} + 'deg, maxSlip ' + __m.maxSlip.toFixed(1) + 'deg, maxYawRate ' + __m.maxYaw.toFixed(2) + ', speed ' + (__k.speed * 3.6).toFixed(0) + 'kmh'`));
}

if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
const shot = await send('Page.captureScreenshot');
fs.writeFileSync(path.join(process.env.OUT_DIR, `${tag}${mode}-final.png`), Buffer.from(shot.data, 'base64'));
process.exit(0);
