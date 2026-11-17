// Phase 3: player extras, library rows, turntable + live spectrum, the name sweep.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

async function load(entry) {
  const dir = mkdtempSync(join(tmpdir(), "p3-"));
  const out = join(dir, "m.mjs");
  await build({ entryPoints: [new URL(`../${entry}`, import.meta.url).pathname], bundle: true, format: "esm", outfile: out, loader: { ".png": "dataurl", ".webp": "dataurl" }, logLevel: "silent" });
  return import(out);
}

test("the record changes only when a different song begins, never repeats back to back, and cycles every disc", async () => {
  const d = await load("src/components/discs.ts");
  assert.equal(d.DISCS.length, 10);
  assert.equal(d.songBegan("a"), false, "the first song keeps the record on the deck");
  assert.equal(d.songBegan("a"), false, "the same song (pause, resume, seek, re-render) never swaps");
  assert.equal(d.songBegan("b"), true, "a new song swaps");
  assert.equal(d.songBegan("b"), false);
  let prev = d.currentDisc();
  const seen = new Set([prev]);
  for (let i = 0; i < 30; i++) {
    const n = d.pickDisc();
    assert.notEqual(n, prev, "no immediate repeat");
    d.setCurrentDisc(n);
    prev = n;
    seen.add(n);
  }
  assert.equal(seen.size, 10, "all ten records get their turn");
});

test("the spectrum analyser is a silent side branch of the existing graph", () => {
  const a = read("src/lib/audio.ts");
  assert.match(a, /export function getSpectrumAnalyser/);
  assert.match(a, /makeup\.connect\(spectrumAnalyser\)/);
  assert.doesNotMatch(a, /spectrumAnalyser\.connect\(/, "the analyser feeds nothing");
  assert.match(a, /if \(!eqEnabled && !spectrumWanted\) return;/);
});

test("the turntable reads real audio and is still when nothing plays", () => {
  const t = read("src/components/Turntable.tsx");
  assert.match(t, /getByteFrequencyData/);
  assert.match(t, /playingRef\.current && live \? Math\.max\(BASE, live\[i\]\) : BASE/);
  assert.doesNotMatch(t, /Math\.random\(\)/, "no simulated bars");
  assert.match(t, /songBegan\(track\.id\)/);
  assert.match(t, /duration: 220/);
  assert.match(t, /duration: 420/);
});

test("player bar, library and right rail use the new layouts", () => {
  const bar = read("src/components/PlayerBar.tsx");
  assert.match(bar, /<EyeExtras \/>/);
  const ex = read("src/components/EyeExtras.tsx");
  for (const label of ["Sleep timer", "Lyrics", "Queue", "Mute", "Miniplayer"]) assert.match(ex, new RegExp(label));
  const sb = read("src/components/Sidebar.tsx");
  assert.match(sb, /fixedRow\("overview", "Overview", "Home"/);
  assert.match(sb, /fixedRow\("about", "About"/);
  assert.match(sb, /fixedRow\("settings", "Settings"/);
  assert.match(sb, /openSettings\("about"\)/);
  assert.match(read("src/components/RightRail.tsx"), /<Turntable track=\{track\} \/>/);
});

test("the old name is gone from everything the listener can see", () => {
  const roots = ["src", "electron", "build", "public", "index.html", "package.json"];
  const bad = [];
  const walk = (p) => {
    const st = statSync(new URL(`../${p}`, import.meta.url));
    if (st.isDirectory()) return readdirSync(new URL(`../${p}`, import.meta.url)).forEach((f) => walk(`${p}/${f}`));
    if (!/\.(ts|tsx|html|css|js|json|nsh|cs|cjs|mjs)$/.test(p)) return;
    const s = readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
    for (const m of s.matchAll(/ByTune|Bytune|bytune\.space|bytune:\/\//g)) bad.push(`${p}: ${m[0]}`);
  };
  roots.forEach(walk);
  assert.deepEqual(bad, []);
});
