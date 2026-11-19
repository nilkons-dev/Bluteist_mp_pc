import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { FitText } from "./FitText";
import { browseMenuItems } from "../lib/trackActions";
import { useUI } from "../stores/ui";
import type { PlaylistCard } from "../types";
import "./crate.css";

/**
 * Playlists as a stack of cards (Home's "Playlists for you", a category's page). The cards sit in a row, a little
 * overlapped and leaning; the one under the pointer (or reached with the arrow keys) comes forward and grows, its
 * neighbours move aside, the rest dim, and a card slides up from behind it with the playlist's name. The card tilts
 * toward the pointer with a soft sheen. A click opens the playlist; right-click has its options.
 *
 * The motion is a small spring loop on each card's position (no re-render per frame); the look is in crate.css.
 */
const MAX = 16;
const cl = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

type Spring = { v: number[] | null; tx: number; ty: number };

export function Crate({ title, playlists, className = "" }: { title: string; playlists: PlaylistCard[]; className?: string }) {
  const navigate = useUI((s) => s.navigate);
  const list = playlists.slice(0, MAX);
  const N = list.length;
  const rowRef = useRef<HTMLDivElement>(null);
  const cards = useRef<Array<HTMLDivElement | null>>([]);
  const tilts = useRef<Array<HTMLDivElement | null>>([]);
  const faces = useRef<Array<HTMLDivElement | null>>([]);
  const springs = useRef<Spring[]>([]);
  const ptr = useRef({ x: 0, y: 0 });
  // -1: no card up.
  const [hv, setHv] = useState(-1);
  const hvRef = useRef(-1);
  hvRef.current = hv;
  const shown = hv >= 0 ? list[hv] : undefined;

  useEffect(() => {
    const row = rowRef.current;
    if (!row || N === 0) return;
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = row.clientWidth, S = 120;
    const size = (): void => {
      W = row.clientWidth;
      S = cl(W < 640 ? W * 0.24 : W * 0.12, 96, 150);
      row.style.setProperty("--ps-s", `${S}px`);
    };
    size();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(size) : null;
    ro?.observe(row);
    springs.current = Array.from({ length: N }, () => ({ v: null, tx: 0, ty: 0 }));
    const M = (N - 1) / 2;
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number): void => {
      const t = (now - t0) / 1000;
      const h = hvRef.current;
      const push = S * 0.62;
      const step = Math.max(22, Math.min(S * 0.78, (W - S * 1.5 - 2 * push) / Math.max(1, N - 1)));
      for (let i = 0; i < N; i++) {
        const el = cards.current[i], tl = tilts.current[i], face = faces.current[i], c = springs.current[i];
        if (!el || !tl || !face || !c) continue;
        const d = i - M, dd = h >= 0 ? i - h : 0, on = i === h;
        const x = d * step + (h >= 0 ? Math.sign(dd) * push * (1 - Math.exp(-Math.abs(dd) * 1.4)) : 0);
        // x, y, z, (unused), turn about y, scale, opacity
        let T = [x, S * 0.35 + (reduce ? 0 : Math.sin(t * 0.8 + i * 0.7) * 2.5), 0, 0, h >= 0 ? cl(-dd * 14, -40, 40) : cl(-d * 6, -24, 24), 1, 1];
        if (on) T = [x, S * 0.35 - S * 0.12, 140, 0, 0, 1.42, 1];
        if (!reduce && t < 0.2 + i * 0.07) T = [0, S * 0.9, 0, 0, 0, 0.7, 0];
        if (!c.v) c.v = [0, S * 0.9, 0, 0, 0, 0.7, 0];
        for (let k = 0; k < 7; k++) c.v[k] += (T[k] - c.v[k]) * (reduce ? 0.35 : 0.13);
        const v = c.v;
        el.style.transform = `translate3d(${W / 2 + v[0] - S / 2}px,${v[1]}px,${v[2]}px) rotateY(${v[4]}deg) scale(${v[5]})`;
        el.style.opacity = String(v[6]);
        el.style.zIndex = String(on ? 100 : Math.round(50 - Math.abs(h >= 0 ? dd : d) * 3));
        let tx = 0, ty = 0;
        if (on && !reduce) {
          const r = el.getBoundingClientRect();
          tx = cl((ptr.current.x - r.left - r.width / 2) / (r.width / 2), -1, 1);
          ty = cl((ptr.current.y - r.top - r.height / 2) / (r.height / 2), -1, 1);
        }
        c.tx += (tx - c.tx) * 0.15;
        c.ty += (ty - c.ty) * 0.15;
        tl.style.transform = `rotateX(${-c.ty * 7}deg) rotateY(${c.tx * 9}deg)`;
        face.style.setProperty("--mx", `${(c.tx * 0.5 + 0.5) * 100}%`);
        face.style.setProperty("--my", `${(c.ty * 0.5 + 0.5) * 100}%`);
        face.style.setProperty("--sh", on ? "0.4" : "0");
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [N]);

  const at = (target: EventTarget): number => {
    const el = (target as HTMLElement).closest?.("[data-ps]");
    const i = el ? Number(el.getAttribute("data-ps")) : -1;
    return Number.isInteger(i) && i < N ? i : -1;
  };
  const hover = (e: ReactPointerEvent<HTMLElement>): void => {
    ptr.current = { x: e.clientX, y: e.clientY };
    const i = at(e.target);
    if (i >= 0 && i !== hvRef.current) setHv(i);
  };
  const open = (p: PlaylistCard): void => navigate({ name: "ytplaylist", param: p.id });
  const onKey = (e: ReactKeyboardEvent<HTMLElement>): void => {
    const k = hv >= 0 ? hv : Math.round((N - 1) / 2);
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setHv(cl(k + 1, 0, N - 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setHv(cl(k - 1, 0, N - 1));
    } else if ((e.key === "Enter" || e.key === " ") && hv >= 0) {
      e.preventDefault();
      open(list[hv]);
    } else if (e.key === "Escape") setHv(-1);
  };

  return (
    <section className={className}>
      <h2 className="section-title text-[21px] mb-1 flex items-baseline gap-2">
        {title} <span className="text-[14px] font-medium text-ink-faint tabular-nums">{playlists.length}</span>
      </h2>
      <div
        ref={rowRef}
        role="listbox"
        tabIndex={0}
        aria-label={`${title}. Use the arrow keys to move.`}
        className={`ps-row${hv >= 0 ? " has-hover" : ""}`}
        onPointerMove={hover}
        onPointerDown={hover}
        onPointerLeave={() => setHv(-1)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHv(-1);
        }}
        onKeyDown={onKey}
        onClick={(e) => {
          const i = at(e.target);
          if (i >= 0) open(list[i]);
        }}
        onContextMenu={(e) => {
          const i = at(e.target);
          if (i < 0) return;
          const p = list[i];
          const items = browseMenuItems({ browseId: p.id, title: p.title, subtitle: p.subtitle ?? "", thumb: p.thumb, type: "playlist" });
          if (!items.length) return;
          e.preventDefault();
          useUI.getState().openContextMenu(e.clientX, e.clientY, items);
        }}
      >
        {list.map((p, i) => (
          <div
            key={p.id}
            data-ps={i}
            role="option"
            aria-selected={i === hv}
            aria-label={p.title}
            className={`ps-card${i === hv ? " is-up" : ""}`}
            ref={(el) => {
              cards.current[i] = el;
            }}
          >
            <div
              className="ps-tilt"
              ref={(el) => {
                tilts.current[i] = el;
              }}
            >
              <div className="ps-back">
                <div className="ps-inside">
                  <em>PLAYLIST</em>
                  <span>{p.title}</span>
                </div>
              </div>
              <div
                className="ps-face"
                ref={(el) => {
                  faces.current[i] = el;
                }}
              >
                <img src={p.thumb} alt="" draggable={false} />
                <b className="ps-sheen" />
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* Keyed by the lifted playlist, so each new name slides in; empty at rest, its height kept so nothing below jumps. */}
      <div key={shown?.id ?? "rest"} className="crate-caption">
        {shown && (
          <>
            <FitText mode="auto" text={shown.title} className="text-[15px] font-semibold text-ink-hi" />
            <FitText mode="auto" text={shown.subtitle ?? ""} className="text-[13px] text-ink-dim" />
          </>
        )}
      </div>
    </section>
  );
}
