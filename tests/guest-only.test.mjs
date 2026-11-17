/**
 * Accounts are switched off (ACCOUNTS_ENABLED = false in src/lib/config.ts): the app is guest-only. With the
 * flag off the ways in are "Continue as guest" alone, then a display name; the main process's cloud client
 * refuses; a release build doesn't demand a Supabase project. Turning the flag on brings everything back.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the flag ships off", () => {
  assert.match(read("src/lib/config.ts"), /export const ACCOUNTS_ENABLED = false;/);
});

test("onboarding: Google, create account and sign in sit behind the flag; guest stays", () => {
  const src = read("src/views/OnboardingView.tsx");
  const gate = src.indexOf("{ACCOUNTS_ENABLED && (");
  assert.ok(gate > -1);
  assert.ok(src.indexOf('title="Continue with Google"') > gate, "Google is inside the gate");
  assert.ok(src.indexOf('title="Create an account"') > gate);
  assert.ok(src.indexOf('title="Sign in"') > gate);
  assert.ok(src.indexOf('title="Continue as guest"') > src.indexOf("</>\n        )}"), "guest is outside it");
  assert.match(src, /navigate\("guestname"\)/);
  assert.match(src, /!ACCOUNTS_ENABLED && \["signup", "signin", "pickusername", "restoring"\]/);
});

test("the main process's cloud client follows the flag, and a release build doesn't need Supabase while it's off", () => {
  assert.match(read("electron/supabase.ts"), /ACCOUNTS_ENABLED && !!SUPABASE_URL/);
  assert.match(read("scripts/build-main.mjs"), /accountsOn && \(!url \|\| !key\)/);
});

test("no sign-in prompt is left for a guest: settings, the guest warning, rooms", () => {
  assert.match(read("src/views/SettingsView.tsx"), /!ACCOUNTS_ENABLED \? null/);
  assert.match(read("src/components/AccountModals.tsx"), /ACCOUNTS_ENABLED && \(/);
  assert.match(read("src/components/RoomPanel.tsx"), /ACCOUNTS_ENABLED && \(/);
});

test("update checks are off until the app has releases of its own", () => {
  assert.match(read("electron/updater.ts"), /const UPDATES_ENABLED = false;/);
  assert.ok(!/"publish"/.test(read("package.json")), "package.json doesn't publish to someone else's repository");
});
