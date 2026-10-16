// Drives the game in headless Chrome over the DevTools protocol. Run via dev/test.sh.
//   node test.mjs <port> autopilot <seconds>  -> full race with dev/autopilot.js, prints lap log
//   node test.mjs <port> trace <seconds> <probe.js> -> autopilot race plus an extra script that pushes to __log
//   node test.mjs <port> profile <seconds>   -> autopilot race with drawing switched off; prints the
//                                                functions using the most CPU (JS cost, not software GL)
//   node test.mjs <port> shots <idx,idx,...>  -> screenshots with the player parked at those track samples
//   node test.mjs <port> eval <js expr>       -> prints the expression ~1 s after GO
//   node test.mjs <port> tap <seconds>        -> on open grass at top speed, hold RIGHT for <seconds>,
//                                                prints heading change / slip / yaw rate
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , debugPort, mode, arg] = process.argv;
const here = path.dirname(fileURLToPath(import.meta.url));
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
await send('Page.navigate', { url: `http://localhost:${process.env.GAME_PORT}/index.html${process.env.TRACK ? `?track=${process.env.TRACK}` : ''}` });
// wait for the page (a track with heights takes longer to build), then START
for (let t = 0; t < 60 && (await ev(`typeof __s !== 'undefined' && __s.phase === 'menu'`)) !== true; t++) await sleep(500);
await sleep(500);
await ev(`document.getElementById('btn-start').click()`);

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
    const s = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join(process.env.OUT_DIR, `shot-${idx}.png`), Buffer.from(s.data, 'base64'));
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
fs.writeFileSync(path.join(process.env.OUT_DIR, `${mode}.png`), Buffer.from(shot.data, 'base64'));
process.exit(0);
