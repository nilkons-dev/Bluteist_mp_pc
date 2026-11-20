// Phase 4: the cover wall, library rows, now-playing changes, profile pictures.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
async function load(entry) {
  const dir = mkdtempSync(join(tmpdir(), "p4-"));
  const out = join(dir, "m.mjs");
  await build({ entryPoints: [new URL(`../${entry}`, import.meta.url).pathname], bundle: true, format: "esm", outfile: out, loader: { ".png": "dataurl", ".webp": "dataurl" }, logLevel: "silent" });
  return import(out);
}

test("ten avatars ship, every one resolves, and the random pick is always one of them", async () => {
  const a = await load("src/lib/avatars.ts");
  assert.equal(a.AVATARS.length, 10);
  assert.equal(readdirSync(new URL("../src/assets/avatars", import.meta.url)).length, 10);
  assert.equal(new Set(a.AVATARS.map((x) => x.id)).size, 10);
  for (const x of a.AVATARS) assert.ok(a.avatarSrc(a.builtInChoice(x.id)));
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const c = a.randomAvatarChoice();
    assert.ok(a.isAvatarChoice(c));
    seen.add(c);
  }
  assert.equal(seen.size, 10, "all ten come up");
  assert.ok(a.isAvatarChoice(a.randomAvatarChoice(() => 0.9999999)));
  assert.ok(a.isAvatarChoice(a.randomAvatarChoice(() => 0)));
});

test("choices are validated; keys tell profiles apart", async () => {
  const a = await load("src/lib/avatars.ts");
  assert.equal(a.avatarSrc("b:nope"), null);
  assert.equal(a.avatarSrc("c:https://evil/x.png"), null);
  assert.equal(a.avatarSrc(null), null);
  assert.equal(a.avatarSrc(a.customChoice("data:image/jpeg;base64,AAAA")), "data:image/jpeg;base64,AAAA");
  assert.equal(a.isAvatarChoice(a.customChoice("data:image/jpeg;base64," + "A".repeat(500_000))), false);
  assert.equal(a.avatarKey("guest", null), "guest");
  assert.equal(a.avatarKey("account", " Ana "), "a:ana");
  assert.equal(a.avatarKey("account", null), null);
  assert.equal(a.avatarKey(null, null), null);
});

test("the wall replaces the drum, using the same covers", () => {
  const ob = read("src/views/OnboardingView.tsx");
  assert.match(ob, /<CoverWall turn=/);
  assert.doesNotMatch(ob, /CoverDrum/);
  const w = read("src/components/CoverWall.tsx");
  assert.match(w, /from "\.\.\/lib\/coverDrum"/);
  assert.doesNotMatch(read("src/index.css"), /\.ob-drum/);
});

test("library: Home row, bigger covers, lean About / Settings", () => {
  const sb = read("src/components/Sidebar.tsx");
  assert.match(sb, /fixedRow\("overview", "Home", null/);
  assert.match(sb, /fixedRow\("about", "About", null/);
  assert.match(sb, /fixedRow\("settings", "Settings", null/);
  assert.doesNotMatch(sb, /Version & info|Preferences"/);
  assert.match(sb, /size=\{56\}/);
  assert.match(sb, /lb-grip/);
  assert.doesNotMatch(sb, /<div className="lb-sep" \/>\s*\{\/\* the library/);
});

test("now playing: one-line sliding title, EQ switch by the heart, black arm head, disc before About", () => {
  const t = read("src/components/Turntable.tsx");
  assert.ok(t.indexOf("np-eqb") < t.indexOf("ref={likeRef}"), "EQ before the heart");
  assert.doesNotMatch(t, /className=\{`np-eq\$\{/);
  assert.match(t, /is-slide/);
  assert.doesNotMatch(t, /<rect x="260" y="14"[^>]*fill="#fff"/);
  const css = read("src/components/turntable.css");
  assert.match(css, /\.np-title \{[^}]*white-space: nowrap/);
  const r = read("src/components/RightRail.tsx");
  assert.ok(r.indexOf("<Turntable track={track} />") < r.indexOf("<SongPoster track={track} />"));
  assert.ok(r.indexOf("<SongPoster track={track} />") < r.indexOf("<AboutArtistCard track={track} fallbackImage={artistImage"));
  assert.doesNotMatch(t, /np-eqdot/);
  assert.doesNotMatch(r, /wideArtwork\(photo\)/);
});

test("profile pictures: top bar shows the name and tucks it away, Settings and the picker can change it", () => {
  const tb = read("src/components/TopBar.tsx");
  assert.match(tb, /av-who-name/);
  assert.match(read("src/components/avatars.css"), /@media \(max-width: 1100px\)[^}]*\{\s*\.av-who-name \{ max-width: 0/);
  assert.match(read("src/views/SettingsView.tsx"), /openFloating\("avatar"\)/);
  const f = read("src/components/FloatingWindows.tsx");
  assert.match(f, /pickCoverImage/);
  assert.match(f, /floating === "avatar"/);
  assert.match(read("src/stores/ui.ts"), /"eq" \| "about" \| "avatar"/);
});

test("new class prefixes do not collide with index.css", () => {
  const app = read("src/index.css");
  const mine = ["av-", "np-", "lb-", "fw-"].flatMap((p) => {
    const css = read("src/components/avatars.css") + read("src/components/turntable.css") + read("src/components/libraryEye.css") + read("src/components/floating.css");
    return [...new Set([...css.matchAll(new RegExp(`\\.(${p}[a-z0-9-]+)`, "g"))].map((m) => m[1]))];
  });
  for (const c of mine) assert.equal(new RegExp(`\\.${c}\\b`).test(app), false, c);
});
