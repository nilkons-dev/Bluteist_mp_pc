// Phase 7: intro pre-rendered sound + toggle, endless coverflow, sidebar bloom + Spotify menu, search bar, search-led songs.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("intro: ready-made sound first, live synthesis only as a fallback; switch lives in Sound settings", () => {
  const i = read("public/intro.js");
  assert.match(i, /const PRE=/);
  assert.match(i, /usePre/);
  assert.match(i, /SFX\.unlock/);
  assert.match(read("public/intro-sound.js"), /^\/\*[^]*?\*\/\nwindow\.__bluIntroSound="data:audio\/ogg;base64,/);
  const html = read("index.html");
  assert.ok(html.indexOf("intro-sound.js") > 0 && html.indexOf("intro-sound.js") < html.indexOf('./intro.js"'));
  const sv = read("src/views/SettingsView.tsx");
  const sound = sv.slice(sv.indexOf("function SoundPane"), sv.indexOf("function SoundPane") + 2200);
  assert.match(sound, /Launch sound/);
  assert.match(sound, /introSound/);
  assert.match(read("src/App.tsx"), /blutheist\.introSound/);
  assert.match(read("src/stores/settings.ts"), /introSound: true/);
});

test("coverflow: endless, compact, no Now focused bar, no edge shadows", () => {
  const c = read("src/components/Crate.tsx");
  assert.match(c, /wrapIdx/);
  assert.match(c, /around\(/);
  assert.doesNotMatch(c, /Now focused|cf-hint|cf-meta|cf-progress/);
  const css = read("src/components/coverflow.css");
  assert.doesNotMatch(css, /cf-hint|cf-meta|cf-floor/);
  assert.match(css, /height: calc\(var\(--cf-card\) \* 1\.3\)/);
});

test("sidebar: no bloom, line under the header, short empty text, Spotify choices", () => {
  const s = read("src/components/Sidebar.tsx");
  assert.doesNotMatch(s, /mountBloom|LibraryBloom/);
  assert.equal(existsSync(new URL("../src/lib/bloom.ts", import.meta.url)), false);
  assert.match(s, /lb-sep-top/);
  assert.match(s, /No playlists yet/);
  assert.doesNotMatch(s, /Nothing here yet/);
  assert.match(s, /Import playlist/);
  assert.match(s, /Connect Spotify/);
  const css = read("src/components/libraryEye.css");
  assert.doesNotMatch(css, /lb-bloom|lb-fly/);
  assert.match(read("src/lib/importSongs.ts"), /export function askToImportPlaylist/);
});

test("search bar: the supplied field, string and pool, released on unmount", () => {
  const t = read("src/components/TopBar.tsx");
  assert.match(t, /mountSearchFx/);
  assert.match(t, /sx-field/);
  assert.match(t, /sx-home/);
  const f = read("src/lib/searchFx.ts");
  assert.match(f, /export function mountSearchFx/);
  assert.match(f, /offs\.forEach/);
  const css = read("src/components/searchFx.css");
  assert.match(css, /\.sx-field/);
});

test("home: searches weigh more (newest first) and lead the song rows", () => {
  const s = read("src/lib/recs/sections.ts");
  assert.match(s, /priority: 90/);
  assert.match(s, /i === 0 \? 3 : 2/);
  assert.match(read("src/lib/recs/queries.ts"), /QUERIES_READ = 4/);
});

test("new class prefixes (sx-, lb- additions) do not collide with index.css", () => {
  const app = read("src/index.css");
  const css = read("src/components/searchFx.css");
  const names = [...new Set([...css.matchAll(/\.(sx-[a-z0-9-]+)/g)].map((m) => m[1]))];
  for (const c of names) assert.equal(new RegExp(`\\.${c}\\b`).test(app), false, c);
});
