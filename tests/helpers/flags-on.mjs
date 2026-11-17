/**
 * esbuild plugin for tests that exercise the account screens and the update checks, both switched off in the
 * shipped source (ACCOUNTS_ENABLED in src/lib/config.ts, UPDATES_ENABLED in electron/updater.ts):
 * it bundles those two files with the flags on.
 */
import fs from "node:fs";

export const flagsOn = {
  name: "flags-on",
  setup(b) {
    b.onLoad({ filter: /[\\/](config|updater)\.ts$/ }, async (a) => {
      const src = await fs.promises.readFile(a.path, "utf8");
      return { contents: src.replace(/ACCOUNTS_ENABLED = false/, "ACCOUNTS_ENABLED = true").replace(/UPDATES_ENABLED = false/, "UPDATES_ENABLED = true"), loader: "ts" };
    });
  },
};
