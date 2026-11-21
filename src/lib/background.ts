/**
 * Everything that animates sleeps while the window is out of sight (closed to the tray, minimised).
 *
 * The main window runs with backgroundThrottling off, because playback leans on JS timers that must keep their
 * resolution (fades, stats, lyric sync). The price is that Chromium then keeps drawing a hidden window at full rate:
 * every canvas loop, every CSS animation. So the main process tells the page when it is hidden or shown
 * (window.__bluSetBg), and from then on:
 *  - requestAnimationFrame callbacks are held, not run (and every loop in the app is built on it), then released at once
 *    when the window is back, so each loop simply carries on from where it was;
 *  - CSS animations are paused (html.is-bg, see index.css) and carry on the same way.
 * Timers are untouched, so playback, fades and the media keys behave exactly as before.
 *
 * Gaming mode (Settings › Playback): the same sleep also starts when the window has lost focus for a couple of seconds
 * (a game or another app is in front), and ends the moment the window is focused again. While asleep the clock that
 * drives the progress bar slows to once a second (lib/audio.ts), and the main process lowers its own and the GPU
 * process's priority (electron/main.ts, perf:setBackground), so a game keeps the CPU. The song keeps playing.
 */
const HELD_FROM = 1 << 30;

let bg = false;
let nextId = HELD_FROM;
const held: Array<[number, FrameRequestCallback]> = [];
const nativeRaf = window.requestAnimationFrame.bind(window);
const nativeCaf = window.cancelAnimationFrame.bind(window);

window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
  if (!bg) return nativeRaf(cb);
  const id = nextId++;
  held.push([id, cb]);
  return id;
};
window.cancelAnimationFrame = (id: number): void => {
  if (id < HELD_FROM) {
    nativeCaf(id);
    return;
  }
  const at = held.findIndex((h) => h[0] === id);
  if (at >= 0) held.splice(at, 1);
};

let hiddenByMain = false;
let unfocusedSleep = false;

function apply(): void {
  const next = hiddenByMain || unfocusedSleep;
  if (next === bg) return;
  bg = next;
  document.documentElement.classList.toggle("is-bg", next);
  if (!next) for (const [, cb] of held.splice(0)) nativeRaf(cb);
  try {
    window.bytune?.setBackgroundMode?.(next);
  } catch {
    /* no bridge (a plain browser): nothing to tell */
  }
}

/** The window is out of sight (main process / page visibility). */
export function setBackground(next: boolean): void {
  hiddenByMain = next;
  apply();
}

/** Gaming mode on or off. Safe to call again with the same value. */
const FOCUS_SLEEP_DELAY_MS = 2000;
let focusSleepOn = false;
let focusTimer: number | null = null;
const onBlur = (): void => {
  if (focusTimer !== null) window.clearTimeout(focusTimer);
  focusTimer = window.setTimeout(() => {
    focusTimer = null;
    unfocusedSleep = !document.hasFocus();
    apply();
  }, FOCUS_SLEEP_DELAY_MS);
};
const onFocus = (): void => {
  if (focusTimer !== null) window.clearTimeout(focusTimer);
  focusTimer = null;
  unfocusedSleep = false;
  apply();
};
export function setSleepWhenUnfocused(on: boolean): void {
  if (on === focusSleepOn) return;
  focusSleepOn = on;
  if (on) {
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    if (!document.hasFocus()) onBlur();
  } else {
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
    onFocus();
  }
}

/** True while the page is asleep (hidden, or unfocused in gaming mode). */
export const isBackground = (): boolean => bg;

declare global {
  interface Window {
    __bluSetBg?: (hidden: boolean) => void;
  }
}
window.__bluSetBg = setBackground;
// A browser tab, or any shell that does report it: the page's own word counts too.
document.addEventListener("visibilitychange", () => setBackground(document.hidden));
