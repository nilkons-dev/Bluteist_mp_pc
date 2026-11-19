/**
 * The middle panel's glow (src/components/CoverGlow.tsx) with the real UI store, in jsdom: it is the same light grey-white
 * haze whatever is playing or hovered (never a cover's colours), and the artist page and Settings have none.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import React, { act } from "react";

const environment = new JSDOM("<div></div>", { url: "http://localhost" });
globalThis.window = environment.window;
globalThis.document = environment.window.document;
globalThis.Image = environment.window.Image;
globalThis.bytune = { readData: async () => null, writeData: async () => undefined };
const { createRoot } = await import("react-dom/client");

const require = createRequire(import.meta.url);
const { outputFiles } = await build({
  stdin: {
    contents: `export { CoverGlow } from "./src/components/CoverGlow"; export { useUI } from "./src/stores/ui";`,
    resolveDir: fileURLToPath(new URL("..", import.meta.url)),
    loader: "tsx",
  },
  bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent",
  external: ["react", "react/jsx-runtime", "react-dom", "lucide-react"],
});
const module = { exports: {} };
new Function("require", "module", "exports", outputFiles[0].text)(require, module, module.exports);
const { CoverGlow, useUI } = module.exports;

async function mount() {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Image = dom.window.Image;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.bytune = globalThis.bytune;
  const root = createRoot(document.getElementById("root"));
  await act(async () => root.render(React.createElement(CoverGlow)));
  return {
    glow: () => document.querySelector(".cover-glow"),
    art: () => document.querySelectorAll(".cover-glow-art").length,
    close: async () => {
      await act(async () => root.unmount());
      dom.window.close();
    },
  };
}

test("the glow is the neutral haze, and a hovered card's cover does not tint it", async () => {
  useUI.setState({ view: { name: "home" }, tintThumb: null });
  const m = await mount();
  assert.ok(m.glow()?.classList.contains("cover-glow-neutral"));
  await act(async () => useUI.getState().setTintThumb("https://covers.example/b.jpg"));
  assert.equal(m.art(), 0, "no cover layer");
  assert.ok(m.glow()?.classList.contains("cover-glow-neutral"));
  await m.close();
});

test("the artist page and Settings have no glow", async () => {
  const m = await mount();
  for (const name of ["artist", "settings"]) {
    await act(async () => useUI.setState({ view: { name } }));
    assert.equal(m.glow(), null, name);
  }
  await act(async () => useUI.setState({ view: { name: "home" } }));
  assert.ok(m.glow());
  await m.close();
});
