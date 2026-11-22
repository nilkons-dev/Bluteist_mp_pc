/**
 * 8D audio (src/lib/eightD.ts): the stage layout and the maths the audio thread's oscillators reproduce.
 * The node graph itself needs a browser's Web Audio; what is checked here is everything that decides where
 * a sound lands and how fast it moves.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL("../src/lib/eightD.ts", import.meta.url))],
  bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent",
});
const module = { exports: {} };
new Function("require", "module", "exports", outputFiles[0].text)(require, module, module.exports);
const { AIR_STAGE, SWAY_PERIOD_S, STAGE_RADIUS, BAND_PHASES, CUE_BASE_HZ, speedFactor, orbitHz, panPlan, groupPan, cueHz, sinWithPhase, airPosition, bassDb, punchLevels, shaperCurve, autoWidthGain, COMP_LATENCY_S, clarityDb, separationGain, reverbImpulse, DEFAULT_EIGHT_D, TUNINGS, tuningCurve, isTuning, detailLevels, tameMix, levelMatchGain, smoothPower, compMakeupDb, EIGHT_D_PRESETS, EIGHT_D_PRESET_IDS, SIDE_BANDS, SIDE_SPLITS_HZ, CROSSOVERS_HZ, MATCH_MIN_DB, MATCH_MAX_DB, STAGE_LATENCY_S } = module.exports;

const sweep = (f) => Array.from({ length: 720 }, (_, i) => f((i / 720) * 2 * Math.PI));

test("each group stays hard on its own side at every motion and separation: left < 0, right > 0, never reaches the centre", () => {
  for (const m of [0, 0.25, 0.5, 0.75, 1]) {
    for (const sep of [0, 0.5, 1]) {
      for (const v of sweep((p) => groupPan("left", m, sep, p))) assert.ok(v < -0.35, `left ${m} ${sep} ${v}`);
      for (const v of sweep((p) => groupPan("right", m, sep, p))) assert.ok(v > 0.35, `right ${m} ${sep} ${v}`);
    }
  }
});

test("motion 0 holds both groups perfectly still at the edge; separation sets how far out the edge is", () => {
  for (const p of [0, 1.7, 4]) {
    assert.equal(groupPan("left", 0, 1, p), -1);
    assert.equal(groupPan("right", 0, 1, p), 1);
  }
  assert.equal(panPlan(0, 0).edge, 0.75);
  assert.equal(panPlan(0, 1).edge, 1);
  assert.ok(panPlan(0, 0.2).edge < panPlan(0, 0.9).edge);
});

test("the sway never exceeds the edge and its range grows smoothly with motion", () => {
  let prev = -1;
  for (const m of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    const v = sweep((p) => Math.abs(groupPan("left", m, 0.8, p)));
    assert.ok(Math.max(...v) <= panPlan(m, 0.8).edge + 1e-12);
    const range = Math.max(...v) - Math.min(...v);
    assert.ok(range >= prev - 1e-12);
    prev = range;
  }
});

test("smooth: the pan never moves more than a few percent per second, even at top speed and full motion", () => {
  const hz = orbitHz(1); // fastest the slider allows
  const dt = 0.01;
  let worst = 0;
  for (let t = 0; t < 60; t += dt) {
    const a = groupPan("left", 1, 1, 2 * Math.PI * hz * t), b = groupPan("left", 1, 1, 2 * Math.PI * hz * (t + dt));
    worst = Math.max(worst, Math.abs(b - a) / dt);
  }
  assert.ok(worst < 0.2, `pan speed ${worst}/s`);
});

test("the two groups mirror each other at every instant, so the stereo image stays balanced", () => {
  for (const p of [0.3, 1.9, 3.3, 5.5]) {
    assert.ok(Math.abs(groupPan("left", 0.8, 0.8, p) + groupPan("right", 0.8, 0.8, p)) < 1e-12);
  }
});

test("the cue filter is brightest at the outer edge and softer inward, within sane limits", () => {
  for (const side of ["left", "right"]) {
    for (const m of [0, 0.5, 1]) {
      for (const p of sweep((x) => x)) {
        const f = cueHz(side, m, p);
        assert.ok(f <= CUE_BASE_HZ && f >= 8000);
      }
    }
  }
  assert.equal(cueHz("left", 0, 1), CUE_BASE_HZ);
  // more outward pan => higher cutoff
  const p1 = 1.1, p2 = 4.2;
  const out = (p) => Math.abs(groupPan("left", 1, 1, p));
  assert.equal(out(p1) > out(p2), cueHz("left", 1, p1) > cueHz("left", 1, p2));
});

test("sinWithPhase gives sin(x + phase)", () => {
  for (const ph of BAND_PHASES) {
    const w = sinWithPhase(ph);
    for (const x of [0, 0.7, 2, 4.4]) assert.ok(Math.abs(w.real[1] * Math.cos(x) + w.imag[1] * Math.sin(x) - Math.sin(x + ph)) < 1e-6);
  }
});

test("the air pair floats behind the listener (z > 0, the listener faces -z) on the stage circle", () => {
  AIR_STAGE.forEach((_, i) => {
    const p = airPosition(i);
    assert.ok(p.z > 0);
    assert.ok(Math.abs(Math.hypot(p.x, p.z) - STAGE_RADIUS) < 1e-9);
  });
  assert.ok(airPosition(0).x < 0 && airPosition(1).x > 0);
});

test("speed: the middle is normal, the ends halve and double the rate, out-of-range input is clamped; the sway is slow", () => {
  assert.equal(speedFactor(0.5), 1);
  assert.equal(speedFactor(0), 0.5);
  assert.equal(speedFactor(1), 2);
  assert.equal(speedFactor(-4), 0.5);
  assert.equal(speedFactor(9), 2);
  assert.equal(speedFactor(NaN), 1);
  assert.ok(Math.abs(orbitHz(0.5) - 1 / SWAY_PERIOD_S) < 1e-12);
  assert.ok(1 / orbitHz(1) >= 10, "even the fastest sway takes 10 s or more");
});

test("bass boost: none at 0, grows with the amount, clamped", () => {
  assert.deepEqual(bassDb(0), { shelf: 0, punch: 0, harmonics: 0 });
  assert.ok(bassDb(1).shelf > bassDb(0.5).shelf && bassDb(0.5).shelf > 0);
  assert.ok(bassDb(0.7).shelf >= 5, "default is clearly audible");
  assert.deepEqual(bassDb(9), bassDb(1));
  assert.deepEqual(bassDb(NaN), bassDb(0));
});

test("punch: off at 0, more parallel body and excitement as it grows, clamped", () => {
  assert.deepEqual(punchLevels(0), { parallel: 0, excite: 0 });
  assert.ok(punchLevels(1).parallel > punchLevels(0.5).parallel && punchLevels(0.5).excite > 0);
  assert.deepEqual(punchLevels(7), punchLevels(1));
  assert.deepEqual(punchLevels(NaN), punchLevels(0));
});

test("shaper curve: odd, monotonic, bounded to +-1, ends exactly at +-1", () => {
  const c = shaperCurve(3);
  assert.ok(Math.abs(c[0] + 1) < 1e-6 && Math.abs(c[c.length - 1] - 1) < 1e-6);
  for (let i = 1; i < c.length; i++) assert.ok(c[i] >= c[i - 1]);
  for (let i = 0; i < c.length; i++) assert.ok(Math.abs(c[i] + c[c.length - 1 - i]) < 1e-6);
});

test("auto width: leaves wide mixes and silence alone, lifts narrow ones, capped at +2 dB", () => {
  assert.equal(autoWidthGain(0.5, 0.5), 1);        // side as loud as mid
  assert.equal(autoWidthGain(0, 0), 1);            // silence
  assert.equal(autoWidthGain(0.1, 0.00001), 1);    // mid too quiet to judge
  assert.equal(autoWidthGain(NaN, 0.3), 1);
  const g = autoWidthGain(0.3 * Math.pow(10, -11 / 20), 0.3); // side 11 dB under mid: 1 dB lift
  assert.ok(Math.abs(20 * Math.log10(g) - 1) < 1e-6);
  assert.ok(Math.abs(20 * Math.log10(autoWidthGain(1e-9, 0.3)) - 2) < 1e-6);
});

test("compressor look-ahead compensation is about 6 ms", () => {
  assert.ok(COMP_LATENCY_S > 0.004 && COMP_LATENCY_S < 0.008);
});

test("clarity: 0 is flat, 1 cuts mud, lifts presence and dips the instrument pocket; separation widens the sides", () => {
  const z = clarityDb(0), c = clarityDb(1);
  assert.ok(z.mud === 0 && z.presence === 0 && z.sparkle === 0 && z.pocket === 0);
  assert.ok(c.mud < 0 && c.presence > 0 && c.sparkle > 0 && c.pocket < 0);
  assert.equal(separationGain(0), 1);
  assert.ok(separationGain(1) > separationGain(0.5) && separationGain(0.5) > 1);
  assert.equal(separationGain(NaN), 1);
});

test("the reverb tail is stereo, silent through the pre-delay, decays, and is the same every time", () => {
  const sr = 48000;
  const [l, r] = reverbImpulse(sr);
  assert.equal(l.length, r.length);
  assert.ok(l.slice(0, Math.floor(sr * 0.012)).every((v) => v === 0));
  const energy = (a, from, to) => a.slice(from, to).reduce((x, v) => x + v * v, 0);
  assert.ok(energy(l, 0, l.length / 4) > energy(l, (l.length * 3) / 4, l.length) * 20, "decays");
  assert.notDeepEqual(Array.from(l.slice(2000, 2010)), Array.from(r.slice(2000, 2010)), "ears differ");
  assert.deepEqual(Array.from(reverbImpulse(sr)[0].slice(3000, 3010)), Array.from(l.slice(3000, 3010)));
  assert.ok(l.every(Number.isFinite) && Math.max(...l.map(Math.abs)) <= 1);
});

test("defaults are inside the 0..1 range the sliders use, and the tuning is a known one", () => {
  for (const [k, v] of Object.entries(DEFAULT_EIGHT_D)) if (k !== "tuning") assert.ok(v >= 0 && v <= 1, k);
  assert.ok(isTuning(DEFAULT_EIGHT_D.tuning));
});

test("separation stays in the range where the stereo image is still precise (never past 1.25x)", () => {
  assert.equal(separationGain(1), 1.25);
  assert.ok(separationGain(1) * Math.pow(10, 2 / 20) < 1.6, "with the automatic width at its most the far-ear leak stays near -14 dB");
});

test("five bands per ear, seven bands in all, in increasing order", () => {
  assert.equal(SIDE_BANDS, 5);
  assert.equal(BAND_PHASES.length, SIDE_BANDS);
  assert.equal(SIDE_SPLITS_HZ.length, SIDE_BANDS - 1);
  assert.equal(CROSSOVERS_HZ.length, SIDE_BANDS + 1);
  for (let i = 1; i < CROSSOVERS_HZ.length; i++) assert.ok(CROSSOVERS_HZ[i] > CROSSOVERS_HZ[i - 1]);
});

test("tuning curves: reference is flat, every tuning has six bands, boosts stay moderate, unknown ids fall back to flat", () => {
  assert.ok(tuningCurve("reference").every((b) => b.db === 0));
  for (const t of TUNINGS) {
    const c = tuningCurve(t);
    assert.equal(c.length, 6);
    for (const b of c) assert.ok(b.db >= -4 && b.db <= 7 && b.hz > 0 && b.q > 0, `${t} ${b.hz}`);
  }
  assert.ok(tuningCurve("harman")[0].db > 3, "harman has a firm bass shelf");
  assert.ok(tuningCurve("harman")[3].db > 2, "harman has the ear-gain lift");
  assert.ok(tuningCurve("not-a-tuning").every((b) => b.db === 0));
  assert.ok(isTuning("warm") && !isTuning("nope") && !isTuning(3));
});

test("detail and treble smoothing: off at 0, grow with the amount, clamped", () => {
  assert.deepEqual(detailLevels(0), { air: 0, excite: 1 });
  assert.ok(detailLevels(1).air > detailLevels(0.5).air && detailLevels(0.5).air > 0);
  assert.deepEqual(detailLevels(9), detailLevels(1));
  assert.deepEqual(detailLevels(NaN), detailLevels(0));
  assert.deepEqual(tameMix(0), { dry: 1, wet: 0 });
  assert.deepEqual(tameMix(1), { dry: 0, wet: 1 });
  assert.ok(Math.abs(tameMix(0.3).dry + tameMix(0.3).wet - 1) < 1e-12);
  assert.deepEqual(tameMix(NaN), tameMix(0));
});

test("compressor make-up: the hard-knee formula matches what Chromium was measured to add", () => {
  assert.ok(Math.abs(compMakeupDb(-26, 2.2) - 8.51) < 0.01);
  assert.ok(Math.abs(compMakeupDb(-30, 6) - 15) < 0.01);
  assert.equal(compMakeupDb(-0.5, 20) > 0, true);
});

test("level match: unity when either side is too quiet to judge, equal levels give 1, limited both ways", () => {
  assert.equal(levelMatchGain(0, 1), 1);
  assert.equal(levelMatchGain(1, 0), 1);
  assert.equal(levelMatchGain(NaN, 1), 1);
  assert.ok(Math.abs(levelMatchGain(0.1, 0.1) - 1) < 1e-12);
  assert.ok(Math.abs(20 * Math.log10(levelMatchGain(0.1, 0.4)) + 6.02) < 0.01, "output 6 dB too loud -> -6 dB");
  assert.ok(Math.abs(20 * Math.log10(levelMatchGain(0.1, 1e6)) - MATCH_MIN_DB) < 1e-9);
  assert.ok(Math.abs(20 * Math.log10(levelMatchGain(1, 1e-6)) - MATCH_MAX_DB) < 1e-9);
  assert.equal(smoothPower(1, NaN), 1);
  assert.ok(smoothPower(0, 1, 0.1) === 0.1);
});

test("presets: every id has a full, in-range parameter set with a known tuning", () => {
  assert.deepEqual([...EIGHT_D_PRESET_IDS].sort(), Object.keys(EIGHT_D_PRESETS).sort());
  for (const id of EIGHT_D_PRESET_IDS) {
    const p = EIGHT_D_PRESETS[id];
    assert.deepEqual(Object.keys(p).sort(), Object.keys(DEFAULT_EIGHT_D).sort(), id);
    for (const [k, v] of Object.entries(p)) if (k !== "tuning") assert.ok(v >= 0 && v <= 1, `${id} ${k}`);
    assert.ok(isTuning(p.tuning), id);
  }
});

test("voice path latency is one compressor stage after the band split", () => {
  assert.equal(STAGE_LATENCY_S, COMP_LATENCY_S);
});
