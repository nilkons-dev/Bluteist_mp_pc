/**
 * 8D audio v4 "IEM Studio" — a fully offline, real-time spatial stage built from Web Audio nodes only (no model, no download).
 *
 * What v4 adds on top of v3 (see each section below):
 *   - five bands per ear instead of three, so more instruments get their own place on the stage;
 *   - IEM tuning curves (Harman-style, warm, bright, vocal, bassy) on the finished signal;
 *   - split-band treble smoothing (a de-esser on the voice, a tamer on the air) so presence and detail never turn harsh;
 *   - a detail control (air shelf + more harmonic sparkle on the instruments);
 *   - every compressor's built-in make-up gain cancelled and every parallel path time-aligned (see compMakeupDb), so
 *     parallel compression adds body instead of a loud, squashed, comb-filtered copy;
 *   - automatic level matching: 8D on is never louder than 8D off, so it cannot fake "better" by being louder.
 *
 *   mid  = (L + R) / 2   the centre of the mix: lead vocal, bass, kick, snare
 *   side = (L − R) / 2   what is panned to the sides: guitars, keys, strings, backing vocals, stereo effects
 *
 *   VOCAL   mid between BASS_HZ and AIR_HZ stays dry, dead centre and still — polished for clarity (mud cut,
 *           presence + air lift).
 *   BASS    mid below BASS_HZ stays dead centre, mono, and is BOOSTED while 8D is on (shelf + punch bump).
 *   LEFT    +side → three frequency bands, hard in the LEFT ear.
 *   RIGHT   −side → the same three bands, hard in the RIGHT ear. Each ear gets only its own group (no HRTF
 *           cross-talk), so the split is unmistakable on headphones.
 *   SWAY    the groups drift slowly in and out along their own side (equal-power panning: constant loudness) while
 *           a soft low-pass opens and closes, so the sound seems to travel in front of and behind the ear without
 *           ever jumping, getting louder, or changing sides.
 *   AIR     mid above AIR_HZ (cymbals, hi-hats, breath) floats steadily behind the head.
 *   POCKET  the instrument bus is dipped where the voice lives, so the words cut through.
 *   ROOM    a short generated reverb, high-passed so it never clouds the voice.
 *
 * The motion is driven by oscillators wired straight into AudioParams, so it keeps going when the window is hidden
 * and nothing runs on the UI thread. When the effect is off its nodes are disconnected and cost nothing.
 */

/** Below this the mid is bass/kick: dry, centre, mono. */
export const BASS_HZ = 160;
/** Crossover between the centre vocal and the floating "air" (Hz). */
export const AIR_HZ = 6500;
/** Side-signal band edges (Hz): below the first the side is rumble and is left out. */
export const SIDE_HP_HZ = 90;
export const SIDE_SPLITS_HZ = [250, 700, 1800, 4000] as const;
/** Bands per ear: one more than there are split points. */
export const SIDE_BANDS = SIDE_SPLITS_HZ.length + 1;
/** DynamicsCompressorNode look-ahead (s). Every path that has no compressor is delayed by this so all stay in time. */
export const COMP_LATENCY_S = 0.006;
/** After the band split the voice passes one more compressor stage (its leveller); the bass, the sides and the air wait this long for it. */
export const STAGE_LATENCY_S = COMP_LATENCY_S;
/** Distance of the air sources from the head. Panner roll-off is 0, so this only sets direction, never loudness. */
export const STAGE_RADIUS = 2;

export interface EightDParams {
  /** 0..1 — how far each group sways along its own side: 0 holds it still, 1 is a wide, slow drift */
  motion: number;
  /** 0..1 — sway speed, 0.5× at 0 up to 2× at 1 (see speedFactor) */
  speed: number;
  /** 0..1 — how much room the stage has */
  space: number;
  /** 0..1 — how hard the instruments are pushed into the two ears (how far out they sit + level of the side groups) */
  separation: number;
  /** 0..1 — how much the voice is polished and the instruments are dipped out of its way */
  clarity: number;
  /** 0..1 — how much extra bass 8D adds (0 = none, 1 = about +8 dB shelf plus punch and harmonics) */
  bass: number;
  /** 0..1 — attack and body of every note: parallel slow-attack compression + a touch of harmonic excitement */
  punch: number;
  /** 0..1 — micro-detail: an air shelf on the whole signal and more harmonic sparkle on the instruments */
  detail: number;
  /** 0..1 — treble smoothing: how much of the voice's and the air's top end is held back when it gets sharp (sibilance, hi-hat spikes) */
  tame: number;
  /** the overall tonal balance, an IEM-style target curve (see TUNINGS) */
  tuning: EightDTuning;
  /** 0..1 — "around you": how much of the finished sound travels in a full circle around the head (0 = none, 1 = all of it) */
  orbit: number;
}

/** IEM-style tonal balances, applied to the finished signal. "reference" leaves the tone alone. */
export const TUNINGS = ["reference", "harman", "warm", "bright", "vocal", "vshape"] as const;
export type EightDTuning = (typeof TUNINGS)[number];

export const DEFAULT_EIGHT_D: EightDParams = { motion: 0.5, speed: 0.5, space: 0.3, separation: 0.8, clarity: 0.65, bass: 0.7, punch: 0.7, detail: 0.5, tame: 0.5, tuning: "reference", orbit: 0.65 };

/** Is this one of the tuning ids? (Settings written by another build may hold anything.) */
export function isTuning(v: unknown): v is EightDTuning {
  return typeof v === "string" && (TUNINGS as readonly string[]).includes(v);
}

/** The bands of each group start this far (radians) apart in the sway, so a group is a stage, not a point. */
export const BAND_PHASES = [0, 0.7, 1.4, 2.1, 2.8] as const;

/** One sway period at speed 0.5 (seconds for there-and-back). Every band shares it, so the stage stays coherent. */
export const SWAY_PERIOD_S = 22;

/** The air pair, behind the head (az degrees clockwise from straight ahead; the listener faces −z, +x is the right ear). */
export const AIR_STAGE = [
  { az: -150, y: 0.8 },
  { az: 150, y: 0.8 },
] as const;

/** Speed slider (0..1) → multiplier on the orbit rate: 0 → 0.5×, 0.5 → 1×, 1 → 2× (exponential, so the middle is "normal"). */
export function speedFactor(speed: number): number {
  const s = Math.min(1, Math.max(0, Number.isFinite(speed) ? speed : 0.5));
  return Math.pow(2, (s - 0.5) * 2);
}

/** Sway frequency in Hz at a given speed slider value. */
export function orbitHz(speed: number): number {
  return speedFactor(speed) / SWAY_PERIOD_S;
}

/**
 * Where the ears' groups sit. edge = how far out a group can go (|pan| 0.75..1); depth = how far it drifts inward
 * at full sway; the pan of the left group is −mid + amp·sin(φ), the right group's is +mid − amp·sin(φ).
 */
export function panPlan(motion: number, separation: number): { edge: number; mid: number; amp: number } {
  const m = Math.min(1, Math.max(0, Number.isFinite(motion) ? motion : 0));
  const sep = Math.min(1, Math.max(0, Number.isFinite(separation) ? separation : 0));
  const edge = 0.75 + 0.25 * sep;
  const depth = 0.5 * m * edge;
  return { edge, mid: edge - depth / 2, amp: depth / 2 };
}

/** Pan (−1 left … +1 right) of a group at phase φ (rad). Never leaves its own side, never reaches the centre. */
export function groupPan(side: "left" | "right", motion: number, separation: number, phi: number): number {
  const { mid, amp } = panPlan(motion, separation);
  return side === "left" ? -mid + amp * Math.sin(phi) : mid - amp * Math.sin(phi);
}

/** Cue low-pass (Hz) that makes inward sway sound a little further away: bright at the edge, softer inward. */
export const CUE_BASE_HZ = 14000;
export const CUE_DEPTH_HZ = 5000;
export function cueHz(side: "left" | "right", motion: number, phi: number): number {
  const m = Math.min(1, Math.max(0, Number.isFinite(motion) ? motion : 0));
  const k = side === "left" ? -Math.sin(phi) : Math.sin(phi); // +1 at the outer edge
  return CUE_BASE_HZ - CUE_DEPTH_HZ * m * (1 - k) / 2;
}

/** PeriodicWave coefficients for sin(φ + phase): lets one oscillator per band carry a phase offset. */
export function sinWithPhase(phase: number): { real: Float32Array; imag: Float32Array } {
  return { real: new Float32Array([0, Math.sin(phase)]), imag: new Float32Array([0, Math.cos(phase)]) };
}

/** Where an air source rests: x right, y up, z behind (the listener faces −z). */
export function airPosition(i: number): { x: number; y: number; z: number } {
  const s = AIR_STAGE[i];
  const a = (s.az * Math.PI) / 180;
  return { x: STAGE_RADIUS * Math.sin(a), y: s.y, z: -STAGE_RADIUS * Math.cos(a) };
}


/* ------------------------------------------------------------------ orbit: the sound travelling around the head */

/** Below this the sound is not circled: bass stays dead centre (a rotating low end only makes the level pulse). */
export const ORBIT_SPLIT_HZ = 200;
/** One full turn around the head at speed 0.5, in seconds: a classic 8D rate (the speed slider makes it 0.5×–2×). */
export const ORBIT_PERIOD_S = 12;
/** The left and right channels are two virtual speakers this far (degrees) either side of the point that circles. */
export const ORBIT_SPREAD_DEG = 35;
/** Distance of the circling sources: panner roll-off is 0, so this only sets direction, never loudness. */
export const ORBIT_RADIUS = 1.5;

/** Turns per second at a speed slider value. */
export function orbitTurnHz(speed: number): number {
  return speedFactor(speed) / ORBIT_PERIOD_S;
}

/** Equal-power mix of the still signal and the circling one for an orbit amount (0..1): dry² + circling² = 1. */
export function orbitMix(orbit: number): { dry: number; circling: number } {
  const o = Math.min(1, Math.max(0, Number.isFinite(orbit) ? orbit : 0));
  return { dry: Math.cos((o * Math.PI) / 2), circling: Math.sin((o * Math.PI) / 2) };
}

/**
 * Where a virtual speaker is at phase φ (rad, 0 = straight ahead, growing clockwise seen from above): x right, y up,
 * z behind (the listener faces −z). side −1 is the left channel's speaker, +1 the right channel's.
 */
export function orbitPosition(side: -1 | 1, phi: number): { x: number; y: number; z: number } {
  const a = phi + (side * ORBIT_SPREAD_DEG * Math.PI) / 180;
  return { x: ORBIT_RADIUS * Math.sin(a), y: 0, z: -ORBIT_RADIUS * Math.cos(a) };
}

/** Bass shelf and punch gains (dB) for a bass amount (0..1). */
export function bassDb(bass: number): { shelf: number; punch: number; harmonics: number } {
  const b = Math.min(1, Math.max(0, Number.isFinite(bass) ? bass : 0));
  return { shelf: 8 * b, punch: 3 * b, harmonics: 0.35 * b };
}

/** Parallel-compression and exciter levels for a punch amount (0..1). */
export function punchLevels(punch: number): { parallel: number; excite: number } {
  const p = Math.min(1, Math.max(0, Number.isFinite(punch) ? punch : 0));
  return { parallel: 0.6 * p, excite: 0.18 * p };
}

/** Soft-clip curve tanh(k·x)/tanh(k): odd, monotonic, bounded to ±1. Used for harmonic excitement. */
export function shaperCurve(k: number, size = 2048): Float32Array<ArrayBuffer> {
  const out = new Float32Array(size);
  const norm = Math.tanh(k);
  for (let i = 0; i < size; i++) out[i] = Math.tanh((k * (2 * i)) / (size - 1) - k) / norm;
  return out;
}

/** Target level of the side signal relative to the mid (dB). Quieter than this and the instruments get a lift. */
export const AUTO_WIDTH_TARGET_DB = -10;
export const AUTO_WIDTH_MAX_DB = 2;
/**
 * Linear gain for the side bus from the measured side and mid levels (RMS). Narrow, near-mono mixes get up to
 * +2 dB so the instruments still reach the two ears; wide mixes and silence are left alone. (More than that
 * breaks the stereo decode L = mid + side, R = mid − side: the far ear would get the instruments in anti-phase.)
 */
export function autoWidthGain(sideRms: number, midRms: number): number {
  if (!(midRms > 1e-4) || !Number.isFinite(sideRms)) return 1;
  const ratioDb = 20 * Math.log10((Math.max(sideRms, 1e-6)) / midRms);
  const extra = Math.min(AUTO_WIDTH_MAX_DB, Math.max(0, AUTO_WIDTH_TARGET_DB - ratioDb));
  return Math.pow(10, extra / 20);
}

/** Voice polish for a clarity amount (0..1): the gains, in dB, of the vocal chain and the instrument pocket. */
export function clarityDb(clarity: number): { mud: number; presence: number; sparkle: number; pocket: number } {
  const c = Math.min(1, Math.max(0, Number.isFinite(clarity) ? clarity : 0));
  return { mud: -3 * c, presence: 4.5 * c, sparkle: 2.5 * c, pocket: -3 * c };
}

/**
 * Side-bus gain for a separation amount: 1× at 0 (the faithful stereo decode, L = mid + side, R = mid − side) up to
 * 1.25× at 1. Past 1× each ear starts to receive the other side's instruments in anti-phase, which smears the image
 * instead of sharpening it, so the range stops where the image is still precise (the leak into the far ear is
 * about −14 dB at the top, with the automatic width at its most).
 */
export function separationGain(separation: number): number {
  const s = Math.min(1, Math.max(0, Number.isFinite(separation) ? separation : 0));
  return 1 + 0.25 * s;
}

/* ------------------------------------------------------------------ IEM tuning */

export interface TuneBand {
  type: BiquadFilterType;
  hz: number;
  q: number;
  db: number;
}

/** The six filters of the tuning stage: low shelf, lower mids, mids, ear-gain region, treble, air shelf. */
const TUNE_SHAPE = [
  { type: "lowshelf", hz: 100, q: 0.7 },
  { type: "peaking", hz: 300, q: 0.8 },
  { type: "peaking", hz: 1500, q: 0.8 },
  { type: "peaking", hz: 3000, q: 1.0 },
  { type: "peaking", hz: 6000, q: 1.2 },
  { type: "highshelf", hz: 10000, q: 0.7 },
] as const satisfies readonly { type: BiquadFilterType; hz: number; q: number }[];

/** Gain (dB) of each TUNE_SHAPE filter per tuning. Moderate on purpose: the level matcher and the limiter sit behind it. */
const TUNE_DB: Record<EightDTuning, readonly number[]> = {
  reference: [0, 0, 0, 0, 0, 0],
  // A Harman-in-ear-like balance: a firm bass shelf, a little less lower-mid body, the 3 kHz ear-gain lift, a calm treble.
  harman: [4.5, -1.5, 0, 3, -1.5, -1],
  warm: [4, 1, -0.5, -1, -2.5, -3],
  bright: [-1, -1.5, 0.5, 2, 2.5, 2.5],
  vocal: [-1.5, -2, 1.5, 3, 0.5, 0],
  vshape: [5.5, -2.5, -2, 1.5, 2, 2],
};

export function tuningCurve(tuning: EightDTuning): TuneBand[] {
  const db = TUNE_DB[tuning] ?? TUNE_DB.reference;
  return TUNE_SHAPE.map((b, i) => ({ type: b.type, hz: b.hz, q: b.q, db: db[i] }));
}

/** Detail (0..1): the air shelf's gain in dB and the factor on the instruments' harmonic sparkle (1 = unchanged). */
export function detailLevels(detail: number): { air: number; excite: number } {
  const d = Math.min(1, Math.max(0, Number.isFinite(detail) ? detail : 0));
  return { air: 4 * d, excite: 1 + 0.8 * d };
}

/** Treble smoothing (0..1): how much of the band's compressed copy replaces its untouched copy (`dry` = what is left of the untouched one). */
export function tameMix(tame: number): { dry: number; wet: number } {
  const t = Math.min(1, Math.max(0, Number.isFinite(tame) ? tame : 0));
  return { dry: 1 - t, wet: t };
}

/* ------------------------------------------------------------------ level matching */

/** The auto level match never turns 8D down by more than this, or up by more than the second figure (dB). */
export const MATCH_MIN_DB = -15;
export const MATCH_MAX_DB = 3;
/** Smoothing of the measured powers per reading (about 1.5 s at one reading per 150 ms). */
export const MATCH_SMOOTH = 0.1;

/** One step of an exponential average; a non-finite reading leaves the average where it was. */
export function smoothPower(prev: number, next: number, k = MATCH_SMOOTH): number {
  if (!Number.isFinite(next) || next < 0) return prev;
  return prev + k * (next - prev);
}

/** Linear gain that brings the stage's output power to the input's, within the limits above. 1 when either is too quiet to judge. */
export function levelMatchGain(inPower: number, outPower: number): number {
  if (!(inPower > 1e-8) || !(outPower > 1e-10) || !Number.isFinite(inPower) || !Number.isFinite(outPower)) return 1;
  const db = 10 * Math.log10(inPower / outPower);
  return Math.pow(10, Math.min(MATCH_MAX_DB, Math.max(MATCH_MIN_DB, db)) / 20);
}

/**
 * The make-up gain (dB) a Web Audio DynamicsCompressorNode with a HARD knee adds on its own (checked against Chromium:
 * 8.51 dB measured for -26 dB / 2.2:1, 15.00 dB for -30 dB / 6:1). Cancelled behind every compressor here, so a
 * compressor leaves what is under its threshold exactly as it was. (With a soft knee the figure drifts by 1-3 dB, so
 * every compressor in this file uses knee 0.)
 */
export function compMakeupDb(thresholdDb: number, ratio: number): number {
  return -0.6 * (thresholdDb + (0 - thresholdDb) / ratio);
}

/* ------------------------------------------------------------------ presets */

export const EIGHT_D_PRESET_IDS = ["orbit", "reference", "harman", "vocal", "bass", "detail", "stage"] as const;
export type EightDPresetId = (typeof EIGHT_D_PRESET_IDS)[number];

/** Whole-engine voicings, named after the in-ear monitor styles they are modelled on. Every value is a slider position. */
export const EIGHT_D_PRESETS: Record<EightDPresetId, EightDParams> = {
  // The classic 8D feel: the whole song travels around your head, with a roomy stage and the bass kept in the middle.
  orbit: { motion: 0.5, speed: 0.5, space: 0.4, separation: 0.8, clarity: 0.6, bass: 0.7, punch: 0.65, detail: 0.5, tame: 0.55, tuning: "warm", orbit: 1 },
  // Studio-monitor honesty: flat tone, wide but calm stage, nothing added.
  reference: { motion: 0.35, speed: 0.4, space: 0.2, separation: 0.7, clarity: 0.5, bass: 0.35, punch: 0.5, detail: 0.5, tame: 0.5, tuning: "reference", orbit: 0.45 },
  // The consumer-favourite in-ear balance: strong, controlled bass and a lifted but smooth upper mid.
  harman: { motion: 0.4, speed: 0.45, space: 0.25, separation: 0.75, clarity: 0.45, bass: 0.55, punch: 0.6, detail: 0.55, tame: 0.55, tuning: "harman", orbit: 0.5 },
  // Voice-first: lead vocal forward and clean, calm sibilance, instruments tucked to the sides.
  vocal: { motion: 0.3, speed: 0.4, space: 0.2, separation: 0.7, clarity: 0.85, bass: 0.3, punch: 0.55, detail: 0.6, tame: 0.65, tuning: "vocal", orbit: 0.3 },
  // Bass-forward V-shape: deep, tight low end with sparkle on top.
  bass: { motion: 0.55, speed: 0.5, space: 0.3, separation: 0.8, clarity: 0.5, bass: 0.95, punch: 0.85, detail: 0.45, tame: 0.5, tuning: "vshape", orbit: 0.65 },
  // Analytical: maximum separation and micro-detail, little room, bright but controlled.
  detail: { motion: 0.25, speed: 0.35, space: 0.1, separation: 0.9, clarity: 0.7, bass: 0.3, punch: 0.75, detail: 0.9, tame: 0.7, tuning: "bright", orbit: 0.35 },
  // Cinematic stage: a big, warm room with plenty of drift.
  stage: { motion: 0.75, speed: 0.55, space: 0.6, separation: 0.85, clarity: 0.6, bass: 0.5, punch: 0.6, detail: 0.6, tame: 0.55, tuning: "warm", orbit: 0.8 },
};

/** The reverb tail: decaying, slightly dark noise, different in each ear, after a short pre-delay. */
export function reverbImpulse(sampleRate: number, seconds = 1.0, preDelayS = 0.012): Float32Array[] {
  const len = Math.max(1, Math.floor(sampleRate * seconds));
  const pre = Math.floor(sampleRate * preDelayS);
  const out: Float32Array[] = [new Float32Array(len), new Float32Array(len)];
  for (let ch = 0; ch < 2; ch++) {
    // A tiny deterministic generator, so the room sounds the same every launch.
    let seed = 0x9e3779b9 ^ (ch * 0x85ebca6b);
    const rnd = (): number => {
      seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x297a2d39) | 0;
      return ((seed >>> 0) / 0xffffffff) * 2 - 1;
    };
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / (len - pre);
      lp += 0.55 * (rnd() - lp); // one-pole low-pass: a warm, not hissy, tail
      out[ch][i] = lp * Math.pow(1 - t, 3.2);
    }
  }
  return out;
}

/** Order-4 Linkwitz-Riley split: two cascaded Butterworth filters per side; low + high sum flat. */
function lr4(ctx: BaseAudioContext, input: AudioNode, hz: number): { low: AudioNode; high: AudioNode } {
  const mk = (type: BiquadFilterType): BiquadFilterNode => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    f.Q.value = Math.SQRT1_2;
    return f;
  };
  const l1 = mk("lowpass"), l2 = mk("lowpass"), h1 = mk("highpass"), h2 = mk("highpass");
  input.connect(l1);
  l1.connect(l2);
  input.connect(h1);
  h1.connect(h2);
  return { low: l2, high: h2 };
}

function gain(ctx: BaseAudioContext, value: number): GainNode {
  const g = ctx.createGain();
  g.channelCount = 1;
  g.channelCountMode = "explicit";
  g.gain.value = value;
  return g;
}

function gain2(ctx: BaseAudioContext, value: number): GainNode {
  const g = ctx.createGain();
  g.channelCount = 2;
  g.channelCountMode = "explicit";
  g.channelInterpretation = "speakers";
  g.gain.value = value;
  return g;
}

function peaking(ctx: BaseAudioContext, hz: number, q: number, db: number, type: BiquadFilterType = "peaking"): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  f.gain.value = db;
  return f;
}

export interface EightD {
  /** connect the signal into this */
  input: AudioNode;
  /** and take the result from this */
  output: AudioNode;
  setEnabled(on: boolean): void;
  setParams(p: EightDParams): void;
  /** What the automatic level match is doing right now: the gain in dB (0 = the stage is as loud as the input) and the measured powers. */
  levelInfo(): { matchDb: number; inPower: number; outPower: number };
}

function shaper(ctx: BaseAudioContext, k: number): WaveShaperNode {
  const w = ctx.createWaveShaper();
  w.curve = shaperCurve(k);
  w.oversample = "2x";
  return w;
}

/**
 * A compressor with its make-up gain cancelled (hard knee, see compMakeupDb): unity under the threshold, compressing
 * above it. input/output are the pair to wire; the node itself delays the signal by COMP_LATENCY_S.
 */
export function comp(ctx: BaseAudioContext, threshold: number, ratio: number, attack: number, release: number): { input: AudioNode; output: AudioNode } {
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = threshold;
  c.ratio.value = ratio;
  c.knee.value = 0;
  c.attack.value = attack;
  c.release.value = release;
  const cancel = ctx.createGain();
  cancel.gain.value = Math.pow(10, -compMakeupDb(threshold, ratio) / 20);
  c.connect(cancel);
  return { input: c, output: cancel };
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, hz: number, q = Math.SQRT1_2): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  return f;
}

function delay(ctx: BaseAudioContext, seconds: number): DelayNode {
  const d = ctx.createDelay(0.05);
  d.delayTime.value = seconds;
  return d;
}

/**
 * A band tamer for a STEREO band: the band goes through a fast compressor and is blended with its untouched copy by
 * `wet`/`dry` (both delayed to match the compressor's look-ahead). It works on the band while it is still a left/right
 * pair, before mid and side are taken, so both get exactly the same treatment and the image cannot blur; the
 * compressor sees both ears at once and moves them together. It is how a de-esser works: only the sharp band is held
 * back, only while it is sharp (at tame 0 the band is just delayed).
 */
export function tamer(ctx: BaseAudioContext, src: AudioNode, threshold: number, ratio: number, attack: number, release: number): { output: GainNode; dry: GainNode; wet: GainNode } {
  const out = gain2(ctx, 1);
  const dry = gain2(ctx, 1);
  const dryDelay = delay(ctx, COMP_LATENCY_S);
  src.connect(dry);
  dry.connect(dryDelay);
  dryDelay.connect(out);
  const c = comp(ctx, threshold, ratio, attack, release);
  const wet = gain2(ctx, 0);
  src.connect(c.input);
  c.output.connect(wet);
  wet.connect(out);
  return { output: out, dry, wet };
}

/**
 * Loudness-like total power of a stereo signal: weighted the way ears hear it (the low end below ~150 Hz counts for
 * little, the top end a bit more, like the K-weighting of LUFS), so a bass boost does not make the level match pull
 * the whole mix down. A splitter into one analyser per ear, so uncorrelated ears add up instead of cancelling.
 */
function stereoMeter(ctx: BaseAudioContext, src: AudioNode): () => number {
  const hp = filter(ctx, "highpass", 150, 0.6);
  const shelf = peaking(ctx, 2000, 0.7, 4, "highshelf");
  src.connect(hp);
  hp.connect(shelf);
  const sp = ctx.createChannelSplitter(2);
  shelf.connect(sp);
  const taps = [0, 1].map((ch) => {
    const a = ctx.createAnalyser();
    a.fftSize = 2048;
    sp.connect(a, ch);
    return { a, buf: new Float32Array(a.fftSize) };
  });
  return () => {
    let total = 0;
    for (const t of taps) {
      t.a.getFloatTimeDomainData(t.buf);
      let x = 0;
      for (let i = 0; i < t.buf.length; i++) x += t.buf[i] * t.buf[i];
      total += x / t.buf.length;
    }
    return total;
  };
}

/** Cut a (stereo) signal at every edge in `edges` with Linkwitz-Riley splits: edges.length + 1 bands that sum back flat. */
function ladder(ctx: BaseAudioContext, src: AudioNode, edges: readonly number[]): AudioNode[] {
  const out: AudioNode[] = [];
  let rest = src;
  for (const hz of edges) {
    const sp = lr4(ctx, rest, hz);
    out.push(sp.low);
    rest = sp.high;
  }
  out.push(rest);
  return out;
}

/** Every crossover of the stage, low to high: bass | five bands of voice and instruments | air. */
export const CROSSOVERS_HZ = [BASS_HZ, ...SIDE_SPLITS_HZ, AIR_HZ] as const;

/**
 * Builds the stage inside ctx. The returned input/output pair is a drop-in stage: while disabled the signal
 * passes straight through and the stage's nodes are disconnected from the input.
 *
 * The signal is cut into bands FIRST, as a stereo pair, and only then turned into mid and side inside each band. That
 * order is what keeps the image exact: left and right pass through identical filters, so in every band
 * mid + side is still the left ear and mid − side is still the right ear, whatever the crossover phase does.
 */
export function createEightD(ctx: AudioContext): EightD {
  const input = ctx.createGain();
  input.channelCount = 2;
  input.channelCountMode = "explicit";
  input.channelInterpretation = "speakers";
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain(); // the effect's on/off fade
  wet.gain.value = 0;
  input.connect(dry);
  dry.connect(output);
  wet.connect(output);

  /* ---- the sum of every path, then the tuning, then the level match, then the on/off fade ---- */
  const bus = gain2(ctx, 1);
  const tuneFilters = TUNE_SHAPE.map((b) => peaking(ctx, b.hz, b.q, 0, b.type));
  bus.connect(tuneFilters[0]);
  for (let i = 1; i < tuneFilters.length; i++) tuneFilters[i - 1].connect(tuneFilters[i]);
  const detailShelf = peaking(ctx, 10500, 0.7, 0, "highshelf");
  tuneFilters[tuneFilters.length - 1].connect(detailShelf);
  const match = ctx.createGain();
  match.gain.value = 0.7; // until the first reading: a little under unity
  match.connect(wet);

  /* ---- around you: the finished sound split at ORBIT_SPLIT_HZ (Linkwitz-Riley, so the halves sum back flat). The low
          part stays dead centre. The rest is crossfaded (equal power) with a copy in which the left and right channels
          are two virtual speakers, 35° either side, that circle the head on HRTF panners. The motion is driven by
          oscillators wired into the panners' position parameters, so it runs on the audio thread, never the UI. ---- */
  const turn = lr4(ctx, detailShelf, ORBIT_SPLIT_HZ);
  const turned = gain2(ctx, 1); // everything that goes on to the level match
  turn.low.connect(turned);
  const turnDry = gain2(ctx, 1);
  turn.high.connect(turnDry);
  turnDry.connect(turned);
  const turnSplit = ctx.createChannelSplitter(2);
  turn.high.connect(turnSplit);
  const turnCircling = gain2(ctx, 0);
  const orbitOscs: OscillatorNode[] = [];
  const orbitOsc = (phase: number): OscillatorNode => {
    const o = ctx.createOscillator();
    const w = sinWithPhase(phase);
    o.setPeriodicWave(ctx.createPeriodicWave(w.real, w.imag, { disableNormalization: true }));
    o.frequency.value = orbitTurnHz(DEFAULT_EIGHT_D.speed);
    orbitOscs.push(o);
    return o;
  };
  ([-1, 1] as const).forEach((side, ch) => {
    const p = ctx.createPanner();
    p.panningModel = "HRTF";
    p.distanceModel = "inverse";
    p.refDistance = 1;
    p.rolloffFactor = 0;
    const at = orbitPosition(side, 0);
    p.positionX.value = 0;
    p.positionY.value = at.y;
    p.positionZ.value = 0;
    const delta = (side * ORBIT_SPREAD_DEG * Math.PI) / 180;
    // x = R·sin(φ+δ); z = −R·cos(φ+δ) = −R·sin(φ+δ+π/2). The parameters start at 0 and the oscillators add the motion.
    const driveX = gain(ctx, ORBIT_RADIUS);
    const driveZ = gain(ctx, -ORBIT_RADIUS);
    orbitOsc(delta).connect(driveX);
    orbitOsc(delta + Math.PI / 2).connect(driveZ);
    driveX.connect(p.positionX);
    driveZ.connect(p.positionZ);
    const mono = gain(ctx, 1);
    turnSplit.connect(mono, ch);
    mono.connect(p);
    p.connect(turnCircling);
  });
  turnCircling.connect(turned);
  turned.connect(match);

  const stage = gain2(ctx, 1); // the stage's own entry: connected to the input only while the effect is on

  /* ---- punch, on the whole stereo signal: the compressor sees both ears at once and moves them together, so the
          balance between the ears never changes. direct + slow-attack parallel compression (body between hits, hits
          stay sharp) + exciter, all in time. ---- */
  const punched = gain2(ctx, 1);
  const punchDirect = delay(ctx, COMP_LATENCY_S); // waits for the compressor's look-ahead
  stage.connect(punchDirect);
  punchDirect.connect(punched);
  const punchComp = comp(ctx, -24, 4, 0.024, 0.2);
  const punchParallel = gain2(ctx, 0);
  stage.connect(punchComp.input);
  punchComp.output.connect(punchParallel);
  punchParallel.connect(punched);
  const exHp = filter(ctx, "highpass", 2800);
  const exShaper = shaper(ctx, 3);
  const punchExcite = gain2(ctx, 0);
  const exDelay = delay(ctx, COMP_LATENCY_S);
  stage.connect(exHp);
  exHp.connect(exShaper);
  exShaper.connect(punchExcite);
  punchExcite.connect(exDelay);
  exDelay.connect(punched);

  /* ---- level taps: how wide is this song, and how loud is the stage against what went in? (read a few times a
          second, only while the effect is on) ---- */
  const wholeSplit = ctx.createChannelSplitter(2);
  punched.connect(wholeSplit);
  const midAll = gain(ctx, 0.5);
  wholeSplit.connect(midAll, 0);
  wholeSplit.connect(midAll, 1);
  const sideAll = gain(ctx, 1);
  const sideAllL = gain(ctx, 0.5);
  const sideAllR = gain(ctx, -0.5);
  wholeSplit.connect(sideAllL, 0);
  wholeSplit.connect(sideAllR, 1);
  sideAllL.connect(sideAll);
  sideAllR.connect(sideAll);
  const midTap = ctx.createAnalyser();
  const sideTap = ctx.createAnalyser();
  midTap.fftSize = sideTap.fftSize = 2048;
  midAll.connect(midTap);
  sideAll.connect(sideTap);
  const readIn = stereoMeter(ctx, stage);
  const readOut = stereoMeter(ctx, turned); // after the circling, so the level match covers it too

  /* ---- seven bands of the stereo signal, then mid and side inside each ---- */
  const rawBands = ladder(ctx, punched, CROSSOVERS_HZ);
  // The top two bands (4-6.5 kHz, where sibilance lives, and the air above) get treble smoothing; every other band is
  // simply delayed by the same look-ahead, so all seven stay in time.
  const voiceTame = tamer(ctx, rawBands[SIDE_BANDS], -34, 4, 0.002, 0.08);
  const airTame = tamer(ctx, rawBands[SIDE_BANDS + 1], -30, 3, 0.003, 0.1);
  const bands: AudioNode[] = rawBands.map((bn, i) => {
    if (i === SIDE_BANDS) return voiceTame.output;
    if (i === SIDE_BANDS + 1) return airTame.output;
    const d = delay(ctx, COMP_LATENCY_S);
    bn.connect(d);
    return d;
  });
  const midOf = (band: AudioNode): GainNode => {
    const sp = ctx.createChannelSplitter(2);
    const m = gain(ctx, 0.5); // (L + R) / 2
    band.connect(sp);
    sp.connect(m, 0);
    sp.connect(m, 1);
    return m;
  };
  const sideOf = (band: AudioNode): GainNode => {
    const sp = ctx.createChannelSplitter(2);
    const sd = gain(ctx, 1); // (L − R) / 2
    const a = gain(ctx, 0.5);
    const b = gain(ctx, -0.5);
    band.connect(sp);
    sp.connect(a, 0);
    sp.connect(b, 1);
    a.connect(sd);
    b.connect(sd);
    return sd;
  };

  /* ---- centre / bass (band 0): boosted, with harmonics so it is felt and heard on small drivers; mono, dead ahead ---- */
  const bassIn = midOf(bands[0]);
  const bassShelf = peaking(ctx, 140, 0.7, 0, "lowshelf");
  const bassPunch = peaking(ctx, 65, 1.0, 0);
  bassIn.connect(bassShelf);
  bassShelf.connect(bassPunch);
  const bassDelay = delay(ctx, STAGE_LATENCY_S); // the voice passes its leveller; the bass waits for it
  const centreOut = gain2(ctx, 1);
  bassPunch.connect(bassDelay);
  bassDelay.connect(centreOut);
  const harmHp = filter(ctx, "highpass", 45);
  const harmShaper = shaper(ctx, 4);
  const harmLp = filter(ctx, "lowpass", 700);
  const harmGain = gain(ctx, 0);
  bassIn.connect(harmHp);
  harmHp.connect(harmShaper);
  harmShaper.connect(harmLp);
  harmLp.connect(harmGain);
  harmGain.connect(bassDelay);

  /* ---- centre / vocal (bands 1-5): mud cut, presence, sparkle, a light leveller ---- */
  const vocalIn = gain(ctx, 1);
  for (let b = 1; b <= SIDE_BANDS; b++) midOf(bands[b]).connect(vocalIn);
  const mud = peaking(ctx, 260, 1.0, 0);
  const presence = peaking(ctx, 3200, 0.9, 0);
  const sparkle = peaking(ctx, 5200, 1.2, 0);
  vocalIn.connect(mud);
  mud.connect(presence);
  presence.connect(sparkle);
  const vocalComp = comp(ctx, -20, 1.5, 0.012, 0.16); // a light leveller: it only moves the centre, so it must not move it far from the sides
  const vocalMakeup = gain(ctx, 1);
  sparkle.connect(vocalComp.input);
  vocalComp.output.connect(vocalMakeup);
  vocalMakeup.connect(centreOut);
  const airHp = filter(ctx, "highpass", 4500);
  const airShaper = shaper(ctx, 2.5);
  const airExc = gain(ctx, 0);
  vocalMakeup.connect(airHp);
  airHp.connect(airShaper);
  airShaper.connect(airExc);
  airExc.connect(centreOut);
  centreOut.connect(bus);

  /* ---- air (band 6): the centre's top end steadily behind the head, its spikes tamed, in time with the voice ---- */
  const airIn = midOf(bands[SIDE_BANDS + 1]);
  const airAlign = delay(ctx, COMP_LATENCY_S); // waits for the voice's leveller
  const airGain = gain(ctx, 0.7);
  airIn.connect(airAlign);
  airAlign.connect(airGain);
  AIR_STAGE.forEach((_, i) => {
    const p = ctx.createPanner();
    p.panningModel = "HRTF";
    p.distanceModel = "inverse";
    p.refDistance = 1;
    p.rolloffFactor = 0; // distance never changes loudness
    const pos = airPosition(i);
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    airGain.connect(p);
    p.connect(bus);
  });

  /* ---- instruments: the side of every band. Each of the five groups goes hard to its own ear: +side to the left,
          −side to the right (that is what makes it the decode of the original left and right). The pocket dips the
          band where the voice lives; auto width and separation set the level of all of them together. ---- */
  const reverbSend = gain(ctx, 1);
  const oscs = BAND_PHASES.map((ph) => {
    const o = ctx.createOscillator();
    const w = sinWithPhase(ph);
    o.setPeriodicWave(ctx.createPeriodicWave(w.real, w.imag, { disableNormalization: true }));
    o.frequency.value = orbitHz(DEFAULT_EIGHT_D.speed);
    return o;
  });
  interface Voice {
    side: "left" | "right";
    pan: StereoPannerNode;
    panDrive: GainNode;
    cue: BiquadFilterNode;
    cueDrive: GainNode;
  }
  const voices: Voice[] = [];
  const widthGains: GainNode[] = [];
  const pockets: BiquadFilterNode[] = [];
  const ROOM_SEND_PER_BAND = 1.2 / SIDE_BANDS; // the same total room level however many bands there are
  const groupToEar = (src: AudioNode, group: number, which: "left" | "right"): void => {
    const cue = filter(ctx, "lowpass", CUE_BASE_HZ);
    const mono = gain(ctx, 1);
    const pan = ctx.createStereoPanner();
    pan.pan.value = which === "left" ? -1 : 1;
    src.connect(cue);
    cue.connect(mono);
    mono.connect(pan);
    pan.connect(bus);
    const panDrive = gain(ctx, 0);
    const cueDrive = gain(ctx, 0);
    oscs[group].connect(panDrive);
    panDrive.connect(pan.pan);
    oscs[group].connect(cueDrive);
    cueDrive.connect(cue.frequency);
    voices.push({ side: which, pan, panDrive, cue, cueDrive });
    const send = gain(ctx, ROOM_SEND_PER_BAND);
    src.connect(send);
    send.connect(reverbSend);
  };
  for (let g = 0; g < SIDE_BANDS; g++) {
    // group 0..3 = bands 1..4; the last group takes everything from 4 kHz up (bands 5 and 6)
    let sg: AudioNode = sideOf(bands[g + 1]);
    if (g === SIDE_BANDS - 1) {
      const top = gain(ctx, 1);
      sg.connect(top);
      sideOf(bands[SIDE_BANDS + 1]).connect(top);
      sg = top;
    }
    if (g === 2 || g === 3) {
      // 700 Hz - 4 kHz: where the voice lives
      const pk = peaking(ctx, 2200, 0.8, 0);
      sg.connect(pk);
      pockets.push(pk);
      sg = pk;
    }
    const k = gain(ctx, 1);
    sg.connect(k);
    widthGains.push(k);
    const aligned = delay(ctx, STAGE_LATENCY_S); // in time with the voice, which passes its leveller
    k.connect(aligned);
    const inv = gain(ctx, -1);
    aligned.connect(inv);
    groupToEar(aligned, g, "left");
    groupToEar(inv, g, "right");
  }

  /* ---- room: high-passed so it never clouds the voice ---- */
  const conv = ctx.createConvolver();
  const ir = reverbImpulse(ctx.sampleRate);
  const buf = ctx.createBuffer(2, ir[0].length, ctx.sampleRate);
  buf.getChannelData(0).set(ir[0]);
  buf.getChannelData(1).set(ir[1]);
  conv.buffer = buf;
  const centreSend = gain(ctx, 0.05);
  vocalIn.connect(centreSend);
  centreSend.connect(reverbSend);
  reverbSend.connect(conv);
  const roomHp = filter(ctx, "highpass", 250);
  const roomLp = filter(ctx, "lowpass", 9000);
  const space = gain2(ctx, DEFAULT_EIGHT_D.space * 0.6);
  conv.connect(roomHp);
  roomHp.connect(roomLp);
  roomLp.connect(space);
  space.connect(bus);

  let started = false;
  let on = false;
  let token = 0;
  let meter = 0;
  let inPow = 0;
  let outPow = 0;
  let width = 1; // automatic width, linear
  let params: EightDParams = { ...DEFAULT_EIGHT_D };

  const FADE = 0.06; // time constant: ~0.2 s to settle, no click
  const SLOW = 0.4; // sway changes glide, never jump

  const setWidth = (tc: number): void => {
    const g = separationGain(params.separation) * width;
    for (const k of widthGains) k.gain.setTargetAtTime(g, ctx.currentTime, tc);
  };

  const apply = (): void => {
    const t = ctx.currentTime;
    const hz = orbitHz(params.speed);
    for (const o of oscs) o.frequency.setTargetAtTime(hz, t, 0.6);
    const turnHz = orbitTurnHz(params.speed);
    for (const o of orbitOscs) o.frequency.setTargetAtTime(turnHz, t, 0.6);
    const om = orbitMix(params.orbit);
    turnDry.gain.setTargetAtTime(om.dry, t, 0.15);
    turnCircling.gain.setTargetAtTime(om.circling, t, 0.15);
    const { mid: m, amp } = panPlan(params.motion, params.separation);
    const motion = Math.min(1, Math.max(0, params.motion));
    for (const v of voices) {
      const left = v.side === "left";
      v.pan.pan.setTargetAtTime(left ? -m : m, t, SLOW);
      v.panDrive.gain.setTargetAtTime(left ? amp : -amp, t, SLOW);
      v.cue.frequency.setTargetAtTime(CUE_BASE_HZ - (CUE_DEPTH_HZ * motion) / 2, t, SLOW);
      v.cueDrive.gain.setTargetAtTime(((left ? -1 : 1) * CUE_DEPTH_HZ * motion) / 2, t, SLOW);
    }
    space.gain.setTargetAtTime(Math.min(1, Math.max(0, params.space)) * 0.6, t, 0.08);
    setWidth(0.08);
    const c = clarityDb(params.clarity);
    mud.gain.setTargetAtTime(c.mud, t, 0.08);
    presence.gain.setTargetAtTime(c.presence, t, 0.08);
    sparkle.gain.setTargetAtTime(c.sparkle, t, 0.08);
    for (const pk of pockets) pk.gain.setTargetAtTime(c.pocket, t, 0.08);
    airExc.gain.setTargetAtTime(0.12 * Math.min(1, Math.max(0, params.clarity)), t, 0.08);
    const b = bassDb(params.bass);
    bassShelf.gain.setTargetAtTime(b.shelf, t, 0.15);
    bassPunch.gain.setTargetAtTime(b.punch, t, 0.15);
    harmGain.gain.setTargetAtTime(b.harmonics, t, 0.15);
    const pl = punchLevels(params.punch);
    const dl = detailLevels(params.detail);
    punchParallel.gain.setTargetAtTime(pl.parallel, t, 0.1);
    punchExcite.gain.setTargetAtTime(pl.excite * dl.excite, t, 0.1);
    detailShelf.gain.setTargetAtTime(dl.air, t, 0.15);
    tuningCurve(isTuning(params.tuning) ? params.tuning : "reference").forEach((band, i) => tuneFilters[i].gain.setTargetAtTime(band.db, t, 0.15));
    const tm = tameMix(params.tame);
    for (const tm2 of [voiceTame, airTame]) {
      tm2.dry.gain.setTargetAtTime(tm.dry, t, 0.08);
      tm2.wet.gain.setTargetAtTime(tm.wet, t, 0.08);
    }
  };

  const bufS = new Float32Array(sideTap.fftSize);
  const bufM = new Float32Array(midTap.fftSize);
  const rms = (a: Float32Array): number => {
    let x = 0;
    for (let i = 0; i < a.length; i++) x += a[i] * a[i];
    return Math.sqrt(x / a.length);
  };
  /**
   * Two slow readings a few times a second, only while the effect is on: narrow mixes get a lift on the instrument bus
   * (the gain glides, so it is never heard as a jump), and the whole stage is levelled to what went in, so switching 8D
   * on never makes the song louder (or quieter) than it was.
   */
  const measure = (): void => {
    sideTap.getFloatTimeDomainData(bufS);
    midTap.getFloatTimeDomainData(bufM);
    width = autoWidthGain(rms(bufS), rms(bufM));
    setWidth(0.5);
    inPow = smoothPower(inPow, readIn());
    outPow = smoothPower(outPow, readOut());
    match.gain.setTargetAtTime(levelMatchGain(inPow, outPow), ctx.currentTime, 0.4); // outPow is read before this gain, so there is no feedback
  };

  return {
    input,
    output,
    levelInfo() {
      return { matchDb: 20 * Math.log10(Math.max(1e-6, match.gain.value)), inPower: inPow, outPower: outPow };
    },
    setParams(p) {
      params = { ...DEFAULT_EIGHT_D, ...p };
      if (started) apply();
    },
    setEnabled(next) {
      if (next === on) return;
      on = next;
      const mine = ++token;
      const t = ctx.currentTime;
      if (on) {
        if (!started) {
          started = true;
          for (const o of oscs) o.start(t);
          for (const o of orbitOscs) o.start(t);
        }
        apply();
        input.connect(stage);
        inPow = 0;
        outPow = 0;
        match.gain.setValueAtTime(0.7, t);
        dry.gain.setTargetAtTime(0, t, FADE);
        wet.gain.setTargetAtTime(1, t, FADE);
        if (!meter) meter = window.setInterval(measure, 150);
      } else {
        dry.gain.setTargetAtTime(1, t, FADE);
        wet.gain.setTargetAtTime(0, t, FADE);
        // Once the fade has finished the stage is cut off from the input, so it stops costing anything.
        window.setTimeout(() => {
          if (token !== mine || on) return;
          if (meter) window.clearInterval(meter);
          meter = 0;
          try {
            input.disconnect(stage);
          } catch {
            /* already disconnected */
          }
        }, 500);
      }
    },
  };
}
