// Runs one race on a fake clock with drawing off, as fast as the CPU allows. Result in window.__simResult.
window.__simRun = async (persona) => {
  __r.render = () => {};
  const DT = 1000 / 60, wait = () => new Promise((r) => setTimeout(r, 0));
  window.__manual();
  while (window.__qn() === 0) await new Promise((r) => setTimeout(r, 20)); // the pending native frame must queue the game loop first (slow under load)
  const S = () => __s.phase, tr = { air: {}, airKart: Array(__karts.length).fill(0), speed: {}, n: {}, steerOn: 0, steerSw: 0, idle: 0, idleMax: 0, ticks: 0, near: 0, placeCh: 0, stuck: 0, lifts: 0, lat: {} };
  let race = null, lastSteer = 0, lastPlace = null, back = 0, stuckT = 0, t = 0;
  const wrapEvents = () => {
    race = __tele.race; if (!race) return;
    const push = race.events.push.bind(race.events);
    race.events.push = (e) => { const k = __karts[e.kart]; if (k) { e.idx = e.idx ?? k.trackIdx; e.y = +k.body.position.y.toFixed(1); e.v = Math.round(k.speed * 3.6); } return push(e); };
  };
  const drive = () => {
    const k = __k, b = k.body, Sm = __t.samples, N = __t.N;
    const look = persona === 'skilled' ? 12 : 14;
    const tgt = Sm[(k.trackIdx + look) % N];
    const f = b.quaternion.vmult({ x: 0, y: 0, z: 1 });
    const yaw = Math.atan2(f.x, f.z), want = Math.atan2(tgt.x - b.position.x, tgt.z - b.position.z);
    const d = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw)), st = -d * 2.5;
    __in.right = st > 0.15; __in.left = st < -0.15;
    let brake = false, gas = true;
    // test personas: run wide on purpose in the sweeper; 'offwide' holds left for 1 s then recovers, 'offfence' holds left until 3 s pass
    if (persona.startsWith('off')) {
      const hold = persona === 'offwide' ? 1.0 : 3.0, i = k.trackIdx;
      if (i >= 610 && i < 640 && !window.__offT) window.__offT = t;
      if (i > 800) window.__offT = 0;
      if (window.__offT && t - window.__offT < hold) { __in.left = true; __in.right = false; }
      if (window.__offT && t - window.__offT < 8 && tr.ticks % 6 === 0) (tr.trace ||= []).push([+(t - window.__offT).toFixed(1), i, +(Math.hypot(b.velocity.x, b.velocity.z) * 3.6).toFixed(0), +((b.position.x - Sm[i].x) * __t.normals[i].x + (b.position.z - Sm[i].z) * __t.normals[i].z).toFixed(1)]);
    }
    if (persona === 'skilled') { // lifts/brakes for corners by reading the radius ahead (a good human)
      for (let s = 0; s < 60; s++) {
        const r = __t.lineRadius[(k.trackIdx + s) % N];
        if (r > 60) continue;
        const need = Math.sqrt(19 * r), dist = s * 0.93;
        if (k.speed > need && dist <= (k.speed ** 2 - need ** 2) / (2 * 6)) { gas = false; if (k.speed > need + 3) brake = true; break; }
      }
    }
    stuckT = Math.abs(k.speed) < 0.5 ? stuckT + DT / 1000 : 0;
    if (persona !== 'vertical' && stuckT > 1 && back <= 0) { back = 1.2; tr.stuck++; }
    if (back > 0) { back -= DT / 1000; gas = false; brake = true; [__in.left, __in.right] = [__in.right, __in.left]; }
    __in.gas = gas; __in.brake = brake;
    __in.item = !!(k.item && k.itemRoll <= 0 && Math.random() < 0.02);
  };
  const stat = () => {
    tr.ticks++;
    const k = __k, bin = Math.floor(k.trackIdx / 10) * 10, sg = __in.right ? 1 : __in.left ? -1 : 0;
    tr.speed[bin] = (tr.speed[bin] || 0) + k.speed * 3.6; tr.n[bin] = (tr.n[bin] || 0) + 1;
    if (sg) tr.steerOn++;
    if (sg && sg !== lastSteer) tr.steerSw++;
    if (sg) { tr.idle = 0; } else { tr.idle += DT / 1000; tr.idleMax = Math.max(tr.idleMax, tr.idle); }
    lastSteer = sg || lastSteer;
    if (lastPlace !== null && k.place !== lastPlace) tr.placeCh++;
    lastPlace = k.place;
    let near = 0;
    __karts.forEach((o, i) => {
      if (o !== k && o.body.position.distanceTo(k.body.position) < 20) near++;
      const hits = o.vehicle.wheelInfos.filter((w) => w.raycastResult.hasHit).length;
      if (hits === 0) { tr.airKart[i] += DT / 1000; const b2 = Math.floor(o.trackIdx / 50) * 50; tr.air[b2] = (tr.air[b2] || 0) + DT / 1000; }
    });
    tr.near += near;
  };
  let guard = 0;
  while (guard++ < 60 * 700) {
    for (let i = 0; i < 40 && guard < 60 * 700; i++, guard++) {
      if (S() === 'race' || S() === 'finished') { if (!race) wrapEvents(); if (S() === 'race') drive(); stat(); t += DT / 1000; }
      window.__adv(DT);
      if (__karts.every((k) => k.finished) || (__k.finished && S() !== 'race' && S() !== 'finished')) { guard = 1e9; break; }
    }
    await wait();
  }
  const out = race || {};
  out.events = race ? [...race.events] : [];
  window.__simResult = { persona, N: __t.N, spacing: __t.spacing, track: __t.id, diff: out.diff, view: out.view, karts: out.karts, events: out.events, samples: out.samples,
    finished: __karts.map((k) => ({ name: k.name, fin: k.finished, time: k.finished ? +k.finishTime.toFixed(2) : null, place: k.place, lap: k.lap, resets: k.ai?.resets || 0 })), tr, simT: t };
};
