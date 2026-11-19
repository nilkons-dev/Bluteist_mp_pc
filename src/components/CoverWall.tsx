/**
 * The onboarding's showpiece: a wall of covers, set on a tilted plane in perspective, its rows drifting slowly against
 * each other (songs most people know on sight; the same covers as before, lib/coverDrum). The cover in the middle of the
 * wall lights the page with its own colours (a blurred copy of it behind the wall, the way a collection page is lit);
 * resting the pointer on another lifts it (smoothly) and lights that one instead, and the row under the pointer slows to
 * a stop so a cover holds still while you look at it. Take hold of a cover and pull, and its row follows the pointer and
 * keeps going the way you flung it before it settles back to its own pace. The wall itself never moves or tilts.
 * With reduced motion the rows hold still (they can still be pulled).
 */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { DRUM, type DrumCover } from "../lib/coverDrum";

/** Rows, top to bottom: each ring of covers once, then two of them again, turned round, so the wall is tall enough. */
const ROWS: ReadonlyArray<{ cover: ReadonlyArray<DrumCover>; dir: 1 | -1; secs: number }> = [
  { cover: DRUM[0], dir: -1, secs: 190 },
  { cover: DRUM[1], dir: 1, secs: 230 },
  { cover: DRUM[2], dir: -1, secs: 205 },
  { cover: DRUM[3], dir: 1, secs: 245 },
  { cover: DRUM[4], dir: -1, secs: 215 },
  { cover: [...DRUM[0]].reverse(), dir: 1, secs: 235 },
  { cover: [...DRUM[2]].reverse(), dir: -1, secs: 225 },
  { cover: [...DRUM[1]].reverse(), dir: 1, secs: 250 },
  { cover: [...DRUM[4]].reverse(), dir: -1, secs: 210 },
  { cover: [...DRUM[3]].reverse(), dir: 1, secs: 240 },
  { cover: [...DRUM[0]], dir: -1, secs: 200 },
  { cover: [...DRUM[2]], dir: 1, secs: 228 },
];
/** The row whose cover lights the page when nothing is hovered. */
const MID = 5;
/** Pixels a row travels along its own line for a pixel of pointer travel (the wall is turned a little). */
const PULL = 1.1;
const FLING_MAX = 3200;
const bg = (src: string): CSSProperties => ({ backgroundImage: `url(${JSON.stringify(src)})` });

export function CoverWall({ turn, busy }: { turn: number; busy: boolean }) {
  const mid = DRUM[MID % DRUM.length];
  const [lit, setLit] = useState<DrumCover>(mid[0]);
  const [hover, setHover] = useState<DrumCover | null>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const leaving = useRef(0);
  const shown = hover ?? lit;

  // Left on its own, the light moves on through the middle row, a cover at a time.
  const idx = useRef(0);
  useEffect(() => {
    if (hover) return;
    const id = window.setInterval(() => {
      idx.current = (idx.current + 1) % mid.length;
      setLit(mid[idx.current]);
    }, 5200);
    return () => window.clearInterval(id);
  }, [hover, mid]);
  // Each step of the flow (and a stepped-back one) moves the light on at once.
  const lastTurn = useRef(turn);
  useEffect(() => {
    if (turn === lastTurn.current) return;
    lastTurn.current = turn;
    idx.current = (idx.current + 3) % mid.length;
    setLit(mid[idx.current]);
  }, [turn, mid]);

  /* ---- the rows: each drifts at its own pace; one can be pulled ---- */
  const rowEls = useRef<Array<HTMLDivElement | null>>([]);
  const sim = useRef(
    ROWS.map((r, i) => ({ off: -((i * 0.137 + 0.08) % 1), vel: 0, w: 0, base: 0, over: false })),
  );
  const drag = useRef<{ row: number; id: number; x: number; t: number; v: number } | null>(null);

  useEffect(() => {
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, last = performance.now(), frame = 0;
    const tick = (now: number): void => {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const measure = frame++ % 30 === 0;
      sim.current.forEach((r, i) => {
        const el = rowEls.current[i];
        if (!el) return;
        if (measure || r.w === 0) {
          const w = el.offsetWidth / 3;
          if (w > 0) {
            // A fraction until the width is known, then pixels.
            if (r.w === 0) r.off = r.off * w;
            else r.off = (r.off / r.w) * w;
            r.w = w;
          }
        }
        if (r.w === 0) return;
        r.base = reduce ? 0 : (ROWS[i].dir * r.w) / ROWS[i].secs;
        if (drag.current?.row !== i) {
          // Held still while the pointer rests on it, unless it is still running from a fling.
          const flinging = Math.abs(r.vel) > Math.abs(r.base) * 2 + 40;
          const target = r.over && !flinging ? 0 : r.base;
          r.vel += (target - r.vel) * (1 - Math.exp(-dt * (flinging ? 1.6 : 4)));
          r.off += r.vel * dt;
        }
        while (r.off <= -r.w) r.off += r.w;
        while (r.off > 0) r.off -= r.w;
        el.style.transform = `translate3d(${r.off.toFixed(2)}px,0,0)`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const down = (i: number) => (e: ReactPointerEvent<HTMLElement>): void => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const row = e.currentTarget;
    try {
      row.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer that is already gone */
    }
    drag.current = { row: i, id: e.pointerId, x: e.clientX, t: performance.now(), v: 0 };
    row.classList.add("is-drag");
  };
  const move = (i: number) => (e: ReactPointerEvent<HTMLElement>): void => {
    const d = drag.current;
    if (!d || d.row !== i || d.id !== e.pointerId) return;
    const now = performance.now();
    const dx = (e.clientX - d.x) * PULL;
    const dt = Math.max(0.001, (now - d.t) / 1000);
    const r = sim.current[i];
    r.off += dx;
    // The speed it will keep when let go: the pointer's own, smoothed.
    d.v = d.v * 0.6 + (dx / dt) * 0.4;
    r.vel = Math.max(-FLING_MAX, Math.min(FLING_MAX, d.v));
    d.x = e.clientX;
    d.t = now;
  };
  const up = (i: number) => (e: ReactPointerEvent<HTMLElement>): void => {
    const d = drag.current;
    if (!d || d.row !== i || d.id !== e.pointerId) return;
    // A pointer held still before letting go does not fling.
    if (performance.now() - d.t > 90) sim.current[i].vel = 0;
    drag.current = null;
    e.currentTarget.classList.remove("is-drag");
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const enter = (c: DrumCover): void => {
    window.clearTimeout(leaving.current);
    setHover(c);
  };
  const leave = (): void => {
    window.clearTimeout(leaving.current);
    leaving.current = window.setTimeout(() => setHover(null), 140);
  };
  useEffect(() => () => window.clearTimeout(leaving.current), []);

  // A soft glare follows the pointer across the cover it rests on.
  const glare = (e: ReactPointerEvent<HTMLElement>): void => {
    const t = e.currentTarget, r = t.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    t.style.setProperty("--gx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
    t.style.setProperty("--gy", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
  };

  // The glow crossfades between two layers, so a new cover never cuts in.
  const [glow, setGlow] = useState({ a: "", b: "", on: "a" as "a" | "b" });
  useEffect(() => {
    const src = shown.art;
    setGlow((g) => {
      if (src === (g.on === "a" ? g.a : g.b)) return g;
      return g.on === "a" ? { a: g.a, b: src, on: "b" } : { a: src, b: g.b, on: "a" };
    });
  }, [shown.art]);
  // The ways in on the left light up with the same cover (index.css, .ob-way).
  useEffect(() => {
    wallRef.current?.closest<HTMLElement>(".ob-root")?.style.setProperty("--ob-cover", `url(${JSON.stringify(shown.art)})`);
  }, [shown.art]);

  return (
    <>
      <div aria-hidden className="ob-light">
        <span className={`ob-light-art${glow.on === "a" ? " is-on" : ""}`} style={glow.a ? bg(glow.a) : undefined} />
        <span className={`ob-light-art${glow.on === "b" ? " is-on" : ""}`} style={glow.b ? bg(glow.b) : undefined} />
        <div className="cover-glow-grain" />
      </div>
      <div aria-hidden className="ob-stage">
        <div className="ob-stage-in">
          <div ref={wallRef} className={`ob-wall${busy ? " is-busy" : ""}`}>
            {ROWS.map((row, r) => (
              <div
                key={r}
                ref={(el) => {
                  rowEls.current[r] = el;
                }}
                className="ob-wall-row"
                onPointerDown={down(r)}
                onPointerMove={move(r)}
                onPointerUp={up(r)}
                onPointerCancel={up(r)}
                onPointerEnter={() => (sim.current[r].over = true)}
                onPointerLeave={() => (sim.current[r].over = false)}
              >
                {[0, 1, 2].flatMap((copy) =>
                  row.cover.map((c, i) => (
                    <span key={`${copy}-${i}`} className={`ob-tile${c === shown ? " is-lit" : ""}`} onPointerEnter={() => enter(c)} onPointerMove={glare} onPointerLeave={leave}>
                      {/* Fades in once it's here; one that won't load leaves its place dark. */}
                      <img
                        className="ob-tile-art"
                        src={c.art}
                        alt=""
                        draggable={false}
                        decoding="async"
                        loading={copy === 0 ? "eager" : "lazy"}
                        onLoad={(e) => e.currentTarget.classList.add("is-in")}
                        onError={(e) => {
                          e.currentTarget.style.visibility = "hidden";
                        }}
                      />
                    </span>
                  )),
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="ob-stage-blur" />
      </div>
    </>
  );
}
