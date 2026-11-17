/*
 * Ends Blutheist's launch intro (index.html's #intro, played by public/intro.js, drawn by src/intro.css).
 * The intro always plays in full: the eye logo draws and opens, the wordmark rises, the sparkle flares.
 * Only then, and once the app is ready (App sends "bytune-startup-ready"), is the app drawn under the intro's
 * dark ground, unseen, and the logo and wordmark fly onto the app's own (the top bar's, or onboarding's)
 * before the intro fades out. With nowhere to land, or with reduced motion, the intro just fades out.
 * Every wait here has a time limit so the app always appears.
 */

const GLIDE: KeyframeAnimationOptions = { duration: 700, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" };
// The app is drawn under the intro before the glide (warmUp), but the intro is never held longer for it.
const WARM_MS = 1500;
// The whole show takes about 7s; this only guards a window that never runs animations (hidden).
const SHOW_CAP_MS = 15000;

declare global {
  interface Window {
    /** public/intro.js: the show's state. `done` resolves when it has played out in full; finish() rests the sparkle. */
    bytuneIntro?: { done: Promise<void>; finished: boolean; reduced: boolean; finish?: () => void };
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Point = { x: number; y: number };
const centre = (r: DOMRect): Point => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** A transform (origin: the box's top-left) that scales `box` by k and carries its point `from` onto `to`. */
export const flight = (box: { left: number; top: number }, from: Point, to: Point, k: number): string =>
  `translate(${to.x - box.left - k * (from.x - box.left)}px, ${to.y - box.top - k * (from.y - box.top)}px) scale(${k})`;

/** Call before the app renders: its ready signal comes once. */
export function endIntro(): void {
  const intro = document.getElementById("intro");
  if (!intro) return;
  // The miniplayer's window: public/intro.js left the intro off there.
  if (!document.documentElement.classList.contains("intro")) {
    intro.remove();
    return;
  }
  // Resolves with the app's own Reduce animation; never held on the intro, ready or not.
  const ready = Promise.race([
    new Promise<boolean>((r) =>
      window.addEventListener("bytune-startup-ready", (e) => r(!!(e as CustomEvent<{ reduceMotion?: boolean }>).detail?.reduceMotion), {
        once: true,
      }),
    ),
    wait(6000).then(() => false),
  ]);
  void play(intro, ready);
}

async function play(intro: HTMLElement, ready: Promise<boolean>): Promise<void> {
  const html = document.documentElement;
  const show = window.bytuneIntro;
  const played = Promise.race([show?.done ?? Promise.resolve(), wait(SHOW_CAP_MS)]);
  const reduce = (await ready) || matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    // With Reduce animation on, the app shows as soon as it's ready.
    show?.finish?.();
  } else {
    // The whole animation first; only then the app.
    await played;
    show?.finish?.();
    await wait(280); // the sparkle eases to rest
    window.bytune?.introDone?.();
    await warmUp(intro);
  }
  html.classList.remove("intro-wait", "intro-glass");
  await Promise.race([handOver(intro, reduce).catch(() => undefined), wait(1500)]);
  document.querySelector<HTMLElement>("[data-intro-target]")?.style.removeProperty("visibility");
  intro.remove();
  html.classList.remove("intro", "intro-lit", "intro-warm");
  if (reduce) window.bytune?.introDone?.();
}

async function handOver(intro: HTMLElement, reduce: boolean): Promise<void> {
  const target = document.querySelector<HTMLElement>("[data-intro-target]");
  const toMark = target?.querySelector<HTMLElement>("[data-intro-mark]");
  const toWord = target?.querySelector<HTMLElement>("[data-intro-word]");
  const mark = intro.querySelector<SVGSVGElement>("#intro-logo");
  const word = intro.querySelector<HTMLElement>("#intro-wm");
  if (reduce || !target?.checkVisibility() || !toMark || !toWord || !mark || !word) {
    await intro.animate({ opacity: [1, 0] }, 160).finished;
    return;
  }
  const m = mark.getBoundingClientRect();
  const to = toMark.getBoundingClientRect();
  const w = word.getBoundingClientRect();
  const tw = toWord.getBoundingClientRect();
  if (!m.height || !w.height || !to.height || !tw.height) {
    await intro.animate({ opacity: [1, 0] }, 160).finished;
    return;
  }

  // Only the flying logo shows until it lands on the app's own. Visibility, as onboarding's fade-in holds its opacity.
  target.style.visibility = "hidden";
  mark.style.transformOrigin = word.style.transformOrigin = "0 0";
  const glide = mark.animate({ transform: ["none", flight(m, centre(m), centre(to), to.height / m.height)] }, GLIDE);
  word.animate({ transform: ["none", flight(w, { x: w.left, y: w.top + w.height / 2 }, { x: tw.left, y: tw.top + tw.height / 2 }, tw.height / w.height)] }, GLIDE);
  // The dark ground fades by opacity on its own layer, so nothing is redrawn while the logo flies.
  const ground = getComputedStyle(intro, "::before").opacity;
  intro.animate({ opacity: [ground, "0"] }, { pseudoElement: "::before", duration: 500, easing: "ease-in-out", fill: "forwards" });
  await glide.finished;
  target.style.removeProperty("visibility");
  await intro.animate({ opacity: [1, 0] }, 150).finished;
}

/**
 * Draws the app before the glide, while nothing moves: the window's glass goes, and the app is shown under the
 * intro's dark ground (99.9% opaque), drawn but unseen, as its pictures on screen are decoded. Once a frame
 * drawn after that has reached the screen the glide begins; it never waits on that picture. Never longer than WARM_MS.
 */
async function warmUp(intro: HTMLElement): Promise<void> {
  const html = document.documentElement;
  const timeUp = wait(WARM_MS);
  html.classList.remove("intro-glass");
  html.classList.add("intro-warm");
  const onScreen = [...document.querySelectorAll<HTMLImageElement>("#root img")].filter((img) => {
    if (!img.complete || !img.naturalWidth) return false;
    const r = img.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
  });
  await Promise.race([Promise.allSettled(onScreen.map((img) => img.decode())), timeUp]);
  await presented(intro, timeUp);
}

/**
 * Resolves once a frame drawn from now has reached the screen, or at `cap`: Element Timing reports a probe drawn
 * in it (a dot under the intro's dark ground) only then. Without Element Timing, at once.
 */
function presented(intro: HTMLElement, cap: Promise<void>): Promise<void> {
  if (typeof PerformanceObserver !== "function" || !PerformanceObserver.supportedEntryTypes?.includes("element")) return Promise.resolve();
  const probe = document.createElement("i");
  probe.className = "intro-probe";
  probe.textContent = ".";
  probe.setAttribute("aria-hidden", "true");
  probe.setAttribute("elementtiming", "intro-probe");
  let observer: PerformanceObserver | undefined;
  const shown = new Promise<void>((resolve) => {
    observer = new PerformanceObserver((list) => {
      if (list.getEntries().some((e) => (e as PerformanceEntry & { identifier?: string }).identifier === "intro-probe")) resolve();
    });
    observer.observe({ type: "element" });
  });
  intro.append(probe);
  return Promise.race([shown, cap]).finally(() => {
    observer?.disconnect();
    probe.remove();
  });
}
