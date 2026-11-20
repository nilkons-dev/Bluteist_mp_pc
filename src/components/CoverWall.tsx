/**
 * The onboarding's showpiece: a wall of covers, set on a tilted plane in perspective, its rows drifting slowly against
 * each other (songs most people know on sight; the same covers as before, lib/coverDrum). The cover in the middle of the
 * wall lights the page with its own colours (a blurred copy of it behind the wall, the way a collection page is lit);
 * resting the pointer on another lifts it (smoothly) and lights that one instead, and the row under the pointer slows to
 * a stop so a cover holds still while you look at it. Take hold of a cover and pull, and its row follows the pointer and
 * keeps going the way you flung it before it settles back to its own pace. The wall itself never moves or tilts.
 * With reduced motion the rows hold still (they can still be pulled).
 *
 * Built so nothing on the wall ever waits on React: the rows are drawn once and never rendered again; the pointer, the
 * lift, the glare and the lit cover are all set straight on the elements, and the rows move on one animation-frame loop
 * that writes a single transform per row. A cover's lift happens on an inner card, so the box the pointer rests on never
 * moves out from under it (which is what makes a lifted cover shake). If frames start coming slowly, the costly extras
 * (the blur behind the words, the glare) are dropped for good so the wall itself stays smooth.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
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
/** How long the pointer rests on a cover before the page's light moves to it. */
const LIGHT_DELAY_MS = 110;
const bg = (src: string): CSSProperties => ({ backgroundImage: `url(${JSON.stringify(src)})` });

/** Every cover once, so a tile can carry a small number (data-k) instead of an object. */
const COVERS: DrumCover[] = [...new Set(DRUM.flat())];
const KEY = new Map<DrumCover, number>(COVERS.map((c, i) => [c, i]));

interface Row {
  off: number;
  vel: number;
  w: number;
  base: number;
  over: boolean;
}

interface Handlers {
  row(i: number, el: HTMLDivElement | null): void;
  down(i: number, e: ReactPointerEvent<HTMLElement>): void;
  move(i: number, e: ReactPointerEvent<HTMLElement>): void;
  up(i: number, e: ReactPointerEvent<HTMLElement>): void;
  over(i: number, on: boolean): void;
}

/** The rows. Drawn once: their props never change, so they never render again. */
const Rows = memo(function Rows({ h }: { h: Handlers }) {
  return (
    <>
      {ROWS.map((row, r) => (
        <div
          key={r}
          ref={(el) => h.row(r, el)}
          className="ob-wall-row"
          onPointerDown={(e) => h.down(r, e)}
          onPointerMove={(e) => h.move(r, e)}
          onPointerUp={(e) => h.up(r, e)}
          onPointerCancel={(e) => h.up(r, e)}
          onPointerEnter={() => h.over(r, true)}
          onPointerLeave={() => h.over(r, false)}
        >
          {[0, 1, 2].flatMap((copy) =>
            row.cover.map((c, i) => (
              <span key={`${copy}-${i}`} className="ob-tile" data-k={KEY.get(c)}>
                <span className="ob-card">
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
              </span>
            )),
          )}
        </div>
      ))}
    </>
  );
});

export function CoverWall({ turn, busy }: { turn: number; busy: boolean }) {
  const mid = DRUM[MID % DRUM.length];
  const [lit, setLit] = useState<DrumCover>(mid[0]);
  const [hover, setHover] = useState<DrumCover | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);
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
  const sim = useRef<Row[]>(ROWS.map((_, i) => ({ off: -((i * 0.137 + 0.08) % 1), vel: 0, w: 0, base: 0, over: false })));
  const drag = useRef<{ row: number; id: number; x: number; t: number; v: number } | null>(null);

  useEffect(() => {
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stage = stageRef.current;
    let raf = 0, last = performance.now(), frame = 0, slow = 0, seen = 0;
    const born = last;
    const tick = (now: number): void => {
      const raw = (now - last) / 1000;
      const dt = Math.min(0.05, Math.max(0.001, raw));
      last = now;
      // Frames that keep arriving slowly (after the first seconds, while the covers load): drop the costly extras.
      if (now - born > 3000 && stage && !stage.hasAttribute("data-lite")) {
        seen++;
        if (raw > 0.036) slow++;
        if (seen >= 90) {
          if (slow > 40) stage.setAttribute("data-lite", "");
          seen = slow = 0;
        }
      }
      const measure = frame++ % 30 === 0;
      const rows = sim.current;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const el = rowEls.current[i];
        if (!el) continue;
        if (measure || r.w === 0) {
          const w = el.offsetWidth / 3;
          if (w > 0) {
            // A fraction until the width is known, then pixels.
            if (r.w === 0) r.off = r.off * w;
            else r.off = (r.off / r.w) * w;
            r.w = w;
          }
        }
        if (r.w === 0) continue;
        r.base = reduce ? 0 : (ROWS[i].dir * r.w) / ROWS[i].secs;
        if (drag.current?.row !== i) {
          // Held still while the pointer rests on it, unless it is still running from a fling.
          const flinging = Math.abs(r.vel) > Math.abs(r.base) * 2 + 40;
          const target = r.over && !flinging ? 0 : r.base;
          r.vel += (target - r.vel) * (1 - Math.exp(-dt * (flinging ? 1.6 : 6)));
          r.off += r.vel * dt;
        }
        while (r.off <= -r.w) r.off += r.w;
        while (r.off > 0) r.off -= r.w;
        el.style.transform = `translate3d(${r.off.toFixed(2)}px,0,0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ---- the cover under the pointer: all straight on the elements, never through React ---- */
  const hot = useRef<HTMLElement | null>(null);
  const lightTimer = useRef(0);
  const glareFrame = useRef(0);

  const setHot = useCallback((tile: HTMLElement | null): void => {
    if (hot.current === tile) return;
    hot.current?.classList.remove("is-hot");
    hot.current = tile;
    tile?.classList.add("is-hot");
    window.clearTimeout(lightTimer.current);
    if (!tile) {
      // Leaving a cover lets the page's light go back after a beat, not at once (the pointer may be on the next one).
      lightTimer.current = window.setTimeout(() => setHover(null), 160);
      return;
    }
    const cover = COVERS[Number(tile.dataset.k)];
    lightTimer.current = window.setTimeout(() => setHover(cover ?? null), LIGHT_DELAY_MS);
  }, []);

  const handlers = useMemo<Handlers>(
    () => ({
      row(i, el) {
        rowEls.current[i] = el;
      },
      down(i, e) {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        const row = e.currentTarget;
        try {
          row.setPointerCapture(e.pointerId);
        } catch {
          /* a pointer that is already gone */
        }
        drag.current = { row: i, id: e.pointerId, x: e.clientX, t: performance.now(), v: 0 };
        row.classList.add("is-drag");
        setHot(null);
      },
      move(i, e) {
        const d = drag.current;
        if (!d) {
          // Resting on a cover: the glare follows the pointer (one write a frame).
          const tile = hot.current;
          if (!tile || glareFrame.current) return;
          const nx = e.nativeEvent.offsetX, ny = e.nativeEvent.offsetY;
          glareFrame.current = requestAnimationFrame(() => {
            glareFrame.current = 0;
            const w = tile.offsetWidth || 1;
            tile.style.setProperty("--gx", `${Math.max(0, Math.min(100, (nx / w) * 100)).toFixed(0)}%`);
            tile.style.setProperty("--gy", `${Math.max(0, Math.min(100, (ny / w) * 100)).toFixed(0)}%`);
          });
          return;
        }
        if (d.row !== i || d.id !== e.pointerId) return;
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
      },
      up(i, e) {
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
      },
      over(i, on) {
        sim.current[i].over = on;
      },
    }),
    [setHot],
  );

  // Covers are found by the pointer's events bubbling up (one listener for the whole wall).
  const overTile = (e: ReactPointerEvent<HTMLElement>): void => {
    if (drag.current || e.pointerType !== "mouse") return;
    const tile = (e.target as Element).closest<HTMLElement>(".ob-tile");
    if (tile) setHot(tile);
  };
  const outTile = (e: ReactPointerEvent<HTMLElement>): void => {
    if (drag.current) return;
    const to = e.relatedTarget as Element | null;
    // Moving on to another cover is handled by its own "over"; only leaving the covers lets go.
    if (to && to.closest?.(".ob-tile")) return;
    setHot(null);
  };
  useEffect(
    () => () => {
      window.clearTimeout(lightTimer.current);
      cancelAnimationFrame(glareFrame.current);
    },
    [],
  );

  /* ---- the page's light: the lit cover, painted on the tiles showing it ---- */
  const litTiles = useRef<Element[]>([]);
  useEffect(() => {
    const wall = wallRef.current;
    if (!wall) return;
    for (const t of litTiles.current) t.classList.remove("is-lit");
    litTiles.current = [...wall.querySelectorAll(`[data-k="${KEY.get(shown) ?? -1}"]`)];
    for (const t of litTiles.current) t.classList.add("is-lit");
  }, [shown]);

  // The glow crossfades between two layers, so a new cover never cuts in. Its picture is decoded first,
  // so the fade never waits on it (a late decode is a hitch in the middle of the fade).
  const [glow, setGlow] = useState({ a: "", b: "", on: "a" as "a" | "b" });
  useEffect(() => {
    const src = shown.art;
    let dead = false;
    const swap = (): void => {
      if (dead) return;
      setGlow((g) => {
        if (src === (g.on === "a" ? g.a : g.b)) return g;
        return g.on === "a" ? { a: g.a, b: src, on: "b" } : { a: src, b: g.b, on: "a" };
      });
    };
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    if (typeof img.decode === "function") img.decode().then(swap, swap);
    else swap();
    return () => {
      dead = true;
    };
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
      <div aria-hidden ref={stageRef} className="ob-stage">
        <div className="ob-stage-in">
          <div ref={wallRef} className={`ob-wall${busy ? " is-busy" : ""}`} onPointerOver={overTile} onPointerOut={outTile}>
            <Rows h={handlers} />
          </div>
        </div>
        <div className="ob-stage-blur" />
      </div>
    </>
  );
}
