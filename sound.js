/* ==========================================================================
 * Kart Rush sound: everything is synthesised with WebAudio (no asset files).
 *   sound.unlock()            call from a user gesture (Start button); creates/resumes the context
 *   sound.update(dt, mix)     every frame: engines, drift screech
 *   sound.<sfx>()             one-shots: beep, go, bump, boost, charged, lap, finalLap, finish, ...
 *   sound.music(mode)         'race' / 'menu' music loop, or false to stop
 *   sound.setMuted(bool)      remembered in localStorage
 *   sound.setVolume(bus, v)   'music' | 'sfx' (effects, engines, drift squeal), 0..1 (Settings; the game remembers it)
 * ========================================================================== */

const MUTE_KEY = 'kart-rush-muted';
const VOL = { master: 0.8, engine: 0.16, rivals: 0.09, drift: 0.07, sfx: 0.5, music: 0.11 };

let ctx = null;
let out, sfxBus, musicBus, engineBus, noiseBuf;
let player, rivals = [], drift;
let muted = readMuted();
const level = { music: 1, sfx: 1 };

function readMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

/** Creates the audio graph on first call. Must run inside a user gesture on iOS. */
function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // iOS: play through the ringer/silent switch like a game, not like a notification
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older iOS */ }
    ctx = new AC();
    out = gainNode(muted ? 0 : VOL.master, ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.connect(out);
    sfxBus = gainNode(VOL.sfx * level.sfx, comp);
    musicBus = gainNode(VOL.music * level.music, comp);
    engineBus = gainNode(1, comp);
    noiseBuf = makeNoise();
    player = makeEngine(VOL.engine, 0);
    drift = makeDrift();
    if (musicMode) music(musicMode); // e.g. the title music, asked for before the first tap
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
}

function gainNode(value, dest) {
  const g = ctx.createGain();
  g.gain.value = value;
  if (dest) g.connect(dest);
  return g;
}

function makeNoise() {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function noiseSource(loop = false) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = loop;
  return src;
}

/**
 * Kart engine: a soft hum (harmonics rolling off as 1/k^2, between a sawtooth's 1/k, which grated at a steady
 * pitch, and a sine) plus a sub an octave down, through a lowpass, with a gentle "putt" tremolo. Pitch
 * follows revs, not speed: see engineRevs. Build 29 made it softer again (user: annoying after the items
 * came in): 1/k^1.5 -> 1/k^2, square tremolo -> sine and shallower, lowpass ~35% lower.
 */
let engineWave = null;
function makeEngine(level, detune) {
  if (!engineWave) {
    const n = 16, real = new Float32Array(n), imag = new Float32Array(n);
    for (let k = 1; k < n; k++) imag[k] = 1 / k ** 2;
    engineWave = ctx.createPeriodicWave(real, imag);
  }
  const pan = ctx.createStereoPanner();
  pan.connect(engineBus);
  const gain = gainNode(0, pan);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.7;
  filter.connect(gain);
  const trem = gainNode(1, filter);
  const a = ctx.createOscillator(), b = ctx.createOscillator();
  a.setPeriodicWave(engineWave);
  b.type = 'triangle';
  b.detune.value = 7 + detune;
  a.detune.value = detune;
  const bLevel = gainNode(0.5, trem);
  a.connect(trem);
  b.connect(bLevel);
  // Tremolo LFO: modulates trem.gain around 1
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  const lfoDepth = gainNode(0.3, trem.gain);
  lfo.connect(lfoDepth);
  [a, b, lfo].forEach((o) => o.start());
  return { a, b, lfo, lfoDepth, filter, gain, pan, level,
    rpm: 0.3, gear: 0, shift: 0, change: 0, phase: Math.random() * 10 };
}

// Speed ratio at which each virtual gear tops out. Upshifts drop the revs: accelerating sounds like
// "rrrRRR-rrRRR" instead of one long slide up to a fixed note.
const GEARS = [0, 0.3, 0.55, 0.78, 1];

/**
 * Revs 0..~1.1 from speed through the gears; free-revving when the wheels are off the ground, sagging
 * when off the gas. Also tracks how much the revs are changing (`change`), which sets how present the
 * engine is: a steady drone at top speed fades back after a couple of seconds.
 */
function engineRevs(e, ratio, throttle, air, dt) {
  let g = e.gear;
  while (g < GEARS.length - 2 && ratio > GEARS[g + 1] + 0.02) g++;
  while (g > 0 && ratio < GEARS[g] - 0.05) g--;
  if (g > e.gear) e.shift = 0.14; // the lift while the next gear goes in
  e.gear = g;
  const within = Math.min(1.15, Math.max(0, (ratio - GEARS[g]) / (GEARS[g + 1] - GEARS[g])));
  let target = 0.32 + 0.6 * within;
  if (!throttle) target -= 0.08;
  if (air) target = Math.min(1.12, target + 0.22); // wheels spinning free over a jump
  if (e.shift > 0) { e.shift -= dt; target -= 0.06; }
  const before = e.rpm;
  e.rpm += (target - e.rpm) * (1 - Math.exp(-dt * (air ? 10 : 7)));
  const rate = Math.abs(e.rpm - before) / Math.max(dt, 1e-3);
  e.change += (Math.min(1, rate * 3 + (e.shift > 0 ? 1 : 0)) - e.change) * (1 - Math.exp(-dt * (rate > 0.05 ? 6 : 0.8)));
}

function setEngine(e, { ratio, throttle, air = false, vol, pan = 0 }, dt) {
  const t = ctx.currentTime, k = 0.06; // smoothing time constant
  engineRevs(e, Math.min(ratio, 1.3), throttle, air, dt);
  // a little unsteadiness, so even a held top speed isn't one fixed note
  const wobble = 1 + 0.012 * Math.sin(t * 2.3 + e.phase) + 0.008 * Math.sin(t * 5.7 + e.phase * 2);
  const f = (40 + e.rpm * 92) * wobble;
  e.a.frequency.setTargetAtTime(f, t, k);
  e.b.frequency.setTargetAtTime(f * 0.5, t, k);
  e.lfo.frequency.setTargetAtTime(f / 4, t, k);
  e.lfoDepth.gain.setTargetAtTime(0.06 + 0.14 * Math.max(0, 1 - e.rpm), t, k);
  e.filter.frequency.setTargetAtTime(260 + e.rpm * 320 + throttle * 100, t, k);
  // present when the revs move (pulling away, shifts, corners, jumps), ~60% at a steady cruise
  const presence = 0.6 + 0.4 * e.change;
  const shiftDip = e.shift > 0 ? 0.6 : 1;
  e.gain.gain.setTargetAtTime(e.level * vol * (0.6 + 0.4 * throttle) * presence * shiftDip, t, k);
  e.pan.pan.setTargetAtTime(pan, t, k);
}

/** Looping tyre squeal (band-passed noise), faded in while drifting. */
function makeDrift() {
  const src = noiseSource(true);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 6;
  const gain = gainNode(0, engineBus);
  src.connect(bp).connect(gain);
  src.start();
  return { bp, gain };
}

/**
 * Per-frame mix.
 * mix = { live, duck, player: {ratio, throttle, air}, drift: 0..1, charged, rivals: [{ratio, throttle, air, dist, pan}] }
 */
function update(dt, mix) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  setEngine(player, { ...mix.player, vol: mix.live ? 1 : 0.6 }, dt);
  engineBus.gain.setTargetAtTime(level.sfx * (mix.duck ? 0.12 : 1), t, mix.duck ? 0.5 : 0.15); // engines fade behind menus

  while (rivals.length < mix.rivals.length) rivals.push(makeEngine(VOL.rivals, (rivals.length + 1) * 23));
  mix.rivals.forEach((r, i) => {
    const near = Math.max(0, 1 - r.dist / 45);
    setEngine(rivals[i], { ratio: r.ratio, throttle: r.throttle, air: r.air, vol: near * near, pan: r.pan }, dt);
  });

  drift.gain.gain.setTargetAtTime(VOL.drift * mix.drift, t, 0.05);
  drift.bp.frequency.setTargetAtTime(mix.charged ? 2600 : 1800, t, 0.05);
}

// ---------- One-shot helpers ----------
function tone(freq, start, dur, { type = 'square', vol = 0.3, slide = 0, bus = sfxBus } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, start + dur);
  const g = gainNode(0, bus);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  o.connect(g);
  o.start(start);
  o.stop(start + dur + 0.02);
}

function noiseHit(start, dur, { freq = 800, type = 'lowpass', vol = 0.4, sweepTo = 0, q = 1, bus = sfxBus } = {}) {
  const src = noiseSource();
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, start);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, start + dur);
  const g = gainNode(0, bus);
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  src.connect(f).connect(g);
  src.start(start, Math.random() * 0.5);
  src.stop(start + dur + 0.02);
}

const ready = () => ctx && ctx.state === 'running';
const now = () => ctx.currentTime + 0.01;
const notes = (list, step, opts) => { const t = now(); list.forEach((f, i) => f && tone(f, t + i * step, step * 1.6, opts)); };

let lastBump = 0;
let starTimer = 0;
let starBus = null; // the star theme's own gain, so it can be cut when the star ends
const sfx = {
  beep() { if (ready()) tone(440, now(), 0.18, { vol: 0.25 }); },
  go() { if (ready()) tone(880, now(), 0.5, { vol: 0.3 }); },
  stall() { if (ready()) notes([98, 0, 82, 0, 73], 0.07, { type: 'square', vol: 0.2, slide: 0.7 }); },
  bump(strength = 1) {
    if (!ready() || ctx.currentTime - lastBump < 0.12) return;
    lastBump = ctx.currentTime;
    const s = Math.min(1, strength);
    tone(90, now(), 0.18, { type: 'sine', vol: 0.5 * s, slide: 0.5 });
    noiseHit(now(), 0.15, { freq: 900, vol: 0.35 * s });
  },
  boost() {
    if (!ready()) return;
    noiseHit(now(), 0.7, { freq: 400, sweepTo: 4000, type: 'bandpass', q: 1.5, vol: 0.5 });
    tone(220, now(), 0.5, { type: 'sawtooth', vol: 0.12, slide: 2 });
  },
  charged() { if (ready()) notes([1318, 1760], 0.06, { type: 'triangle', vol: 0.18 }); },
  lap() { if (ready()) notes([784, 1047], 0.09, { type: 'triangle', vol: 0.25 }); },
  finalLap() { if (ready()) notes([523, 659, 784, 1047, 0, 1047], 0.08, { vol: 0.15 }); },
  finish(win) {
    if (!ready()) return;
    const tune = win ? [523, 659, 784, 1047, 0, 784, 1047, 1319] : [392, 523, 659, 0, 523, 659];
    notes(tune, 0.11, { vol: 0.18 });
    notes(tune.map((f) => f / 2), 0.11, { type: 'triangle', vol: 0.18 });
  },
  overtake() { if (ready()) tone(1200, now(), 0.08, { type: 'triangle', vol: 0.12, slide: 1.3 }); },
  click() { if (ready()) tone(660, now(), 0.05, { type: 'triangle', vol: 0.15 }); },
  /** Box smash, then roulette ticks for `roll` seconds and a "got it" ding. */
  itemBox(roll) {
    if (!ready()) return;
    const t = now();
    noiseHit(t, 0.12, { freq: 3000, type: 'highpass', vol: 0.3 });
    for (let s = 0.05; s < roll; s += 0.07) tone(900 + ((s * 100) % 3) * 200, t + s, 0.04, { type: 'square', vol: 0.06 });
    tone(1568, t + roll, 0.25, { type: 'triangle', vol: 0.2 });
  },
  /** An item box popped (anyone's): a boom, a glassy shatter and a quick sparkle run. `v` 0..1 = loudness. */
  boxPop(v = 1) {
    if (!ready() || v <= 0.02) return;
    const t = now();
    tone(160, t, 0.22, { type: 'sine', vol: 0.4 * v, slide: 0.4 });
    noiseHit(t, 0.3, { freq: 2500, sweepTo: 6000, type: 'bandpass', q: 1, vol: 0.4 * v });
    [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, t + 0.04 + i * 0.045, 0.14, { type: 'triangle', vol: 0.14 * v }));
  },
  /** A green shell blowing up. `v` 0..1 = loudness. */
  shellBang(v = 1) {
    if (!ready()) return;
    const t = now();
    tone(130, t, 0.3, { type: 'sine', vol: 0.5 * v, slide: 0.3 });
    noiseHit(t, 0.35, { freq: 1800, sweepTo: 300, type: 'lowpass', vol: 0.5 * v });
  },
  drop() { if (ready()) tone(300, now(), 0.15, { type: 'triangle', vol: 0.2, slide: 0.6 }); },
  throwShell() {
    if (!ready()) return;
    noiseHit(now(), 0.25, { freq: 2000, sweepTo: 600, type: 'bandpass', q: 2, vol: 0.35 });
  },
  spin() {
    if (!ready()) return;
    tone(700, now(), 0.7, { type: 'square', vol: 0.15, slide: 0.25 });
    noiseHit(now(), 0.2, { freq: 1200, vol: 0.4 });
  },
  hitOther() { if (ready()) notes([880, 1175], 0.07, { type: 'square', vol: 0.12 }); },
  warn() { if (ready()) tone(1400, now(), 0.12, { type: 'square', vol: 0.12 }); },
  shieldUp() {
    if (!ready()) return;
    tone(400, now(), 0.35, { type: 'sine', vol: 0.25, slide: 2.5 });
    notes([0, 0, 1568, 2093], 0.05, { type: 'triangle', vol: 0.1 });
  },
  shieldPop() {
    if (!ready()) return;
    noiseHit(now(), 0.18, { freq: 5000, type: 'highpass', vol: 0.4 });
    tone(1800, now(), 0.25, { type: 'sine', vol: 0.2, slide: 0.4 });
  },
  /** Star: a rising whoosh, then its own bouncy sparkling theme for as long as it lasts (dur s). Was a short
   * jingle that sounded like the lap / final-lap ones (user: "play a different sound"). */
  star(dur = 6) {
    if (!ready()) return;
    const t = now();
    starBus?.disconnect();
    starBus = gainNode(1, sfxBus);
    noiseHit(t, 0.6, { freq: 600, sweepTo: 7000, type: 'bandpass', q: 2, vol: 0.35, bus: starBus });
    tone(262, t, 0.5, { type: 'sawtooth', vol: 0.1, slide: 4, bus: starBus });
    const riff = [523, 784, 1047, 784, 587, 880, 1175, 880, 659, 988, 1319, 988, 698, 1047, 1397, 1047];
    // Scheduled ~0.5 s ahead from a timer, not all ~170 notes at once (that made iPhones hitch when the star started)
    clearInterval(starTimer);
    let s = 0.4, i = 0;
    const bus = starBus;
    const feed = () => {
      if (bus !== starBus || !ctx || ctx.currentTime > t + dur) { clearInterval(starTimer); return; }
      while (s < dur - 0.15 && t + s < ctx.currentTime + 0.5) {
        const f = riff[i % riff.length];
        tone(f, t + s, 0.08, { type: 'square', vol: 0.06, bus });
        if (i % 2 === 0) tone(f / 4, t + s, 0.16, { type: 'triangle', vol: 0.12, bus });
        if (i % 4 === 1) tone(f * 2, t + s, 0.06, { type: 'sine', vol: 0.05, bus }); // sparkle
        s += 0.09; i++;
      }
      if (s >= dur - 0.15) clearInterval(starTimer);
    };
    feed();
    starTimer = setInterval(feed, 200);
  },
  starEnd() {
    if (!ready()) return;
    clearInterval(starTimer);
    starBus?.gain.setTargetAtTime(0, ctx.currentTime, 0.03); // cut whatever of the theme is left
    notes([1047, 784, 523], 0.07, { type: 'triangle', vol: 0.12 });
  },
  bullet() {
    if (!ready()) return;
    noiseHit(now(), 0.4, { freq: 300, vol: 0.6 });
    noiseHit(now(), 1.2, { freq: 600, sweepTo: 3000, type: 'bandpass', q: 1, vol: 0.4 });
    tone(110, now(), 1.0, { type: 'sawtooth', vol: 0.12, slide: 2 });
  },
  blueLaunch() {
    if (!ready()) return;
    noiseHit(now(), 0.8, { freq: 3000, sweepTo: 500, type: 'bandpass', q: 3, vol: 0.35 });
    notes([1760, 0, 1760, 0, 1760], 0.06, { type: 'sine', vol: 0.1 });
  },
  explosion(strength = 1) {
    if (!ready()) return;
    noiseHit(now(), 1.1, { freq: 1500, sweepTo: 80, vol: 0.8 * strength });
    tone(70, now(), 0.8, { type: 'sine', vol: 0.5 * strength, slide: 0.4 });
  },
};

// ---------- Music: little step-sequenced chiptune loops ----------
// 16 steps per bar, 4 bars (C - G - Am - F). Scheduled slightly ahead with a timer.
// 'race': driving bass, lead and drums. 'menu': slower and softer (arpeggios, light kick), for the title
// and results screens.
const CHORDS = [[48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48]]; // MIDI roots + triads
const LEAD = [ // scale degrees in semitones above the chord root (+12), -1 = rest
  [12, -1, 16, -1, 19, -1, 16, 19, 24, -1, 19, -1, 16, -1, 19, -1],
  [12, -1, 16, -1, 19, -1, 24, -1, 23, -1, 19, -1, 16, -1, 14, -1],
  [12, -1, 15, -1, 19, -1, 15, 19, 24, -1, 22, -1, 19, -1, 15, -1],
  [12, -1, 16, -1, 19, 21, 19, -1, 16, -1, 14, -1, 12, -1, 11, -1],
];
const MENU_ARP = [0, 12, 7, 12, 4, 12, 7, 12]; // offsets from the chord root, eighth notes
const BPM = { race: 148, menu: 96 };
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
let musicTimer = 0, musicStep = 0, musicNext = 0, musicMode = null;

/** music('race' | 'menu' | false). Before the first tap (no audio yet) the wish is kept for unlock(). */
function music(mode) {
  musicMode = mode || null;
  if (!ctx) return;
  clearInterval(musicTimer);
  musicTimer = 0;
  if (!musicMode) return;
  musicStep = 0;
  musicNext = ctx.currentTime + 0.1;
  musicTimer = setInterval(scheduleMusic, 25);
}

function scheduleMusic() {
  if (ctx.state !== 'running') { musicNext = ctx.currentTime + 0.1; return; }
  const STEP = 60 / BPM[musicMode] / 4;
  while (musicNext < ctx.currentTime + 0.12) {
    const bar = (musicStep >> 4) % 4, s = musicStep % 16, t = musicNext;
    const [root, third, fifth] = CHORDS[bar];
    const opt = { bus: musicBus };
    if (musicMode === 'menu') {
      // Arpeggio on eighths, a soft bass note per half bar, the lead every other bar, a gentle kick
      if (s % 2 === 0) tone(midi(root + 12 + MENU_ARP[(s >> 1) % 8]), t, STEP * 1.6, { ...opt, type: 'triangle', vol: 0.22 });
      if (s % 8 === 0) tone(midi(root - 12), t, STEP * 7, { ...opt, type: 'triangle', vol: 0.4 });
      const l = LEAD[bar][s];
      if ((musicStep >> 6) % 2 === 1 && l >= 0 && s % 4 === 0) tone(midi(root + l + 12), t, STEP * 3.5, { ...opt, type: 'square', vol: 0.06 });
      if (s % 8 === 0) tone(120, t, 0.1, { ...opt, type: 'sine', vol: 0.35, slide: 0.4 });
      if (s % 8 === 4) [third, fifth].forEach((n) => tone(midi(n), t, STEP * 3, { ...opt, type: 'sine', vol: 0.12 }));
    } else {
      // Bass: driving eighths, octave jump on the off-beat
      if (s % 2 === 0) tone(midi(root - 12 + (s % 4 === 2 ? 12 : 0)), t, STEP * 1.8, { ...opt, type: 'square', vol: 0.35 });
      // Lead
      const l = LEAD[bar][s];
      if (l >= 0) tone(midi(root + l + 12), t, STEP * 1.9, { ...opt, type: 'triangle', vol: 0.45 });
      // Chord stabs on the off-beats
      if (s % 4 === 2) [third, fifth].forEach((n) => tone(midi(n + 12), t, STEP * 0.9, { ...opt, type: 'square', vol: 0.08 }));
      // Drums: kick on the beat, snare on 2 and 4, hats on eighths
      if (s % 4 === 0) tone(150, t, 0.12, { ...opt, type: 'sine', vol: 0.8, slide: 0.3 });
      if (s % 8 === 4) noiseHit(t, 0.12, { ...opt, freq: 1800, type: 'bandpass', vol: 0.5 });
      if (s % 2 === 0) noiseHit(t, 0.03, { ...opt, freq: 7000, type: 'highpass', vol: 0.2 });
    }
    musicNext += STEP;
    musicStep++;
  }
}

function setVolume(bus, v) {
  level[bus] = v;
  if (!ctx) return;
  if (bus === 'music') musicBus.gain.setTargetAtTime(VOL.music * v, ctx.currentTime, 0.03);
  else sfxBus.gain.setTargetAtTime(VOL.sfx * v, ctx.currentTime, 0.03); // engines: update() reads level.sfx
}

function setMuted(m) {
  muted = m;
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* private mode */ }
  if (ctx) out.gain.setTargetAtTime(m ? 0 : VOL.master, ctx.currentTime, 0.03);
}

// Pause audio when the app is backgrounded.
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  // Only suspend here: the game resumes audio itself (it stays off while the race is paused)
  if (document.hidden) ctx.suspend().catch(() => {});
});

/** Pause: freeze all audio (unlock() resumes it). */
function suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); }

export const sound = { unlock, suspend, update, music, setMuted, setVolume, get muted() { return muted; }, get context() { return ctx; }, ...sfx };
