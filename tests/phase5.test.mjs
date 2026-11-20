// Phase 5: steady cover wall with drag, settings icons, About text, library resize, playlist stack, grey rows, Play next.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("cover wall: no tilt toward the pointer; rows are pulled by hand", () => {
  const w = read("src/components/CoverWall.tsx");
  assert.doesNotMatch(w, /--px|--py|rotateX\(\$\{/);
  assert.match(w, /setPointerCapture/);
  assert.match(w, /FLING_MAX/);
  const css = read("src/index.css");
  assert.doesNotMatch(css, /ob-wall-left|ob-wall-right/);
  assert.match(css, /rotateX\(22deg\) rotateY\(-20deg\) rotateZ\(-7deg\)/);
});

test("settings: eight animated icons, one per category; About says what the user wrote", () => {
  const i = read("src/components/SettingsIcons.tsx");
  for (const n of ["Account", "Playback", "Sound", "Lyrics", "Display", "Library", "Data", "About"]) assert.match(i, new RegExp(`export function ${n}Icon`));
  const sv = read("src/views/SettingsView.tsx");
  assert.match(sv, /icon: AccountIcon/);
  assert.match(sv, /icon: AboutIcon/);
  const a = read("src/components/AboutBody.tsx");
  assert.match(a, /Beyond Music\. Beyond Ordinary\./);
  assert.match(a, /Privacy Without Compromise/);
  assert.match(a, /Built with Purpose\. Designed for Music\. Defined by You\./);
  for (const f of ["src/components/AboutBody.tsx", "src/components/FloatingWindows.tsx", "src/views/SettingsView.tsx"]) {
    assert.doesNotMatch(read(f), /GPL-3\.0|NOTICE file/, f);
  }
  const css = read("src/components/settingsIcons.css");
  assert.match(css, /@keyframes si-head/);
});

test("library: pulled from its edge, folds to a strip, Home sits in the same list", () => {
  const sb = read("src/components/Sidebar.tsx");
  assert.match(sb, /LIB_STRIP = 62/);
  assert.match(sb, /role="separator"/);
  assert.match(sb, /lb-compact/);
  assert.doesNotMatch(sb, /<div className="lb-sep" \/>\s*\{\/\* the library/);
  const css = read("src/components/libraryEye.css");
  assert.match(css, /\.lb-compact \.lb-tx/);
});

test("rows and the panel glow are grey and white, never cover colours", () => {
  const css = read("src/index.css");
  assert.match(css, /\.tl-light::before,\s*\.tl-playing::before \{[^}]*rgb\(255 255 255 \/ 0\.12\)/);
  assert.doesNotMatch(css.slice(css.indexOf(".tl-light::before"), css.indexOf(".tl-row {")), /blur\(30px\)/);
  const g = read("src/components/CoverGlow.tsx");
  assert.doesNotMatch(g, /tintThumb|usePlayer|backgroundImage/);
});

test("Play next on the playing song goes on to the next one", () => {
  const t = read("src/lib/trackActions.ts");
  assert.match(t, /export function nowPlayingMenuItems/);
  assert.match(t, /s\.next\(true\)/);
  assert.match(read("src/components/Turntable.tsx"), /nowPlayingMenuItems\(track\)/);
});

test("home brings more suggestions", () => {
  const s = read("src/lib/recs/sections.ts");
  assert.match(s, /MAX_SECTIONS = 22/);
  assert.match(s, /count: 20/);
});

test("new class prefixes (si-, ps-, ab-) do not collide with index.css", () => {
  const app = read("src/index.css");
  const css = read("src/components/settingsIcons.css") + read("src/components/coverflow.css") + read("src/components/about.css");
  const names = [...new Set([...css.matchAll(/\.((?:si|cf|ab)-[a-z0-9-]+)/g)].map((m) => m[1]))];
  for (const c of names) assert.equal(new RegExp(`\\.${c}\\b`).test(app), false, c);
});
