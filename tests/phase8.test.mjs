import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("a hidden window holds its animation frames and pauses CSS animation, then wakes", () => {
  const bg = read("src/lib/background.ts");
  assert.match(bg, /__bluSetBg/);
  assert.match(bg, /is-bg/);
  assert.match(read("src/main.tsx"), /lib\/background/);
  assert.match(read("src/index.css"), /html\.is-bg \*[^{]*\{[^}]*animation-play-state:\s*paused/);
  const m = read("electron/main.ts");
  assert.match(m, /pushHidden/);
  for (const ev of ["show", "hide", "minimize", "restore"]) assert.match(m, new RegExp(`"${ev}"`));
});

test("Home: songs first, no Browse chips or Because rows, artists last", () => {
  const s = read("src/lib/recs/sections.ts");
  assert.match(s, /if \(false as boolean\)/);
  assert.match(s, /yt-artists-/);
  assert.match(s, /laneOf\(a\.kind, a\.id\) - laneOf\(b\.kind, b\.id\)/);
  assert.match(read("src/views/HomeView.tsx"), /home-swap|fade/);
});

test("spectrum reads fine bands; coverflow and bloom stay cheap", () => {
  assert.match(read("src/lib/audio.ts"), /fftSize = 4096/);
  assert.match(read("src/components/Turntable.tsx"), /getFloatFrequencyData/);
  assert.match(read("src/components/coverflow.css"), /display:\s*none/);
  assert.match(read("src/lib/bloom.ts"), /paint/);
});

test("idle timers sleep while the window is hidden", () => {
  assert.match(read("src/components/CoverWall.tsx"), /is-bg/);
  assert.match(read("src/components/EyeLogo.tsx"), /is-bg/);
});
