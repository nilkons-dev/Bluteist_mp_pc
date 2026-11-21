/**
 * Discord Rich Presence (electron/discord-rpc.ts): the frame format, the activity Discord is sent,
 * and a whole handshake → READY → SET_ACTIVITY conversation against a real local socket.
 */
import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DiscordPresence, OP, buildActivity, decodeFrames, encodeFrame, ipcPaths, normalizeAppId } from "../.test-build/discord-rpc.mjs";

test("frames round-trip, split across chunks and glued together", () => {
  const a = encodeFrame(OP.FRAME, { hello: "wörld" });
  const b = encodeFrame(OP.PING, { n: 1 });
  const all = Buffer.concat([a, b]);
  const half = decodeFrames(all.subarray(0, a.length + 5));
  assert.equal(half.frames.length, 1);
  assert.deepEqual(half.frames[0], { op: OP.FRAME, data: { hello: "wörld" } });
  const rest = decodeFrames(Buffer.concat([half.rest, all.subarray(a.length + 5)]));
  assert.equal(rest.frames.length, 1);
  assert.equal(rest.frames[0].op, OP.PING);
  assert.equal(rest.rest.length, 0);
  assert.throws(() => decodeFrames(Buffer.from([1, 0, 0, 0, 255, 255, 255, 127, 0])));
});

test("application ids: only snowflakes", () => {
  assert.equal(normalizeAppId(" 123456789012345678 "), "123456789012345678");
  assert.equal(normalizeAppId("12345"), null);
  assert.equal(normalizeAppId("12345678901234567x"), null);
  assert.equal(normalizeAppId(undefined), null);
});

test("paths: pipes on Windows, sockets elsewhere", () => {
  assert.equal(ipcPaths("win32", {})[0], "\\\\?\\pipe\\discord-ipc-0");
  const p = ipcPaths("linux", { XDG_RUNTIME_DIR: "/run/user/1000/" });
  assert.equal(p[0], "/run/user/1000/discord-ipc-0");
  assert.ok(p.includes("/tmp/discord-ipc-9"));
  assert.ok(p.includes("/run/user/1000/app/com.discordapp.Discord/discord-ipc-0"));
});

test("activity: listening, song, artist, cover, time bar, button", () => {
  const a = buildActivity(
    { title: "Tum Hi Ho", artist: "Arijit Singh", album: "Aashiqui 2", durationSec: 240, positionSec: 30, cover: "https://x.test/c.jpg", videoId: "dQw4w9WgXcQ" },
    1_000_000
  );
  assert.equal(a.type, 2);
  assert.equal(a.details, "Tum Hi Ho");
  assert.equal(a.state, "Arijit Singh");
  assert.deepEqual(a.timestamps, { start: 970_000, end: 1_210_000 });
  assert.equal(a.assets.large_image, "https://x.test/c.jpg");
  assert.equal(a.buttons[0].url, "https://music.youtube.com/watch?v=dQw4w9WgXcQ");
});

test("activity: short text padded, no cover over http, unknown length has no end", () => {
  const a = buildActivity({ title: "X", artist: "", durationSec: 0, positionSec: 0, cover: "http://x.test/c.jpg", videoId: "bad" }, 5000);
  assert.ok(a.details.length >= 2 && a.state.length >= 2);
  assert.equal(a.assets, undefined);
  assert.equal(a.buttons, undefined);
  assert.deepEqual(a.timestamps, { start: 5000 });
  assert.ok(buildActivity({ title: "T".repeat(500), artist: "A", durationSec: 1, positionSec: 0 }, 1).details.length <= 128);
});

test("a full conversation with a fake Discord", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bl-discord-"));
  const path = join(dir, "discord-ipc-0");
  const seen = [];
  let clientId = null;
  const server = net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    sock.on("data", (d) => {
      const out = decodeFrames(Buffer.concat([buf, d]));
      buf = out.rest;
      for (const f of out.frames) {
        seen.push(f);
        if (f.op === OP.HANDSHAKE) {
          clientId = f.data.client_id;
          sock.write(encodeFrame(OP.FRAME, { cmd: "DISPATCH", evt: "READY", data: { user: { username: "tester" } } }));
        }
      }
    });
    sock.on("error", () => undefined);
  });
  await new Promise((r) => server.listen(path, r));
  const statuses = [];
  const d = new DiscordPresence({ paths: () => [join(dir, "nope"), path], onStatus: (s) => statuses.push(s.state) });
  try {
    assert.equal(d.configure({ enabled: true, appId: "123456789012345678" }).state, "connecting");
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(clientId, "123456789012345678");
    assert.deepEqual(d.getStatus(), { state: "connected", user: "tester" });
    d.setSong({ title: "Song", artist: "Artist", durationSec: 100, positionSec: 0 });
    await new Promise((r) => setTimeout(r, 400));
    const sets = seen.filter((f) => f.op === OP.FRAME && f.data.cmd === "SET_ACTIVITY");
    assert.equal(sets.length, 1);
    assert.equal(sets[0].data.args.activity.details, "Song");
    assert.equal(sets[0].data.args.pid, process.pid);
    d.setSong(null);
    await new Promise((r) => setTimeout(r, 2800));
    const after = seen.filter((f) => f.op === OP.FRAME && f.data.cmd === "SET_ACTIVITY");
    assert.equal(after.length, 2);
    assert.equal(after[1].data.args.activity, undefined);
    assert.equal(d.configure({ enabled: false, appId: "" }).state, "off");
  } finally {
    d.shutdown();
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bad id and missing Discord are reported, not thrown", () => {
  const d = new DiscordPresence({ paths: () => [] });
  assert.equal(d.configure({ enabled: true, appId: "abc" }).state, "invalid");
  assert.equal(d.configure({ enabled: false, appId: "" }).state, "off");
  d.shutdown();
});
