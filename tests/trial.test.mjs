/** The trial rules (electron/trial-core.ts) and that the app is wired to them at every way in. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TRIAL_END_UTC, decide, decodeRecord, encodeRecord, parseDateHeader } from "../.test-build/trial-core.mjs";

const ok = (seen, expired = false) => ({ kind: "ok", record: { v: 1, seen, expired } });
const DAY = 86400000;

test("the trial ends exactly at 1 January 2027, 00:00 in Dhaka", () => {
  assert.equal(new Date(TRIAL_END_UTC).toISOString(), "2026-12-31T18:00:00.000Z");
  assert.equal(new Date(TRIAL_END_UTC + 6 * 3600000).toISOString(), "2027-01-01T00:00:00.000Z");
});

test("running before the end, locked at and after it", () => {
  assert.equal(decide(TRIAL_END_UTC - 1, [{ kind: "absent" }], null).locked, false);
  assert.equal(decide(TRIAL_END_UTC, [{ kind: "absent" }], null).locked, true);
  assert.equal(decide(TRIAL_END_UTC + 400 * DAY, [], null).locked, true);
});

test("rolling the clock back does not unlock (ratchet)", () => {
  const v = decide(TRIAL_END_UTC - 30 * DAY, [ok(TRIAL_END_UTC + DAY)], null);
  assert.equal(v.locked, true);
});

test("an earlier ratchet only moves forward", () => {
  const v = decide(1000, [ok(5000)], null);
  assert.equal(v.seen, 5000);
  assert.equal(v.locked, false);
});

test("server time past the end locks even with a rolled-back clock and no saved files", () => {
  const v = decide(TRIAL_END_UTC - 60 * DAY, [{ kind: "absent" }], TRIAL_END_UTC + 1);
  assert.equal(v.locked, true);
  assert.equal(v.reason, "time");
});

test("a saved expired flag stays locked whatever the clock says", () => {
  const v = decide(TRIAL_END_UTC - 90 * DAY, [{ kind: "absent" }, ok(0, true)], null);
  assert.equal(v.locked, true);
  assert.equal(v.reason, "flag");
});

test("deleting some copies is healed by the rest; all copies damaged is treated as tampering", () => {
  assert.equal(decide(1000, [{ kind: "absent" }, { kind: "bad" }, ok(900)], null).locked, false);
  const t = decide(1000, [{ kind: "bad" }, { kind: "absent" }], null);
  assert.equal(t.locked, true);
  assert.equal(t.reason, "tamper");
});

test("records are sealed: editing one invalidates it", () => {
  const text = encodeRecord({ v: 1, seen: 123456, expired: true });
  assert.deepEqual(decodeRecord(text), { v: 1, seen: 123456, expired: true });
  assert.equal(decodeRecord(text.replace('"expired":true', '"expired":false')), null);
  assert.equal(decodeRecord(text.replace("123456", "1")), null);
  assert.equal(decodeRecord("not json"), null);
  assert.equal(decodeRecord(JSON.stringify({ v: 1, seen: 1, expired: false })), null);
});

test("the Date header is read only when sane", () => {
  assert.equal(parseDateHeader("Fri, 01 Jan 2027 00:00:00 GMT"), Date.UTC(2027, 0, 1));
  assert.equal(parseDateHeader("garbage"), null);
  assert.equal(parseDateHeader(null), null);
  assert.equal(parseDateHeader("Mon, 01 Jan 2001 00:00:00 GMT"), null);
});

test("main.ts checks the trial at every way into the app", () => {
  const main = readFileSync(new URL("../electron/main.ts", import.meta.url), "utf8");
  const when = main.indexOf("app.whenReady().then(");
  assert.ok(when > 0);
  const gate = main.indexOf("trial.bootLocked()", when);
  assert.ok(gate > when && gate < main.indexOf("createWindow();", when), "gate before any window");
  assert.match(main.slice(main.indexOf("function showMainWindow"), main.indexOf("function showMainWindow") + 300), /trial\.isLocked\(\)/);
  assert.match(main.slice(main.indexOf('"second-instance"'), main.indexOf('"second-instance"') + 200), /trial\.isLocked\(\)/);
  assert.match(main, /ipcMain\.handle\(channel, \(event, \.\.\.args\) => \{\s*if \(trial\.isLocked\(\)/);
  assert.match(main, /trial\.watch\(/);
});

test("the notice carries the exact wording and both usernames, and no script", () => {
  const t = readFileSync(new URL("../electron/trial.ts", import.meta.url), "utf8");
  assert.ok(t.includes("Your 30-day free trial has ended. If you would like to get a new free trial, please contact any one of the following Discord users:"));
  assert.ok(t.includes("Usernames:"));
  assert.ok(t.includes("<span>the_theist</span>") && t.includes("<span>the_blucefer</span>"));
  const page = t.slice(t.indexOf("const PAGE"), t.indexOf("/** The one window"));
  assert.ok(!/<script/i.test(page));
  assert.ok(!/preload/.test(t.slice(t.indexOf("export function showLockedWindow"))));
});
