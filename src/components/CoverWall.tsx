/**
 * The onboarding's showpiece: a wall of covers, set on a tilted plane in perspective, its rows drifting slowly against
 * each other (songs most people know on sight; the same covers as before, lib/coverDrum). The cover in the middle of the
 * wall lights the page with its own colours (a blurred copy of it behind the wall, the way a collection page is lit);
 * resting the pointer on another lifts it and lights that one instead, and the row under the pointer stops so a cover
 * holds still while you look at it. Motion is CSS (index.css, .ob-wall); with reduced motion the wall holds still.
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

  // The whole wall leans a little toward the pointer (and settles back when it leaves the window).
  useEffect(() => {
    const root = wallRef.current?.closest<HTMLElement>(".ob-root");
    const wall = wallRef.current;
    if (!root || !wall) return;
    let raf = 0, nx = 0, ny = 0;
    const apply = (): void => {
      raf = 0;
      wall.style.setProperty("--px", nx.toFixed(3));
      wall.style.setProperty("--py", ny.toFixed(3));
    };
    const move = (e: PointerEvent): void => {
      nx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      ny = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const reset = (): void => {
      nx = 0;
      ny = 0;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerleave", reset);
    return () => {
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", reset);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // A cover tilts toward the pointer, and a soft glare follows it across the cover.
  const tilt = (e: ReactPointerEvent<HTMLElement>): void => {
    const t = e.currentTarget, r = t.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    t.style.setProperty("--ry", `${((x - 0.5) * 16).toFixed(2)}deg`);
    t.style.setProperty("--rx", `${((0.5 - y) * 16).toFixed(2)}deg`);
    t.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
    t.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
  };
  const untilt = (e: ReactPointerEvent<HTMLElement>): void => {
    const t = e.currentTarget;
    t.style.removeProperty("--ry");
    t.style.removeProperty("--rx");
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
              <div key={r} className={`ob-wall-row${row.dir === 1 ? " is-rev" : ""}`} style={{ ["--dur" as string]: `${row.secs}s` }}>
                {[0, 1, 2].flatMap((copy) =>
                  row.cover.map((c, i) => (
                    <span key={`${copy}-${i}`} className={`ob-tile${c === shown ? " is-lit" : ""}`} onPointerEnter={() => enter(c)} onPointerMove={tilt} onPointerLeave={(e) => { untilt(e); leave(); }}>
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
