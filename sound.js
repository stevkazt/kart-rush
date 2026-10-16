/* ==========================================================================
 * Kart Rush sound: everything is synthesised with WebAudio (no asset files).
 *   sound.unlock()            call from a user gesture (Start button); creates/resumes the context
 *   sound.update(dt, mix)     every frame: engines, drift screech
 *   sound.<sfx>()             one-shots: beep, go, bump, boost, charged, lap, finalLap, finish, ...
 *   sound.music(mode)         'race' / 'menu' music loop, or false to stop
 *   sound.setMuted(bool)      remembered in localStorage
 * ========================================================================== */

const MUTE_KEY = 'kart-rush-muted';
const VOL = { master: 0.8, engine: 0.16, rivals: 0.09, drift: 0.07, sfx: 0.5, music: 0.11 };

let ctx = null;
let out, sfxBus, musicBus, engineBus, noiseBuf;
let player, rivals = [], drift;
let muted = readMuted();

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
    sfxBus = gainNode(VOL.sfx, comp);
    musicBus = gainNode(VOL.music, comp);
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

/** Kart engine: detuned saw + square through a lowpass, with a "putt" tremolo that fades with revs. */
function makeEngine(level, detune) {
  const pan = ctx.createStereoPanner();
  pan.connect(engineBus);
  const gain = gainNode(0, pan);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.7;
  filter.connect(gain);
  const trem = gainNode(1, filter);
  const a = ctx.createOscillator(), b = ctx.createOscillator();
  a.type = 'sawtooth';
  b.type = 'triangle';
  b.detune.value = 7 + detune;
  a.detune.value = detune;
  const bLevel = gainNode(0.5, trem);
  a.connect(trem);
  b.connect(bLevel);
  // Tremolo LFO: modulates trem.gain around 1
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  const lfoDepth = gainNode(0.3, trem.gain);
  lfo.connect(lfoDepth);
  [a, b, lfo].forEach((o) => o.start());
  return { a, b, lfo, lfoDepth, filter, gain, pan, level };
}

function setEngine(e, { ratio, throttle, vol, pan = 0 }) {
  const t = ctx.currentTime, k = 0.06; // smoothing time constant
  // Kept low and dark at top speed: a bright, high saw whine gets grating fast
  // (boosts push ratio to 1.3, so it's capped).
  ratio = Math.min(ratio, 1.1);
  const f = 45 + ratio * 85 + throttle * 8;
  e.a.frequency.setTargetAtTime(f, t, k);
  e.b.frequency.setTargetAtTime(f * 0.5, t, k);
  e.lfo.frequency.setTargetAtTime(f / 4, t, k);
  e.lfoDepth.gain.setTargetAtTime(0.35 * Math.max(0, 1 - ratio), t, k);
  e.filter.frequency.setTargetAtTime(380 + ratio * 520 + throttle * 200, t, k);
  e.gain.gain.setTargetAtTime(e.level * vol * (0.55 + 0.45 * throttle) * (1 - 0.3 * ratio), t, k);
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
 * mix = { live, duck, player: {ratio, throttle}, drift: 0..1, charged, rivals: [{ratio, throttle, dist, pan}] }
 */
function update(dt, mix) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  setEngine(player, { ...mix.player, vol: mix.live ? 1 : 0.6 });
  engineBus.gain.setTargetAtTime(mix.duck ? 0.12 : 1, t, mix.duck ? 0.5 : 0.15); // engines fade behind menus

  while (rivals.length < mix.rivals.length) rivals.push(makeEngine(VOL.rivals, (rivals.length + 1) * 23));
  mix.rivals.forEach((r, i) => {
    const near = Math.max(0, 1 - r.dist / 45);
    setEngine(rivals[i], { ratio: r.ratio, throttle: r.throttle, vol: near * near, pan: r.pan });
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

export const sound = { unlock, suspend, update, music, setMuted, get muted() { return muted; }, get context() { return ctx; }, ...sfx };
