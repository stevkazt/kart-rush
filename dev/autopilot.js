// Injected into the page by dev/test.mjs. Drives the kart with the same on/off button inputs a
// player has (pure pursuit toward a point ~13 m ahead), backs up when stuck, and logs progress.
// Needs the debug globals (__k, __s, __t, __w, __in) that dev/test.sh adds to a temp copy of main.js.
(() => {
  const log = (window.__log = []);
  let stuckT = 0, t = 0, backT = 0;
  setInterval(() => {
    t += 0.05;
    const b = __k.body, S = __t.samples, N = __t.N, s = __s;
    if (s.phase !== 'race') return;
    const tgt = S[(s.trackIdx + 14) % N];
    const f = b.quaternion.vmult({ x: 0, y: 0, z: 1 });
    const yaw = Math.atan2(f.x, f.z);
    const want = Math.atan2(tgt.x - b.position.x, tgt.z - b.position.z);
    const d = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
    const st = -d * 2.5;
    __in.right = st > 0.15;
    __in.left = st < -0.15;
    if (backT > 0) {
      backT -= 0.05;
      __in.gas = false; __in.brake = true;
      [__in.left, __in.right] = [__in.right, __in.left];
    } else {
      __in.gas = true; __in.brake = false;
    }
    stuckT = Math.abs(s.speed) < 0.5 ? stuckT + 0.05 : 0;
    if (stuckT > 1.0 && backT <= 0) {
      backT = 1.2;
      const v = __k.vehicle;
      log.push(`STUCK t=${t.toFixed(1)} idx=${s.trackIdx} y=${b.position.y.toFixed(2)} wheelsHit=${v.wheelInfos.map((w) => (w.raycastResult.hasHit ? 1 : 0)).join('')}`);
    }
  }, 50);
  setInterval(() => log.push(`t=${t.toFixed(0)} phase=${__s.phase} lap=${__s.lap} best=${__s.bestLap.toFixed(1)} idx=${__s.trackIdx} v=${__s.speed.toFixed(1)} y=${__k.body.position.y.toFixed(2)}`), 5000);
})();
