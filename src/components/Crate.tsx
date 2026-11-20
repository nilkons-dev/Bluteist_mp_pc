import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Pause, Play } from "lucide-react";
import { playPlaylist } from "../lib/playlist";
import { browseMenuItems } from "../lib/trackActions";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";
import type { PlaylistCard } from "../types";
import "./coverflow.css";

/**
 * Playlists as a 3D coverflow (Home's "Playlists for you", a category's page). The focused cover stands large in the
 * middle, the ones either side turn away in depth. The row is endless: the last playlist is followed by the first, so
 * it never runs out. It drifts on its own until the pointer rests on it, and can be moved with the arrow keys, a drag
 * or swipe, a sideways scroll, or by resting the pointer toward either end (the nearer the end, the faster). A cover
 * lifts and tilts toward the pointer under it, with a soft glare; the focused one has a play button. A click on a side
 * cover brings it to the middle; a click on the middle one opens the playlist.
 *
 * Everything that moves is one animation-frame loop that writes straight to the cover elements (no render per frame);
 * it sleeps while the row is off screen. The look is in coverflow.css.
 */
const MAX = 40;
/** Milliseconds each cover stays in the middle while it drifts on its own. */
const AUTO_MS = 3200;
/** Edge-hover scroll: the share of the row at each end that scrolls, and the fastest it goes (covers a second). */
const ZONE = 0.36;
const MAXV = 11;
const cl = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
/** An index on the endless row: any whole number lands on one of the N covers. */
const wrapIdx = (i: number, n: number): number => ((Math.round(i) % n) + n) % n;
/** The shortest way round from a position to a cover, in covers: -N/2 .. N/2. */
const around = (d: number, n: number): number => d - n * Math.round(d / n);
const ease = (t: number): number => 1 - Math.pow(1 - t, 4);

interface Hover {
  hv: number;
  tx: number;
  ty: number;
  mx: number;
  my: number;
  gx: number;
  gy: number;
  push: number;
  /** true while this cover has hover motion in it (so a resting cover costs nothing) */
  hot: boolean;
}

export function Crate({ title, playlists, className = "" }: { title: string; playlists: PlaylistCard[]; className?: string }) {
  const navigate = useUI((s) => s.navigate);
  const list = playlists.slice(0, MAX);
  const N = list.length;
  const stageRef = useRef<HTMLDivElement>(null);
  const cards = useRef<Array<HTMLDivElement | null>>([]);
  const dims = useRef<Array<HTMLElement | null>>([]);
  const arts = useRef<Array<HTMLElement | null>>([]);
  const [active, setActive] = useState(() => Math.round((N - 1) / 2));
  const activeRef = useRef(active);

  // What the loop and the handlers share.
  const st = useRef({
    pos: (N - 1) / 2,
    target: Math.round((N - 1) / 2),
    hover: false,
    dragging: false,
    hoverIdx: -1,
    edgeVel: 0,
    lastAuto: 0,
    started: 0,
    visible: false,
    playing: false,
    wake: (): void => undefined,
  });
  const hov = useRef<Hover[]>([]);

  // The playlist this row started, and whether that is still what is playing.
  const [owned, setOwned] = useState<{ id: string; first: string } | null>(null);
  const first = usePlayer((s) => s.queue[0]?.id ?? "");
  const playing = usePlayer((s) => s.playing);
  const playingId = owned && owned.first === first && playing ? owned.id : null;
  st.current.playing = playingId !== null;
  const isPlayingRow = playingId !== null;
  useEffect(() => {
    st.current.lastAuto = performance.now();
    st.current.wake();
  }, [isPlayingRow]);

  useEffect(() => {
    const stage = stageRef.current;
    const S = st.current;
    if (!stage || N === 0) return;
    const reduce =
      (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) ||
      document.documentElement.classList.contains("reduce-motion");
    hov.current = Array.from({ length: N }, () => ({ hv: 0, tx: 0, ty: 0, mx: 0, my: 0, gx: 50, gy: 30, push: 0, hot: false }));
    S.target = Math.round(S.pos);
    let raf = 0;
    let prev = performance.now();
    let w = stage.clientWidth;
    let card = 200;
    const size = (): void => {
      w = stage.clientWidth;
      card = w < 720 ? 150 : w < 1000 ? 176 : 200;
      stage.style.setProperty("--cf-card", `${card}px`);
    };
    size();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(size) : null;
    ro?.observe(stage);

    /** Lays the covers out; true while anything is still moving (so the loop knows when it may sleep). */
    const layout = (dt: number, intro: number): boolean => {
      let busy = false;
      const small = w < 720;
      const u = card / 200;
      const centerGap = (small ? 118 : 190) * u;
      const sp = (small ? 34 : 52) * u;
      const h = S.dragging ? -1 : S.hoverIdx;
      const kf = 1 - Math.exp(-dt * 11);
      const ks = 1 - Math.exp(-dt * 7);
      for (let i = 0; i < N; i++) {
        const el = cards.current[i];
        const q = hov.current[i];
        if (!el || !q) continue;
        const d = around(i - S.pos, N);
        const a = Math.abs(d);
        const s = d < 0 ? -1 : 1;
        const on = i === h;
        // Fades out toward the far side of the endless row, where a cover would otherwise jump from one end to the other.
        const op = Math.min(cl(1 - Math.max(a - 7, 0) * 0.3, 0, 1), N >= 4 ? cl((N / 2 - a) / 0.9, 0, 1) : 1);
        // Well out of sight: not drawn (no box, no layer), and no work.
        if (op < 0.01 && !on) {
          if (el.style.display !== "none") {
            el.style.display = "none";
            el.style.willChange = "auto";
          }
          continue;
        }
        if (el.style.display === "none") {
          el.style.display = "";
          el.style.willChange = "transform, opacity";
        }
        const st0 = reduce ? 1 : ease(cl(intro * 1.6 - (Math.abs(i - (N - 1) / 2) / N) * 0.9, 0, 1));

        // hover physics (smoothed)
        q.hv += ((on ? 1 : 0) - q.hv) * kf;
        q.tx += ((on ? q.mx : 0) - q.tx) * kf;
        q.ty += ((on ? q.my : 0) - q.ty) * kf;
        q.gx += (50 + q.mx * 50 - q.gx) * kf;
        q.gy += (50 + q.my * 50 - q.gy) * kf;
        const dd = h < 0 ? 0 : around(i - h, N);
        const pt = h < 0 || dd === 0 ? 0 : (dd < 0 ? -1 : 1) * Math.max(0, 1 - Math.abs(dd) / 4) * (small ? 10 : 26) * u;
        q.push += (pt - q.push) * ks;
        if (st0 < 1 || Math.abs(q.hv - (on ? 1 : 0)) > 0.002 || Math.abs(q.tx) + Math.abs(q.ty) > 0.003 || Math.abs(pt - q.push) > 0.05) busy = true;

        const near = Math.min(a, 1);
        const far = Math.max(a - 1, 0);
        const x = s * (near * centerGap + far * sp) * st0 + q.push;
        const ry = -s * near * 40 * st0;
        const z = (-near * 70 - far * 14) * st0 * u + (1 - st0) * -200 + q.hv * 80;
        let sc = 1.22 - near * 0.34 - Math.min(far, 6) * 0.012;
        sc = (1 + (sc - 1) * st0 - (1 - st0) * 0.2) * (1 + q.hv * 0.07);
        const y = (1 - st0) * 40 - q.hv * 14;
        el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,${z.toFixed(2)}px) rotateY(${(ry + q.tx * 13).toFixed(2)}deg) rotateX(${(-q.ty * 11).toFixed(2)}deg) scale(${sc.toFixed(3)})`;
        el.style.opacity = (op * st0).toFixed(3);
        el.style.zIndex = String(1000 - Math.round(a * 10) + (on ? 5000 : 0));
        el.style.pointerEvents = op * st0 < 0.05 ? "none" : "auto";
        const dim = dims.current[i];
        if (dim) dim.style.opacity = cl(Math.min(a, 3) * 0.11 - q.hv * 0.16, 0, 0.5).toFixed(3);
        // The hover look (glare, parallax) is only written while a cover has any: the others stay as they are.
        const hot = on || q.hv > 0.003 || Math.abs(q.tx) + Math.abs(q.ty) > 0.003;
        if (hot || q.hot) {
          el.style.setProperty("--hv", q.hv.toFixed(3));
          const art = arts.current[i];
          if (art) {
            art.style.setProperty("--mx", `${q.gx.toFixed(1)}%`);
            art.style.setProperty("--my", `${q.gy.toFixed(1)}%`);
            art.style.setProperty("--px", `${(-q.tx * 7).toFixed(2)}px`);
            art.style.setProperty("--py", `${(-q.ty * 7).toFixed(2)}px`);
          }
          el.toggleAttribute("data-hov", q.hv > 0.05);
          q.hot = hot;
        }
      }
      const now = wrapIdx(S.pos, N);
      if (now !== activeRef.current) {
        activeRef.current = now;
        setActive(now);
      }
      return busy;
    };
    const frame = (nowMs: number): void => {
      raf = 0;
      if (!S.visible) return;
      const dt = Math.min((nowMs - prev) / 1000, 0.05);
      prev = nowMs;
      if (!S.started) S.started = nowMs;
      const intro = reduce ? 1 : cl((nowMs - S.started) / 1800, 0, 1);

      // Drifts on its own, always the same way round, until the pointer rests on it, a cover plays, or it is being moved.
      if (!S.hover && !S.dragging && !S.playing && intro >= 1 && !reduce && N > 1) {
        if (nowMs - S.lastAuto > AUTO_MS) {
          S.target = Math.round(S.target) + 1;
          S.lastAuto = nowMs;
        }
      } else {
        S.lastAuto = nowMs;
      }
      // Pointer toward an end: the row is pulled that way, without end.
      if (!S.dragging && S.edgeVel !== 0 && intro >= 1) {
        S.pos += S.edgeVel * dt;
        S.target = S.pos;
        S.lastAuto = nowMs;
      }
      // Keep the numbers small on a row that has been running a long while (the look only depends on the remainder).
      if (Math.abs(S.pos) > N * 40) {
        const k = N * Math.round(S.pos / N);
        S.pos -= k;
        S.target -= k;
      }
      if (!S.dragging) {
        S.pos += (S.target - S.pos) * (1 - Math.exp(-dt * 7.5));
        if (Math.abs(S.target - S.pos) < 0.0005) S.pos = S.target;
      }
      const moving = layout(dt, intro) || S.dragging || S.edgeVel !== 0 || intro < 1 || Math.abs(S.target - S.pos) > 0.0005 || S.hoverIdx >= 0;
      if (moving) {
        raf = requestAnimationFrame(frame);
        return;
      }
      // Everything has settled: sleep instead of rewriting identical transforms 60 times a second. Only the
      // slow auto-drift needs a wake-up, so that gets a timer; every pointer event wakes the loop itself.
      if (!S.hover && !S.playing && !reduce && N > 1) {
        idle = window.setTimeout(wake, Math.max(40, AUTO_MS - (performance.now() - S.lastAuto)) + 20);
      }
    };
    let idle = 0;
    const wake = (): void => {
      window.clearTimeout(idle);
      idle = 0;
      if (!raf && S.visible) {
        prev = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    S.wake = wake;
    // Asleep while it is off screen.
    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            S.visible = entries.some((e) => e.isIntersecting);
            if (S.visible) {
              S.lastAuto = performance.now();
              wake();
            }
          })
        : null;
    if (io) io.observe(stage);
    else {
      S.visible = true;
      wake();
    }
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(idle);
      io?.disconnect();
      ro?.disconnect();
      S.visible = false;
      S.wake = () => undefined;
    };
  }, [N]);

  const go = (i: number): void => {
    const S = st.current;
    S.target = Math.round(i);
    S.lastAuto = performance.now();
    S.wake();
  };
  const cardAt = (target: EventTarget | null): number => {
    const el = (target as HTMLElement | null)?.closest?.("[data-cf]");
    const i = el ? Number(el.getAttribute("data-cf")) : -1;
    return Number.isInteger(i) && i >= 0 && i < N ? i : -1;
  };
  const open = (p: PlaylistCard): void => navigate({ name: "ytplaylist", param: p.id });

  const stopEdge = (): void => {
    const S = st.current;
    if (S.edgeVel !== 0) {
      S.edgeVel = 0;
      S.target = Math.round(S.pos);
      S.lastAuto = performance.now();
    }
  };

  /* ---- the pointer: an end pulls covers in; a drag moves the row; a cover under it lifts ---- */
  const drag = useRef({ sx: 0, sp: 0, moved: 0 });
  const onMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const S = st.current;
    if (e.pointerType !== "mouse" && !S.dragging) return;
    const stage = e.currentTarget;
    if (S.dragging) {
      const dx = e.clientX - drag.current.sx;
      drag.current.moved = Math.max(drag.current.moved, Math.abs(dx));
      S.pos = drag.current.sp - dx / 80;
      S.target = Math.round(S.pos);
      S.wake();
      return;
    }
    const r = stage.getBoundingClientRect();
    const f = (e.clientX - r.left) / Math.max(1, r.width);
    let v = 0;
    if (f < ZONE) v = -Math.pow((ZONE - f) / ZONE, 0.85);
    else if (f > 1 - ZONE) v = Math.pow((f - (1 - ZONE)) / ZONE, 0.85);
    const i = cardAt(e.target);
    if (i >= 0) {
      const c = (e.target as HTMLElement).closest<HTMLElement>("[data-cf]");
      const q = hov.current[i];
      if (c && q) {
        const cr = c.getBoundingClientRect();
        q.mx = cl(((e.clientX - cr.left) / Math.max(1, cr.width)) * 2 - 1, -1, 1);
        q.my = cl(((e.clientY - cr.top) / Math.max(1, cr.height)) * 2 - 1, -1, 1);
      }
    }
    if (v === 0) {
      stopEdge();
      return;
    }
    S.edgeVel = v * MAXV;
    S.wake();
  };
  const onOver = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.pointerType !== "mouse") return;
    const i = cardAt(e.target);
    if (i >= 0) {
      st.current.hoverIdx = i;
      st.current.wake();
    }
  };
  const onOut = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const to = cardAt(e.relatedTarget);
    if (to >= 0) return;
    st.current.hoverIdx = -1;
    st.current.wake();
  };
  const onDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if ((e.target as HTMLElement).closest(".cf-play")) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const S = st.current;
    S.dragging = true;
    S.edgeVel = 0;
    drag.current = { sx: e.clientX, sp: S.pos, moved: 0 };
    S.wake();
    e.currentTarget.classList.add("is-drag");
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer that is already gone */
    }
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const S = st.current;
    if (!S.dragging) return;
    S.dragging = false;
    e.currentTarget.classList.remove("is-drag");
    S.target = Math.round(S.pos);
    S.lastAuto = performance.now();
    S.wake();
    if (drag.current.moved < 6 && e.type === "pointerup") {
      // A click: on a side cover it brings that one to the middle, on the middle one it opens it.
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const i = cardAt(hit);
      if (i >= 0 && !(hit as HTMLElement).closest(".cf-play")) {
        if (i === wrapIdx(S.target, N)) open(list[i]);
        else go(Math.round(S.target) + around(i - wrapIdx(S.target, N), N));
      }
    }
  };
  const onWheel = (e: WheelEvent): void => {
    // Only a sideways scroll moves the row; the page keeps its own up-and-down scroll.
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 6) return;
    e.preventDefault();
    const S = st.current as typeof st.current & { wt?: number };
    const now = performance.now();
    if (now - (S.wt ?? 0) > 140) {
      go(S.target + (e.deltaX > 0 ? 1 : -1));
      S.wt = now;
    }
  };
  // Not a React handler: React's wheel listeners are passive, and this one has to cancel the page's sideways pan.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [N]);

  const onKey = (e: ReactKeyboardEvent<HTMLElement>): void => {
    const S = st.current;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(S.target + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(S.target - 1);
    } else if (e.key === "Enter" && list[wrapIdx(S.target, N)]) {
      e.preventDefault();
      open(list[wrapIdx(S.target, N)]);
    }
  };

  const togglePlay = (p: PlaylistCard): void => {
    const pl = usePlayer.getState();
    if (owned?.id === p.id && owned.first === (pl.queue[0]?.id ?? "")) {
      pl.setPlaying(!pl.playing);
      return;
    }
    void playPlaylist(p.id).then(() => {
      const q = usePlayer.getState().queue;
      if (q[0]) setOwned({ id: p.id, first: q[0].id });
    });
  };

  if (N === 0) return null;

  return (
    <section className={className}>
      <h2 className="section-title text-[21px] mb-1 flex items-baseline gap-2">
        {title} <span className="text-[14px] font-medium text-ink-faint tabular-nums">{playlists.length}</span>
      </h2>
      <div
        ref={stageRef}
        role="listbox"
        tabIndex={0}
        aria-label={`${title}. Use the left and right arrow keys to move.`}
        className="cf-stage"
        onPointerMove={onMove}
        onPointerOver={onOver}
        onPointerOut={onOut}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onMouseEnter={() => {
          st.current.hover = true;
          st.current.wake();
        }}
        onMouseLeave={() => {
          st.current.hover = false;
          st.current.hoverIdx = -1;
          st.current.lastAuto = performance.now();
          stopEdge();
          st.current.wake();
        }}
        onKeyDown={onKey}
        onContextMenu={(e) => {
          const i = cardAt(e.target);
          if (i < 0) return;
          const p = list[i];
          const items = browseMenuItems({ browseId: p.id, title: p.title, subtitle: p.subtitle ?? "", thumb: p.thumb, type: "playlist" });
          if (!items.length) return;
          e.preventDefault();
          useUI.getState().openContextMenu(e.clientX, e.clientY, items);
        }}
      >
        <div className="cf-rail">
          {list.map((p, i) => {
            const isPlaying = playingId === p.id;
            return (
              <div
                key={p.id}
                data-cf={i}
                role="option"
                aria-selected={i === active}
                aria-label={p.title}
                className={`cf-card${i === active ? " is-active" : ""}${isPlaying ? " is-playing" : ""}`}
                style={{ opacity: 0 }}
                ref={(el) => {
                  cards.current[i] = el;
                }}
              >
                <div
                  className="cf-face"
                  ref={(el) => {
                    arts.current[i] = el;
                  }}
                >
                  <img src={p.thumb} alt="" draggable={false} decoding="async" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
                  <div
                    className="cf-dim"
                    ref={(el) => {
                      dims.current[i] = el;
                    }}
                  />
                  <div className="cf-shade" />
                  <div className="cf-sheen" />
                  <div className="cf-glare" />
                  <div className="cf-edge" />
                  <div className="cf-label">
                    <b>{p.title}</b>
                  </div>
                  <div className="cf-eq" aria-hidden>
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <button
                    type="button"
                    className={`cf-play${isPlaying ? " is-playing" : ""}`}
                    aria-label={isPlaying ? `Pause ${p.title}` : `Play ${p.title}`}
                    title={isPlaying ? "Pause" : "Play"}
                    tabIndex={i === active ? 0 : -1}
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePlay(p);
                    }}
                  >
                    <Play className="cf-ic cf-ic-play" strokeWidth={2.2} />
                    <Pause className="cf-ic cf-ic-pause" strokeWidth={0} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
