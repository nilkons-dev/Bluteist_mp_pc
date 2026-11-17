/**
 * Bundles the Electron main process and preload into dist-electron/, with Blutheist's Supabase project
 * baked in from BYTUNE_SUPABASE_URL and BYTUNE_SUPABASE_KEY: the environment (CI secrets) or a local,
 * uncommitted .env (see .env.example). The source carries neither, so a copy of this code doesn't come
 * wired to Blutheist's database. Without them the app runs guest-only; a release build (BYTUNE_RELEASE=1)
 * refuses to, so no official build ships without accounts.
 */
import { readFileSync } from "node:fs";
import { build } from "esbuild";

// Accounts are switched on in src/lib/config.ts (ACCOUNTS_ENABLED). While they are off, a build is guest-only by design.
const accountsOn = /ACCOUNTS_ENABLED\s*=\s*true/.test(readFileSync("src/lib/config.ts", "utf8"));

try {
  process.loadEnvFile(".env"); // values already in the environment win
} catch {
  /* no .env: CI, or a build without Blutheist's project */
}
const url = process.env.BYTUNE_SUPABASE_URL ?? "";
const key = process.env.BYTUNE_SUPABASE_KEY ?? "";
if (accountsOn && (!url || !key)) {
  if (process.env.BYTUNE_RELEASE === "1") {
    console.error("Release build without BYTUNE_SUPABASE_URL / BYTUNE_SUPABASE_KEY: accounts would be off. Add them to .env (or CI secrets).");
    process.exit(1);
  }
  console.warn("[build-main] No Supabase project set (.env): this build runs guest-only.");
}

await build({
  entryPoints: ["electron/main.ts", "electron/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron", "jsdom", "undici"],
  outdir: "dist-electron",
  define: {
    "process.env.BYTUNE_SUPABASE_URL": JSON.stringify(url),
    "process.env.BYTUNE_SUPABASE_KEY": JSON.stringify(key),
  },
  logLevel: "warning",
});
