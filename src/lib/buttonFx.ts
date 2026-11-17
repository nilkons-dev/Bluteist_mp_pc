/**
 * A light, shared motion for every plain button in the app: a springy squash on press and, on icon-only buttons, a small
 * turn of the glyph. One delegated listener, so no button needs touching. It animates the independent `scale` and
 * `rotate` properties, which compose with any transform a button already has (centering, translations) instead of
 * replacing it. Buttons that carry their own eye-style motion (the transport, the player extras, the library rows, the
 * turntable) are left alone, and so is everything when the system asks for reduced motion.
 */
const OWN = ".et, .ex, .tt, .lb, .intro, [data-fx='off']";

let installed = false;

export function installButtonFx(): () => void {
  if (installed || typeof document === "undefined") return () => undefined;
  installed = true;
  const reduce = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

  const onClick = (e: MouseEvent): void => {
    if (reduce?.matches) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    const btn = t.closest("button");
    if (!btn || btn.disabled || btn.closest(OWN) || typeof btn.animate !== "function") return;
    btn.animate(
      [{ scale: "1" }, { scale: "0.86", offset: 0.3 }, { scale: "1.08", offset: 0.65 }, { scale: "1" }],
      { duration: 380, easing: "cubic-bezier(.3,.8,.3,1)" },
    );
    const svg = btn.querySelector(":scope > svg, :scope > span > svg");
    const iconOnly = !!svg && !(btn.textContent ?? "").trim();
    if (iconOnly && svg && typeof svg.animate === "function") {
      svg.animate(
        [{ rotate: "0deg" }, { rotate: "-14deg", offset: 0.35 }, { rotate: "9deg", offset: 0.7 }, { rotate: "0deg" }],
        { duration: 520, easing: "cubic-bezier(.3,.8,.3,1)" },
      );
    }
  };
  document.addEventListener("click", onClick, true);
  return () => {
    document.removeEventListener("click", onClick, true);
    installed = false;
  };
}
