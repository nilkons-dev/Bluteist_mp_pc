/**
 * The launch intro (Blutheist's eye logo, then the wordmark):
 * - index.html holds its markup, src/intro.css draws it, public/intro.js plays it before the app loads
 *   (never in the miniplayer's window) and src/intro.ts ends it, only once the whole show has played;
 * - the logo and wordmark then fly onto the app's own, which carry data-intro-mark / data-intro-word.
 * These are checks on the files themselves and on intro.ts's flight maths; the show itself was
 * run in a real browser.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const script = read("public/intro.js");
const page = read("index.html");
const css = read("src/intro.css");
const ts = read("src/intro.ts");

test("public/intro.js is valid, turns the intro on before anything paints, never in the miniplayer's window", () => {
  assert.doesNotThrow(() => new vm.Script(script));
  assert.match(script, /get\("window"\) === "pip"\) return/);
  assert.match(script, /classList\.add\("intro", "intro-wait"\)/);
  assert.match(script, /window\.bytuneIntro = intro/);
  assert.match(script, /prefers-reduced-motion: reduce/);
});

test("the page loads it before the app, styled from <head>, with no inline scripts", () => {
  const head = page.slice(0, page.indexOf("</head>"));
  assert.ok(head.indexOf('src="./intro.js"') > -1, "intro.js is in <head>");
  assert.ok(head.indexOf('href="/src/intro.css"') > -1, "intro.css is linked in <head>");
  assert.ok(head.indexOf("intro.js") < head.indexOf("/src/main.tsx"), "it runs before the app's bundle");
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(page), "no inline <script>");
  assert.ok(!/intro-light|<canvas/.test(page), "the old light show is gone");
});

test("every element intro.js drives is in the markup", () => {
  for (const id of ["intro", "intro-stack", "intro-logo", "intro-wrap", "intro-wm", "ig-ripple", "ig-body", "ig-outline", "ig-eye", "ig-pupilG"]) {
    assert.ok(page.includes(`id="${id}"`), `#${id}`);
    assert.ok(id === "intro" || script.includes(id), `intro.js uses #${id}`);
  }
  assert.match(page, /<svg id="intro-logo"[^>]*viewBox="0 80 1254 1040"/);
  assert.match(page, /<title>Blutheist<\/title>/);
});

test("the stylesheet covers the wordmark slices intro.js builds, with the artwork it needs", () => {
  for (const cls of [".wm", ".l", ".spk", ".halo", ".flare"]) assert.ok(css.includes(`#intro ${cls}`), cls);
  for (const asset of ["blutheist-letters.png", "blutheist-spark.png"]) {
    assert.ok(css.includes(asset), asset);
    assert.ok(fs.existsSync(new URL(`../src/assets/brand/${asset}`, import.meta.url)), `${asset} exists`);
  }
  assert.ok(fs.existsSync(new URL("../src/assets/brand/blutheist-wordmark.png", import.meta.url)));
  assert.match(css, /html\.intro-wait #root\s*\{\s*opacity: 0/);
  assert.match(css, /opacity: 0\.999/, "the ground stays 99.9% so the app under it is drawn");
});

test("it plays in full before the app shows, and every wait has a limit", () => {
  assert.match(ts, /await played;/);
  assert.match(ts, /SHOW_CAP_MS/);
  assert.match(ts, /wait\(6000\)/);
  assert.match(ts, /WARM_MS = 1500/);
  assert.ok(ts.indexOf("await played") < ts.indexOf("await warmUp(intro)"), "the show first, then the app");
});

test("the top bar and onboarding carry the landing spots the intro flies onto", () => {
  for (const file of ["src/components/TopBar.tsx", "src/views/OnboardingView.tsx"]) {
    const src = read(file);
    assert.match(src, /data-intro-target/, file);
    assert.match(src, /data-intro-mark/, file);
    assert.match(src, /data-intro-word/, file);
    assert.match(src, /blutheist-wordmark\.png/, file);
  }
});

test("flight() scales a box by k and carries its point onto the target", async () => {
  const require = createRequire(import.meta.url);
  const { outputFiles } = await build({
    entryPoints: [fileURLToPath(new URL("../src/intro.ts", import.meta.url))],
    bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent",
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputFiles[0].text)(require, module, module.exports);
  const { flight } = module.exports;
  assert.equal(flight({ left: 100, top: 50 }, { x: 150, y: 100 }, { x: 20, y: 30 }, 0.5), "translate(-105px, -45px) scale(0.5)");
  assert.equal(flight({ left: 0, top: 0 }, { x: 10, y: 10 }, { x: 10, y: 10 }, 1), "translate(0px, 0px) scale(1)");
});
