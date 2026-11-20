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

export function setBackground(next: boolean): void {
  if (next === bg) return;
  bg = next;
  document.documentElement.classList.toggle("is-bg", next);
  if (!next) for (const [, cb] of held.splice(0)) nativeRaf(cb);
}

declare global {
  interface Window {
    __bluSetBg?: (hidden: boolean) => void;
  }
}
window.__bluSetBg = setBackground;
// A browser tab, or any shell that does report it: the page's own word counts too.
document.addEventListener("visibilitychange", () => setBackground(document.hidden));
