/**
 * Trial period rules: no Electron, no disk. The trial ends at one fixed instant; after it the app
 * never runs again. Three things decide "has it ended" and the answer is the strictest of them:
 *   1. the device clock,
 *   2. the latest moment ever seen by this install (a ratchet that rolling the clock back can't undo),
 *   3. the real time, read from a server's HTTP Date header when the network allows.
 * Once it has ended, a sealed "expired" flag is saved in several places, so it stays ended.
 */
import { createHmac, timingSafeEqual } from "crypto";

/** 1 January 2027, 00:00 in Asia/Dhaka (UTC+6) = 31 December 2026, 18:00 UTC. */
export const TRIAL_END_UTC = Date.UTC(2026, 11, 31, 18, 0, 0);

export interface TrialRecord {
  v: 1;
  /** The latest trusted moment (ms since epoch) this install has seen. */
  seen: number;
  /** True once the trial has been found over; never goes back to false. */
  expired: boolean;
}

// Not a secret (it ships in the app); it makes a hand-edited record fail its seal so editing is not a one-line job.
const SEAL_KEY = "blu·trial·" + ["7c1e", "93ab", "5d02", "e8f4"].join("");

function sealOf(r: TrialRecord): string {
  return createHmac("sha256", SEAL_KEY).update(`${r.v}|${Math.floor(r.seen)}|${r.expired ? 1 : 0}`).digest("hex");
}

export function encodeRecord(r: TrialRecord): string {
  return JSON.stringify({ ...r, seen: Math.floor(r.seen), sig: sealOf(r) });
}

/** The record in `text`, or null when it is missing its seal, doesn't match it, or isn't a record at all. */
export function decodeRecord(text: string): TrialRecord | null {
  try {
    const o = JSON.parse(text) as Partial<TrialRecord> & { sig?: unknown };
    if (!o || o.v !== 1 || typeof o.seen !== "number" || !Number.isFinite(o.seen) || typeof o.expired !== "boolean") return null;
    if (typeof o.sig !== "string") return null;
    const rec: TrialRecord = { v: 1, seen: o.seen, expired: o.expired };
    const want = Buffer.from(sealOf(rec), "hex");
    const got = Buffer.from(o.sig, "hex");
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    return rec;
  } catch {
    return null;
  }
}

/** What one saved copy turned out to be. */
export type Copy = { kind: "absent" } | { kind: "bad" } | { kind: "ok"; record: TrialRecord };

export interface Verdict {
  locked: boolean;
  /** Why: "time" the date has passed, "flag" a saved expired flag, "tamper" the saved records were damaged, or "" when still running. */
  reason: "time" | "flag" | "tamper" | "";
  /** The trusted moment to save as the new ratchet. */
  seen: number;
}

/**
 * The decision. `netTime` is the server time in ms, or null when it couldn't be read.
 * A copy that exists but fails its seal counts as tampering only when no good copy survives
 * (one copy lost to a crash or a cleaner heals from another).
 */
export function decide(now: number, copies: Copy[], netTime: number | null): Verdict {
  const good = copies.flatMap((c) => (c.kind === "ok" ? [c.record] : []));
  const anyBad = copies.some((c) => c.kind === "bad");
  let seen = Number.isFinite(now) ? now : 0;
  for (const r of good) seen = Math.max(seen, r.seen);
  if (netTime !== null && Number.isFinite(netTime)) seen = Math.max(seen, netTime);
  if (good.some((r) => r.expired)) return { locked: true, reason: "flag", seen };
  if (seen >= TRIAL_END_UTC) return { locked: true, reason: "time", seen };
  if (anyBad && good.length === 0) return { locked: true, reason: "tamper", seen };
  return { locked: false, reason: "", seen };
}

/** The server clock from an HTTP Date header, or null. */
export function parseDateHeader(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  // A sane window only: a broken or hostile reply must not push the ratchet years ahead.
  return Number.isFinite(t) && t > Date.UTC(2024, 0, 1) && t < Date.UTC(2100, 0, 1) ? t : null;
}
