/** Pasted YouTube links (src/lib/ytLink.ts) and the video-info → Track mapping (electron/yt-video.ts). */
import test from "node:test";
import assert from "node:assert/strict";
import { parseYouTubeLink } from "../.test-build/ytLink.mjs";
import { VIDEO_ID, cleanChannelName, trackFromVideoInfo } from "../.test-build/yt-video.mjs";

const ID = "dQw4w9WgXcQ";
test("every common link shape finds the video", () => {
  for (const u of [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}&list=RDAMVM${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `youtu.be/${ID}`,
    `https://m.youtube.com/watch?v=${ID}&t=42s`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `  https://www.youtube.com/live/${ID}  `,
  ]) assert.deepEqual(parseYouTubeLink(u), { kind: "video", videoId: ID }, u);
});
test("non-links and look-alikes are not links", () => {
  for (const u of ["", "tum hi ho", "https://example.com/watch?v=" + ID, "https://notyoutube.com/watch?v=" + ID, "https://www.youtube.com/watch?v=short"])
    assert.equal(parseYouTubeLink(u), null, u);
});
test("a bare playlist link is a playlist", () => {
  const r = parseYouTubeLink("https://www.youtube.com/playlist?list=PLabcdefghij123");
  assert.equal(r?.kind, "playlist");
});
test("video id shape", () => {
  assert.ok(VIDEO_ID.test(ID));
  assert.ok(!VIDEO_ID.test("abc"));
  assert.equal(typeof cleanChannelName("Artist - Topic"), "string");
});
