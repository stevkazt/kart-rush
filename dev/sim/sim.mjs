import fs from 'node:fs';
const [,, port, gamePort, track, persona, count, outfile] = process.argv;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const pending = {};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) pending[m.id](m.result ?? m); if (m.method === 'Runtime.exceptionThrown') console.error('EXC', JSON.stringify(m.params.exceptionDetails).slice(0, 300)); };
await new Promise((r) => { ws.onopen = r; });
const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: false }); return r.result?.value; };
await send('Runtime.enable'); await send('Page.enable');
const view = persona === 'vertical' ? 'vertical' : 'landscape', diff = persona === 'skilled' ? 'hard' : persona === 'medium' ? 'medium' : 'easy';
await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('kartrush.profile','{"name":"Test","age":30}'); localStorage.setItem('kartrush.view','${view}'); localStorage.setItem('kartrush.diff','${diff}');
 (() => { const rn = performance.now.bind(performance), rr = window.requestAnimationFrame.bind(window); let man = false, fake = 0, q = [];
  performance.now = () => (man ? fake : rn());
  window.requestAnimationFrame = (cb) => { if (man) { q.push(cb); return 1; } return rr((t) => (man ? q.push(cb) : cb(t))); };
  window.__manual = () => { fake = rn(); man = true; }; window.__qn = () => q.length;
  window.__adv = (ms) => { fake += ms; const c = q; q = []; c.forEach((f) => f(fake)); }; })()` });
const page = fs.readFileSync(new URL('./sim-page.js', import.meta.url), 'utf8');
for (let n = 0; n < +count; n++) {
  const t0 = Date.now();
  await send('Page.navigate', { url: `http://localhost:${gamePort}/index.html?track=${track}` });
  await sleep(800);
  for (let t = 0; t < 120 && (await ev(`typeof __s !== 'undefined' && __s.phase === 'menu'`)) !== true; t++) await sleep(500);
  await sleep(500);
  await ev(`document.getElementById('btn-start').click()`);
  await ev(page);
  await sleep(200);
  await ev(`window.__simRun(${JSON.stringify(persona)}).catch(e=>{window.__simErr=String(e.stack)})`);
  let res = null;
  for (let t = 0; t < 900 && !res; t++) { await sleep(500); const err = await ev('window.__simErr'); if (err) { console.error(err); break; } res = await ev('window.__simResult ? JSON.stringify(window.__simResult) : null'); }
  if (res) { fs.appendFileSync(outfile, res + '\n'); const r = JSON.parse(res); console.log(track, persona, n, 'wall', ((Date.now() - t0) / 1000).toFixed(0) + 's', 'sim', r.simT.toFixed(0) + 's', 'diff', r.diff, r.view, 'place', r.finished[0].place, 'time', r.finished[0].time, 'ev', r.events.length); }
  else console.log(track, persona, n, 'NO RESULT');
}
process.exit(0);
