/**
 * Discord "Listening to" status, over Discord's local IPC (the same channel Spotify's own presence uses).
 *
 * The Discord desktop app listens on a named pipe (Windows) or a socket file (macOS / Linux) called
 * discord-ipc-0 … discord-ipc-9. Blutheist says hello with the listener's own Discord application id, and from
 * then on sets or clears one activity: the song, its artist, the cover and how far into the song it is.
 * Nothing leaves the computer except through the Discord app; there is no token and no login.
 *
 * Frames are [op: int32 LE][length: int32 LE][JSON]. Everything pure (framing, paths, the activity) is exported and
 * unit-tested; DiscordPresence owns the socket, the reconnects and the rate limit.
 */
import * as net from "net";

export const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 } as const;

/** What the Settings page shows. */
export type DiscordStatus =
  | { state: "off" }
  | { state: "invalid"; message: string }
  | { state: "connecting"; message?: string }
  | { state: "unavailable"; message: string }
  | { state: "connected"; user?: string };

/** One song, as the renderer describes it. */
export interface PresenceInput {
  title: string;
  artist: string;
  album?: string;
  /** seconds; 0 = unknown */
  durationSec: number;
  /** seconds into the song at `at` */
  positionSec: number;
  /** https cover picture, if any */
  cover?: string;
  /** YouTube video id: gives the "Listen on YouTube Music" button */
  videoId?: string;
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

export function encodeFrame(op: number, data: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(data), "utf8");
  const frame = Buffer.alloc(8 + json.length);
  frame.writeInt32LE(op, 0);
  frame.writeInt32LE(json.length, 4);
  json.copy(frame, 8);
  return frame;
}

/** Splits received bytes into whole frames; the unfinished tail comes back as `rest`. Throws on a nonsense length. */
export function decodeFrames(buffer: Buffer): { frames: { op: number; data: any }[]; rest: Buffer } {
  const frames: { op: number; data: any }[] = [];
  let offset = 0;
  while (buffer.length - offset >= 8) {
    const op = buffer.readInt32LE(offset);
    const length = buffer.readInt32LE(offset + 4);
    if (length < 0 || length > 1 << 20) throw new Error("Discord sent a malformed frame");
    if (buffer.length - offset - 8 < length) break;
    let data: any = null;
    try {
      data = JSON.parse(buffer.subarray(offset + 8, offset + 8 + length).toString("utf8"));
    } catch {
      data = null;
    }
    frames.push({ op, data });
    offset += 8 + length;
  }
  return { frames, rest: buffer.subarray(offset) };
}

/** Every place Discord may be listening, most likely first. */
export function ipcPaths(platform: string = process.platform, env: Record<string, string | undefined> = process.env): string[] {
  const out: string[] = [];
  if (platform === "win32") {
    for (let i = 0; i < 10; i++) out.push(`\\\\?\\pipe\\discord-ipc-${i}`);
    return out;
  }
  const bases = [env.XDG_RUNTIME_DIR, env.TMPDIR, env.TMP, env.TEMP, "/tmp"].filter((b): b is string => !!b);
  const dirs = new Set<string>();
  for (const base of bases) {
    const trimmed = base.replace(/\/+$/, "");
    dirs.add(trimmed);
    dirs.add(`${trimmed}/app/com.discordapp.Discord`); // Flatpak
    dirs.add(`${trimmed}/snap.discord`); // Snap
  }
  for (const dir of dirs) for (let i = 0; i < 10; i++) out.push(`${dir}/discord-ipc-${i}`);
  return out;
}

/** A Discord application id is a snowflake: 17–20 digits (older ones are a little shorter). */
export function normalizeAppId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return /^\d{15,22}$/.test(id) ? id : null;
}

const clip = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
/** Discord refuses a text field shorter than two characters. */
const field = (s: string): string => {
  const t = clip(s.trim(), 128);
  return t.length >= 2 ? t : t + "​".repeat(2 - t.length);
};

/** The activity Discord shows: "Listening to <your application's name>", the song, the artist, the cover, the bar. */
export function buildActivity(song: PresenceInput, now: number): Record<string, unknown> {
  const start = Math.round(now - Math.max(0, song.positionSec) * 1000);
  const activity: Record<string, unknown> = {
    type: 2, // Listening
    details: field(song.title || "Unknown song"),
    state: field(song.artist || "Unknown artist"),
    timestamps: song.durationSec > 0 ? { start, end: Math.round(start + song.durationSec * 1000) } : { start },
    instance: false,
  };
  const cover = song.cover && /^https:\/\//i.test(song.cover) && song.cover.length <= 256 ? song.cover : undefined;
  if (cover) activity.assets = { large_image: cover, large_text: clip((song.album || song.title || "").trim() || "Blutheist", 128) };
  if (song.videoId && /^[A-Za-z0-9_-]{11}$/.test(song.videoId)) {
    activity.buttons = [{ label: "Listen on YouTube Music", url: `https://music.youtube.com/watch?v=${song.videoId}` }];
  }
  return activity;
}

/* ------------------------------------------------------------------ */
/* The connection                                                      */
/* ------------------------------------------------------------------ */

export interface DiscordOptions {
  /** Candidate pipe / socket paths (injectable for tests). */
  paths?: () => string[];
  connect?: (path: string) => net.Socket;
  now?: () => number;
  /** called whenever the status changes */
  onStatus?: (status: DiscordStatus) => void;
}

const RECONNECT_MIN_MS = 5_000;
const RECONNECT_MAX_MS = 30_000;
/** Discord allows a handful of activity updates per 20 s: never send faster than this. */
const SEND_GAP_MS = 2_500;
/** A restarted song's timeline that differs by less than this is the same timeline. */
const SAME_START_MS = 2_000;

export class DiscordPresence {
  private enabled = false;
  private appId: string | null = null;
  private socket: net.Socket | null = null;
  private generation = 0;
  private ready = false;
  private buffer: Buffer = Buffer.alloc(0);
  private user: string | undefined;
  private status: DiscordStatus = { state: "off" };

  private song: PresenceInput | null = null;
  private songAt = 0;
  private sentKey = "";
  private sentStart = 0;
  private lastSend = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private retryDelay = RECONNECT_MIN_MS;
  private nonce = 0;

  private readonly paths: () => string[];
  private readonly open: (path: string) => net.Socket;
  private readonly clock: () => number;
  private readonly onStatus: (s: DiscordStatus) => void;

  constructor(options: DiscordOptions = {}) {
    this.paths = options.paths ?? (() => ipcPaths());
    this.open = options.connect ?? ((p) => net.createConnection(p));
    this.clock = options.now ?? Date.now;
    this.onStatus = options.onStatus ?? (() => undefined);
  }

  getStatus(): DiscordStatus {
    return this.status;
  }

  /** Turn it on or off, or change the application id. Safe to call with the same values again. */
  configure(config: { enabled: boolean; appId: unknown }): DiscordStatus {
    const id = normalizeAppId(config.appId);
    const enabled = config.enabled === true;
    if (enabled && !id) {
      this.enabled = false;
      this.appId = null;
      this.teardown(false);
      return this.setStatus({ state: "invalid", message: "Enter your Discord application id (a number about 18 digits long)." });
    }
    if (!enabled && this.status.state !== "off") {
      this.enabled = false;
      this.appId = id;
      this.teardown(true);
      return this.setStatus({ state: "off" });
    }
    if (enabled === this.enabled && id === this.appId) return this.status;
    const hadSocket = this.socket !== null;
    this.enabled = enabled;
    this.appId = id;
    if (hadSocket || !enabled) this.teardown(true);
    if (!enabled) return this.setStatus({ state: "off" });
    this.retryDelay = RECONNECT_MIN_MS;
    this.setStatus({ state: "connecting" });
    this.connect();
    return this.status;
  }

  /** The song now playing, or null for nothing (paused, stopped, nothing queued). */
  setSong(song: PresenceInput | null): void {
    this.song = song;
    this.songAt = this.clock();
    this.scheduleFlush();
  }

  /** Clears the status and closes the connection (the app is quitting). */
  shutdown(): void {
    this.enabled = false;
    this.song = null;
    this.teardown(true);
  }

  /* ---------------- sending ---------------- */

  private scheduleFlush(): void {
    if (!this.ready || this.flushTimer) return;
    const wait = Math.max(0, this.lastSend + SEND_GAP_MS - this.clock());
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, wait);
    this.flushTimer.unref?.();
  }

  private flush(): void {
    if (!this.ready || !this.socket) return;
    const song = this.song;
    const now = this.clock();
    if (!song) {
      if (this.sentKey === "") return;
      this.sentKey = "";
      this.send(null);
      return;
    }
    // Where the song is now: the position it was reported at, plus the time since.
    const live: PresenceInput = { ...song, positionSec: song.positionSec + Math.max(0, now - this.songAt) / 1000 };
    const activity = buildActivity(live, now);
    const start = (activity.timestamps as { start: number }).start;
    const key = JSON.stringify({ ...activity, timestamps: undefined });
    if (key === this.sentKey && Math.abs(start - this.sentStart) < SAME_START_MS) return;
    this.sentKey = key;
    this.sentStart = start;
    this.send(activity);
  }

  private send(activity: Record<string, unknown> | null): void {
    if (!this.socket || !this.ready) return;
    this.lastSend = this.clock();
    try {
      this.socket.write(
        encodeFrame(OP.FRAME, { cmd: "SET_ACTIVITY", args: { pid: process.pid, activity: activity ?? undefined }, nonce: String(++this.nonce) })
      );
    } catch {
      /* the socket is closing: its close handler reconnects */
    }
  }

  /* ---------------- connecting ---------------- */

  private connect(): void {
    if (!this.enabled || !this.appId || this.socket) return;
    const generation = ++this.generation;
    const candidates = this.paths();
    let index = 0;
    const next = (): void => {
      if (generation !== this.generation) return;
      if (index >= candidates.length) {
        this.setStatus({ state: "unavailable", message: "Discord isn't running. Open the Discord app; Blutheist connects by itself." });
        this.scheduleRetry();
        return;
      }
      const path = candidates[index++];
      let socket: net.Socket;
      try {
        socket = this.open(path);
      } catch {
        next();
        return;
      }
      let connected = false;
      socket.on("connect", () => {
        if (generation !== this.generation) {
          socket.destroy();
          return;
        }
        connected = true;
        this.socket = socket;
        this.buffer = Buffer.alloc(0);
        this.setStatus({ state: "connecting", message: "Talking to Discord…" });
        socket.write(encodeFrame(OP.HANDSHAKE, { v: 1, client_id: this.appId }));
      });
      socket.on("data", (chunk: Buffer) => {
        if (generation !== this.generation) return;
        this.onData(socket, chunk);
      });
      socket.on("error", () => {
        if (!connected) next(); // nothing here: try the next path
      });
      socket.on("close", () => {
        if (!connected || generation !== this.generation) return;
        this.socket = null;
        this.ready = false;
        this.sentKey = "";
        if (this.enabled && this.status.state !== "invalid") {
          this.setStatus({ state: "connecting", message: "Discord closed the connection; trying again." });
          this.scheduleRetry();
        }
      });
    };
    next();
  }

  private onData(socket: net.Socket, chunk: Buffer): void {
    let decoded: ReturnType<typeof decodeFrames>;
    try {
      decoded = decodeFrames(Buffer.concat([this.buffer, chunk]));
    } catch {
      socket.destroy();
      return;
    }
    this.buffer = decoded.rest;
    for (const { op, data } of decoded.frames) {
      if (op === OP.PING) {
        socket.write(encodeFrame(OP.PONG, data ?? {}));
      } else if (op === OP.CLOSE) {
        const code = Number(data?.code);
        // 4000: the application id isn't one Discord knows. Retrying cannot fix that.
        if (code === 4000) {
          this.enabled = true;
          this.setStatus({ state: "invalid", message: "Discord doesn't know that application id. Check it in the Developer Portal." });
        }
        socket.destroy();
      } else if (op === OP.FRAME) {
        if (data?.evt === "READY") {
          this.ready = true;
          this.retryDelay = RECONNECT_MIN_MS;
          this.user = typeof data?.data?.user?.username === "string" ? data.data.user.username : undefined;
          this.setStatus({ state: "connected", user: this.user });
          this.sentKey = "";
          this.scheduleFlush();
        } else if (data?.evt === "ERROR") {
          const message = typeof data?.data?.message === "string" ? data.data.message : "Discord refused the request.";
          this.setStatus({ state: "unavailable", message });
        }
      }
    }
  }

  private scheduleRetry(): void {
    if (!this.enabled || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.socket = null;
      this.connect();
    }, this.retryDelay);
    this.retryTimer.unref?.();
    this.retryDelay = Math.min(RECONNECT_MAX_MS, this.retryDelay * 2);
  }

  /** Drops the connection. `clear` first asks Discord to remove the status. */
  private teardown(clear: boolean): void {
    this.generation++;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.flushTimer = this.retryTimer = null;
    const socket = this.socket;
    if (socket && clear && this.ready) {
      try {
        socket.write(encodeFrame(OP.FRAME, { cmd: "SET_ACTIVITY", args: { pid: process.pid }, nonce: String(++this.nonce) }));
      } catch {
        /* closing anyway */
      }
    }
    this.socket = null;
    this.ready = false;
    this.sentKey = "";
    if (socket) {
      try {
        // end() lets the clearing frame leave before the pipe closes.
        socket.end();
        setTimeout(() => socket.destroy(), 250).unref?.();
      } catch {
        socket.destroy();
      }
    }
  }

  private setStatus(status: DiscordStatus): DiscordStatus {
    this.status = status;
    try {
      this.onStatus(status);
    } catch {
      /* a listener must never break the connection */
    }
    return status;
  }
}
