/**
 * The Blutheist logo, alive: the pupil follows the pointer, the eye blinks now and then and glances about
 * when left alone, and a click closes it, opens it and turns the pupil red for a few seconds.
 * A faithful port of the brand's eye-logo-tracking page. The loop only runs while something moves,
 * so an idle logo costs nothing.
 */
import { useEffect, useId, useRef, type SVGProps } from "react";
import { useSettings } from "../stores/settings";
import { EYE_ALMOND, EYE_BODY, EYE_CX, EYE_CY, EYE_PUPIL, EYE_VIEWBOX } from "./eyeBrand";

const ease = {
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  io: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

export function EyeLogo({ interactive = true, ...svgProps }: { interactive?: boolean } & SVGProps<SVGSVGElement>) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const eyeRef = useRef<SVGGElement>(null);
  const pupilGRef = useRef<SVGGElement>(null);
  const pupilRef = useRef<SVGPathElement>(null);
  const hitRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const eye = eyeRef.current;
    const pupilG = pupilGRef.current;
    const pupil = pupilRef.current;
    const hit = hitRef.current;
    if (!svg || !eye || !pupilG || !pupil || !hit) return;

    let dead = false;
    let lid = 1;
    let px = 0, py = 0, tx = 0, ty = 0;
    let red = 0;
    let busy = false;
    let lastMove = performance.now();
    let redToken = 0;
    let raf = 0;
    const timers = new Set<number>();
    const reduce = () => useSettings.getState().reduceAnimation;

    const wait = (ms: number) =>
      new Promise<void>((r) => {
        const id = window.setTimeout(() => {
          timers.delete(id);
          r();
        }, ms);
        timers.add(id);
      });
    function tween(a: number, b: number, ms: number, fn: (v: number) => void, e = ease.io): Promise<void> {
      return new Promise((resolve) => {
        const s = performance.now();
        const f = (n: number) => {
          if (dead) return resolve();
          const t = Math.min(1, Math.max(0, (n - s) / ms));
          fn(a + (b - a) * e(t));
          if (t < 1) requestAnimationFrame(f);
          else resolve();
        };
        requestAnimationFrame(f);
      });
    }

    const setLid = (v: number) => {
      lid = v;
      eye.setAttribute("transform", `translate(0 ${EYE_CY}) scale(1 ${Math.max(v, 0.025)}) translate(0 -${EYE_CY})`);
    };
    const draw = (n: number) => {
      pupilG.setAttribute("transform", `translate(${px} ${py})`);
      const pulse = red * (0.85 + 0.15 * Math.sin(n / 260));
      pupil.style.fill = `rgb(${Math.round(255 * red)},${Math.round(20 * red)},${Math.round(20 * red)})`;
      pupil.style.filter = red > 0.01 ? `drop-shadow(0 0 ${26 * pulse}px rgba(255,30,30,${pulse}))` : "none";
    };
    const frame = (n: number) => {
      raf = 0;
      if (dead) return;
      px += (tx - px) * 0.14;
      py += (ty - py) * 0.14;
      draw(n);
      // keep going while the pupil is still travelling, or the red glow is on (it pulses)
      if (Math.abs(tx - px) > 0.02 || Math.abs(ty - py) > 0.02 || red > 0.01) raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (!raf && !dead) raf = requestAnimationFrame(frame);
    };

    const look = (cx: number, cy: number) => {
      const r = svg.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const sx = ((cx - r.left) / r.width) * 1254 - EYE_CX;
      const sy = 80 + ((cy - r.top) / r.height) * 1040 - EYE_CY;
      const d = Math.hypot(sx, sy) || 1;
      const k = Math.min(1, d / 450);
      tx = (sx / d) * k * 88;
      ty = (sy / d) * k * 34;
      kick();
    };
    const onMove = (e: PointerEvent) => {
      lastMove = performance.now();
      look(e.clientX, e.clientY);
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    async function blink() {
      if (busy || dead) return;
      busy = true;
      await tween(1, 0, 95, setLid, ease.out);
      await tween(0, 1, 150, setLid, ease.out);
      busy = false;
    }
    (async function blinkLoop() {
      while (!dead) {
        await wait(2400 + Math.random() * 3600);
        if (dead || reduce() || document.hidden) continue;
        await blink();
        if (!dead && Math.random() < 0.22) {
          await wait(120);
          await blink();
        }
      }
    })();
    // Left alone for a while, it glances about.
    const idle = window.setInterval(() => {
      if (!reduce() && !document.hidden && performance.now() - lastMove > 3000 && Math.random() < 0.25) {
        tx = (Math.random() * 2 - 1) * 80;
        ty = (Math.random() * 2 - 1) * 28;
        kick();
      }
    }, 400);

    // Click: close, open, then the pupil goes red for a few seconds.
    const onDown = async (e: PointerEvent) => {
      if (busy) return;
      busy = true;
      look(e.clientX, e.clientY);
      const tok = ++redToken;
      await tween(lid, 0, 170, setLid, ease.out);
      await wait(380);
      await tween(0, 1, 260, setLid, ease.out);
      busy = false;
      if (dead) return;
      const fromRed = red;
      await tween(fromRed, 1, 350, (v) => ((red = v), kick()), ease.out);
      await wait(5000);
      if (tok !== redToken || dead) return;
      await tween(1, 0, 1000, (v) => ((red = v), kick()), ease.io);
    };
    if (interactive) hit.addEventListener("pointerdown", onDown);

    setLid(1);
    draw(0);
    return () => {
      dead = true;
      window.removeEventListener("pointermove", onMove);
      window.clearInterval(idle);
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
      if (raf) cancelAnimationFrame(raf);
      hit.removeEventListener("pointerdown", onDown);
    };
  }, [interactive]);

  return (
    <svg ref={svgRef} viewBox={EYE_VIEWBOX} role="img" aria-label="Blutheist" overflow="visible" {...svgProps}>
      <defs>
        <path id={`${uid}a`} d={EYE_ALMOND} />
        <clipPath id={`${uid}c`}>
          <use href={`#${uid}a`} />
        </clipPath>
      </defs>
      <path fill="#fff" d={EYE_BODY} />
      <g ref={eyeRef}>
        <use href={`#${uid}a`} fill="#000" />
        <g clipPath={`url(#${uid}c)`}>
          <g ref={pupilGRef}>
            <circle cx={EYE_CX} cy={EYE_CY} r="155" fill="#fff" />
            <path ref={pupilRef} fill="#000" d={EYE_PUPIL} />
          </g>
        </g>
      </g>
      {/* The whole logo takes the click, not just the eye: at the top bar's size the eye alone is a few pixels. */}
      <path
        ref={hitRef}
        d={EYE_BODY}
        fill="transparent"
        style={{ pointerEvents: interactive ? "all" : "none", cursor: interactive ? "pointer" : undefined }}
      />
    </svg>
  );
}
