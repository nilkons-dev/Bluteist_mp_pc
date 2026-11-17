/** Click animations of Your Library's icons (the brand page's own motion). `b` is the icon button / host element. */
import { A, twinkle } from "./eyeFx";
import type { LibIconKind } from "./LibraryIcons";

const q = (b: Element, s: string): HTMLElement | null => b.querySelector<HTMLElement>(s);
const qa = (b: Element, s: string): HTMLElement[] => Array.from(b.querySelectorAll<HTMLElement>(s));
const bump = (el: Element | null, to = 1.1, d = 560): void => {
  if (el) A(el, [{ transform: "scale(1)" }, { transform: `scale(${to})`, offset: 0.3 }, { transform: "scale(1)" }], { duration: d });
};

export const libFx: Record<LibIconKind, (b: Element) => void> = {
  liked: (b) => {
    const h = q(b, ".lb-hr");
    if (h) A(h, [{ transform: "scale(1)" }, { transform: "scale(1.3)", offset: 0.25 }, { transform: "scale(.92)", offset: 0.5 }, { transform: "scale(1.14)", offset: 0.72 }, { transform: "scale(1)" }], { duration: 720 });
    qa(b, ".lb-sp").forEach((s, i) => twinkle(s, 120 + i * 110));
  },
  spotify: (b) => {
    bump(q(b, ".lb-ci"));
    qa(b, ".lb-sa").forEach((a, i) => A(a, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 420, delay: 100 + i * 130, easing: "ease-out" }));
  },
  replay: (b) => {
    qa(b, ".lb-rb").forEach((r, i) => {
      r.style.transformOrigin = "50% 100%";
      A(r, [{ transform: "scaleY(0)" }, { transform: "scaleY(1.18)", offset: 0.7 }, { transform: "scaleY(1)" }], { duration: 620, delay: i * 110, easing: "cubic-bezier(.3,.9,.4,1)" });
    });
    twinkle(q(b, ".lb-sp"), 380);
  },
  downloads: (b) => {
    const a = q(b, ".lb-da"), t = q(b, ".lb-tr");
    if (a) A(a, [{ transform: "translateY(-12px)", opacity: 0 }, { transform: "translateY(4px)", opacity: 1, offset: 0.55 }, { transform: "translateY(0)", opacity: 1 }], { duration: 620, easing: "cubic-bezier(.3,.9,.4,1)" });
    if (t) A(t, [{ transform: "scaleX(1)" }, { transform: "scaleX(1.18)", offset: 0.6 }, { transform: "scaleX(1)" }], { duration: 620 });
  },
  playlist: (b) => {
    qa(b, ".lb-pb").forEach((r, i) => {
      r.style.transformOrigin = "0% 50%";
      A(r, [{ transform: "scaleX(0)" }, { transform: "scaleX(1.08)", offset: 0.7 }, { transform: "scaleX(1)" }], { duration: 520, delay: i * 100, easing: "cubic-bezier(.3,.9,.4,1)" });
    });
    const t = q(b, ".lb-pt");
    if (t) A(t, [{ transform: "scale(0)" }, { transform: "scale(1.25)", offset: 0.65 }, { transform: "scale(1)" }], { duration: 520, delay: 260 });
  },
  overview: (b) => {
    const h = q(b, ".lb-ho");
    if (!h) return;
    h.style.transformOrigin = "50% 100%";
    A(h, [{ transform: "translateY(0) scale(1,1)" }, { transform: "translateY(1px) scale(1.06,.92)", offset: 0.2 }, { transform: "translateY(-6px) scale(.97,1.08)", offset: 0.5 }, { transform: "translateY(0) scale(1.03,.97)", offset: 0.78 }, { transform: "translateY(0) scale(1,1)" }], { duration: 640, easing: "cubic-bezier(.3,.8,.4,1)" });
  },
  about: (b) => {
    bump(q(b, ".lb-ci"));
    const d = q(b, ".lb-ad"), s = q(b, ".lb-as");
    if (d) A(d, [{ transform: "translateY(-10px)", opacity: 0 }, { transform: "translateY(2px)", opacity: 1, offset: 0.6 }, { transform: "translateY(0)", opacity: 1 }], { duration: 560, easing: "cubic-bezier(.3,.9,.4,1)" });
    if (s) {
      s.style.transformOrigin = "50% 0%";
      A(s, [{ transform: "scaleY(0)" }, { transform: "scaleY(1.12)", offset: 0.7 }, { transform: "scaleY(1)" }], { duration: 560, delay: 120, easing: "cubic-bezier(.3,.9,.4,1)" });
    }
  },
  settings: (b) => {
    const g = q(b, ".lb-gr");
    if (g) A(g, [{ transform: "rotate(0) scale(1)" }, { transform: "rotate(100deg) scale(1.1)", offset: 0.6 }, { transform: "rotate(90deg) scale(1)" }], { duration: 700, easing: "cubic-bezier(.4,0,.2,1)" });
  },
  local: (b) => {
    const f = q(b, ".lb-fo"), n = q(b, ".lb-nt");
    if (f) A(f, [{ transform: "scale(1)" }, { transform: "scale(1.1,.94)", offset: 0.3 }, { transform: "scale(1)" }], { duration: 520 });
    if (n) A(n, [{ transform: "translateY(0) rotate(0)" }, { transform: "translateY(-3px) rotate(-10deg)", offset: 0.45 }, { transform: "translateY(0) rotate(0)" }], { duration: 620, easing: "ease-in-out" });
  },
  folder: (b) => libFx.local(b),
};

/** The pin tilts when toggled. */
export const pinFx = (b: Element): void => {
  const g = q(b, ".lb-pg");
  if (g) A(g, [{ transform: "rotate(0) scale(1)" }, { transform: "rotate(-28deg) scale(1.2)", offset: 0.35 }, { transform: "rotate(10deg) scale(.95)", offset: 0.7 }, { transform: "rotate(0) scale(1)" }], { duration: 560 });
};
/** The header's "+": a half turn with a swell. */
export const plusFx = (b: Element): void => {
  const g = q(b, ".lb-pl");
  if (g) A(g, [{ transform: "rotate(0) scale(1)" }, { transform: "rotate(90deg) scale(1.2)", offset: 0.5 }, { transform: "rotate(180deg) scale(1)" }], { duration: 520, easing: "cubic-bezier(.4,0,.2,1)" });
};
/** The header book: the last volume leans over. */
export const bookFx = (b: Element): void => {
  const g = q(b, ".lb-lean");
  if (g) A(g, [{ transform: "rotate(0)" }, { transform: "rotate(-22deg)", offset: 0.4 }, { transform: "rotate(6deg)", offset: 0.75 }, { transform: "rotate(0)" }], { duration: 640 });
};
/** A row flashes on click. */
export const flashRow = (el: Element): void => {
  A(el, [{ backgroundColor: "rgba(255,255,255,.12)" }, { backgroundColor: "rgba(255,255,255,0)" }], { duration: 900, easing: "ease-out" });
};
