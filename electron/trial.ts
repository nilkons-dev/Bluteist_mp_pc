/**
 * The trial lock (rules in trial-core.ts). At startup the decision is made before any window opens; while the app
 * runs it is made again every half minute, when the computer wakes, and against server time. Once the trial is over
 * the only thing that can appear is the "trial ended" window, which has no preload, no script and no way out
 * except closing it.
 */
import { app, BrowserWindow, powerMonitor } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  decide,
  decodeRecord,
  encodeRecord,
  parseDateHeader,
  TRIAL_END_UTC,
  type Copy,
  type TrialRecord,
  type Verdict,
} from "./trial-core";

let locked = false;
let lockedHook: (() => void) | null = null;
let lockWindow: BrowserWindow | null = null;
let lastNet: number | null = null;
let lastNetAt = 0;

/** Several places, so removing one file (or a "clean-up" tool) doesn't reset anything. */
function files(): string[] {
  const list: string[] = [];
  try {
    list.push(path.join(app.getPath("userData"), "trial.bin"));
  } catch {
    /* not ready */
  }
  try {
    list.push(path.join(app.getPath("appData"), "Blutheist-trial.bin"));
  } catch {
    /* not available */
  }
  try {
    list.push(path.join(os.homedir(), ".blutheist-trial"));
  } catch {
    /* not available */
  }
  return list;
}

function readCopies(): Copy[] {
  return files().map((f): Copy => {
    let text: string;
    try {
      text = fs.readFileSync(f, "utf8");
    } catch {
      return { kind: "absent" };
    }
    const record = decodeRecord(text);
    return record ? { kind: "ok", record } : { kind: "bad" };
  });
}

function save(v: Verdict): void {
  const record: TrialRecord = { v: 1, seen: v.seen, expired: v.locked };
  const text = encodeRecord(record);
  for (const f of files()) {
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      const tmp = `${f}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, text);
      fs.renameSync(tmp, f);
    } catch {
      /* one location may be read-only; the others hold it */
    }
  }
}

/** Server time from a response's Date header. Quick, tries a few hosts, never throws. */
async function networkTime(): Promise<number | null> {
  for (const url of ["https://www.cloudflare.com/", "https://www.google.com/", "https://www.microsoft.com/"]) {
    try {
      const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000), redirect: "manual" });
      const t = parseDateHeader(res.headers.get("date"));
      if (t !== null) return t;
    } catch {
      /* offline or blocked: try the next */
    }
  }
  return null;
}

function evaluate(net: number | null): boolean {
  const v = decide(Date.now(), readCopies(), net);
  save(v);
  if (v.locked) locked = true;
  return locked;
}

/** Whether the trial is over. Cheap and synchronous: safe to ask on every window request or IPC call. */
export function isLocked(): boolean {
  if (locked) return true;
  // The plain clock check needs no disk: a clock past the end is final.
  if (Date.now() >= TRIAL_END_UTC) {
    locked = true;
    return true;
  }
  return false;
}

/** The startup decision (disk + clock). Call once the app is ready, before anything is shown. */
export function bootLocked(): boolean {
  return evaluate(lastNet);
}

/** After startup: re-check on a timer, on wake, and against server time; `onLock` runs once when the trial ends. */
export function watch(onLock: () => void): void {
  lockedHook = onLock;
  const fire = (): void => {
    if (!locked || !lockedHook) return;
    const h = lockedHook;
    lockedHook = null;
    h();
  };
  const tick = async (): Promise<void> => {
    if (locked) return fire();
    // Server time at the start and every 20 minutes; the clock and ratchet are checked every tick.
    if (Date.now() - lastNetAt > 20 * 60 * 1000) {
      lastNetAt = Date.now();
      lastNet = await networkTime();
    }
    evaluate(lastNet);
    fire();
  };
  void tick();
  setInterval(() => void tick(), 30 * 1000).unref();
  powerMonitor.on("resume", () => {
    lastNetAt = 0;
    void tick();
  });
}

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>Blutheist</title>
<style>
  *{box-sizing:border-box;margin:0}
  html,body{height:100%}
  body{background:radial-gradient(120% 90% at 50% 0%,#17171b 0%,#0a0a0a 60%);color:#f2f2f4;font:15px/1.6 "Segoe UI",system-ui,-apple-system,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:28px;-webkit-user-select:none;user-select:none;cursor:default}
  .card{width:100%;max-width:470px;text-align:center;padding:40px 36px 34px;border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.09);box-shadow:0 30px 80px rgba(0,0,0,.55)}
  .ring{width:76px;height:76px;margin:0 auto 22px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)}
  .brand{font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:#8d8d96;margin-bottom:10px}
  h1{font-size:23px;font-weight:650;letter-spacing:-.01em;margin-bottom:14px}
  p{color:#b9b9c1}
  .rule{height:1px;background:rgba(255,255,255,.09);margin:26px 0 20px}
  .label{font-size:13px;letter-spacing:.04em;color:#8d8d96;margin-bottom:12px}
  ul{list-style:none;padding:0;display:flex;flex-direction:column;gap:9px;align-items:stretch}
  li{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);text-align:left;font-weight:600;letter-spacing:.01em}
  li::before{content:"";width:7px;height:7px;border-radius:50%;background:#f2f2f4;flex:none}
  li span{-webkit-user-select:all;user-select:all;cursor:text}
</style></head><body>
<main class="card">
  <div class="ring"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#f2f2f4" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.4"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/><circle cx="12" cy="15.5" r="1.2" fill="#f2f2f4" stroke="none"/></svg></div>
  <div class="brand">Blutheist</div>
  <h1>Your trial has ended</h1>
  <p>Your 30-day free trial has ended. If you would like to get a new free trial, please contact any one of the following Discord users:</p>
  <div class="rule"></div>
  <div class="label">Usernames:</div>
  <ul>
    <li><span>the_theist</span></li>
    <li><span>the_blucefer</span></li>
  </ul>
</main>
</body></html>`;

/** The one window a finished trial gets. Safe to call repeatedly. */
export function showLockedWindow(): void {
  if (lockWindow && !lockWindow.isDestroyed()) {
    if (lockWindow.isMinimized()) lockWindow.restore();
    lockWindow.show();
    lockWindow.focus();
    return;
  }
  const w = new BrowserWindow({
    width: 560,
    height: 640,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: "Blutheist",
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      devTools: false,
      spellcheck: false,
    },
  });
  lockWindow = w;
  w.setMenu(null);
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  w.webContents.on("will-attach-webview", (e) => e.preventDefault());
  w.once("ready-to-show", () => {
    if (!w.isDestroyed()) {
      w.show();
      w.focus();
    }
  });
  w.on("closed", () => {
    lockWindow = null;
    // Nothing is left to use: closing this window ends the app (macOS keeps apps alive without windows).
    app.quit();
  });
  void w.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(PAGE));
}

/** Every other window is destroyed once the locked one is up, so nothing keeps playing or stays on screen. */
export function destroyOtherWindows(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (w !== lockWindow && !w.isDestroyed()) w.destroy();
  }
}
