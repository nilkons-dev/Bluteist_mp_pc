// Phase 6: smooth wall, launch sound, coverflow playlists, song-first Home, refresh, new avatars.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("cover wall: memoised rows, hover handled without React renders", () => {
  const w = read("src/components/CoverWall.tsx");
  assert.match(w, /memo\(/);
  assert.match(w, /is-hot/);
  assert.match(w, /data-lite/);
  const css = read("src/index.css");
  assert.match(css, /\.ob-card/);
  assert.doesNotMatch(css, /\.ob-tile:hover\s*\{[^}]*filter/);
});

test("intro: launch sound hooks and the Electron autoplay switch", () => {
  const i = read("public/intro.js");
  assert.match(i, /SFX/);
  for (const n of ["begin", "eye", "pupil", "boom", "word"]) assert.match(i, new RegExp(`sfx\\(["']${n}["']\\)`), n);
  assert.match(read("electron/main.ts"), /autoplayPolicy:\s*"no-user-gesture-required"/);
  assert.match(read("src/stores/settings.ts"), /setIntroSound/);
});

test("playlists for you is the 3D coverflow", () => {
  const c = read("src/components/Crate.tsx");
  assert.match(c, /cf-stage/);
  assert.doesNotMatch(read("src/index.css") + read("src/components/coverflow.css"), /\.ps-/);
  assert.match(read("src/components/coverflow.css"), /\.cf-rail\s*\{[^}]*pointer-events:\s*none/);
});

test("home: song rows lead, artists come later, refresh reshuffles", () => {
  const s = read("src/lib/recs/sections.ts");
  assert.match(s, /laneOf/);
  assert.match(s, /variant/);
  assert.match(s, /songs-searched/);
  const f = read("src/lib/recs/feed.ts");
  assert.match(f, /reloadHomeFeed/);
  assert.match(f, /markQueriesStale/);
  assert.match(read("src/views/HomeView.tsx"), /homeReloadNonce/);
  assert.match(read("src/components/TopBar.tsx"), /reloadHomeFeed/);
});

test("avatars: exactly the ten cat pictures", () => {
  const files = readdirSync(new URL("../src/assets/avatars/", import.meta.url)).filter((f) => f.endsWith(".webp"));
  assert.equal(files.length, 10);
  const a = read("src/lib/avatars.ts");
  assert.match(a, /01_leaping_cat/);
  assert.match(a, /10_shy_cat/);
});

test("cf- prefix does not collide with index.css", () => {
  const app = read("src/index.css");
  const css = read("src/components/coverflow.css");
  const names = [...new Set([...css.matchAll(/\.(cf-[a-z0-9-]+)/g)].map((m) => m[1]))];
  for (const c of names) assert.equal(new RegExp(`\\.${c}\\b`).test(app), false, c);
});
