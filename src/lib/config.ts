/**
 * App-level configuration.
 *
 * Blutheist's Supabase project isn't written here: scripts/build-main.mjs bakes it
 * into the build from BYTUNE_SUPABASE_URL / BYTUNE_SUPABASE_KEY (a local,
 * uncommitted .env, or CI secrets), so a copy of this code doesn't come wired
 * to Blutheist's database. The publishable key still ships inside the app, as
 * Supabase intends; the real gate is Row-Level Security on the server. Without
 * them a build runs guest-only.
 */
// The typeof keeps this loadable where `process` doesn't exist (the test harnesses' sandboxes);
// the member expressions must stay literal for the build's define to replace them.
export const SUPABASE_URL = (typeof process === "undefined" ? undefined : process.env.BYTUNE_SUPABASE_URL) ?? "";
export const SUPABASE_ANON_KEY = (typeof process === "undefined" ? undefined : process.env.BYTUNE_SUPABASE_KEY) ?? "";

/**
 * Accounts (username + password, Google) are switched off for now: the app runs guest-only. Guests pick
 * "Continue as guest" and a display name, and their library stays on this computer. Set this to true
 * (with a Supabase project in the build, see above) to bring sign-up, sign-in and Google back; every
 * account screen and the main process's cloud client follow it.
 */
export const ACCOUNTS_ENABLED = false;

/** Deep-link scheme used for the Google OAuth redirect back into the app. */
export const OAUTH_PROTOCOL = "bytune";
export const OAUTH_REDIRECT = "bytune://oauth/callback";

/** Local JSON stores replicated to the cloud when signed in. */
export const SYNCED_STORES = [
  "library",
  "settings",
  "recent-searches",
  "listening-signals",
  "listening-history",
  "artist-meta-cache",
] as const;

/**
 * Username namespace that never collides with real email addresses.
 *
 * Usernames may contain `_` and `@`; the auth provider's email validation
 * rejects a raw `@` inside the local part, so every `@` maps to `--`. The
 * mapping is injective over the allowed charset (`-` is not a legal username
 * character, so `--` can only ever come from an `@`), and names without `@`
 * map exactly as they always have — existing accounts are unaffected.
 */
export const syntheticEmail = (username: string): string =>
  `${username.toLowerCase().replace(/@/g, "--")}@users.bytune.local`;
