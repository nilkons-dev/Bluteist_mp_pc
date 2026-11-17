/**
 * The player bar's transport, in the brand's eye-music-controls layout: shuffle, previous, the eye-shaped play
 * button (its glyph is the pupil and follows the pointer), next, repeat, and the seek bar with a sparkle knob.
 * Wired to the player store; the look and the motion are the brand page's own.
 *
 * As in the rest of the app, dragging the seek bar is only visual: the song is sought once, on release.
 */
import { useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { usePlayer, shownTrack } from "../stores/player";
import { fmtTime } from "../lib/format";
import { EYE_ALMOND, EYE_BODY, EYE_VIEWBOX } from "./eyeBrand";
import "./eyeTransport.css";

type Anim = (el: Element, kf: Keyframe[], o?: KeyframeAnimationOptions) => Animation | undefined;
const A: Anim = (el, kf, o) => el.animate?.(kf, { duration: 500, easing: "cubic-bezier(.3,.8,.3,1)", ...o });

/** Skip buttons: stretch-out, wrap-around re-entry, ghost trails, speed streaks, bar squash, 3D tilt. */
function skipFx(btn: HTMLElement, s: 1 | -1): void {
  const q = (c: string) => btn.querySelector(c);
  const tri = q(".et-tri"), bar = q(".et-bar-i");
  if (tri) A(tri, [{ transform: "translateX(0) scaleX(1)", opacity: 1 }, { transform: `translateX(${16 * s}px) scaleX(1.7)`, opacity: 0, offset: 0.38 }, { transform: `translateX(${-16 * s}px) scaleX(1.2)`, opacity: 0, offset: 0.39 }, { transform: "translateX(0) scaleX(1)", opacity: 1 }], { duration: 640 });
  if (bar) A(bar, [{ transform: "scaleY(1)" }, { transform: "scaleY(.5)", offset: 0.22 }, { transform: "scaleY(1.2)", offset: 0.55 }, { transform: "scaleY(.95)", offset: 0.8 }, { transform: "scaleY(1)" }], { duration: 640 });
  [q(".et-gh1"), q(".et-gh2")].forEach((g, i) => g && A(g, [{ transform: "translateX(0)", opacity: 0.55 }, { transform: `translateX(${(20 + i * 13) * s}px) scaleX(1.3)`, opacity: 0 }], { duration: 440, delay: i * 70 }));
  btn.querySelectorAll<SVGElement>(".et-sk").forEach((l, i) => {
    l.style.transformOrigin = s > 0 ? "100% 50%" : "0% 50%";
    A(l, [{ transform: "scaleX(0)", opacity: 0.9 }, { transform: "scaleX(1)", opacity: 0.7, offset: 0.4 }, { transform: "scaleX(0)", opacity: 0 }], { duration: 500, delay: 60 + i * 50 });
  });
  if (btn.firstElementChild) A(btn.firstElementChild, [{ transform: "rotateY(0) scale(1)" }, { transform: `rotateY(${26 * s}deg) scale(1.1)`, offset: 0.3 }, { transform: "rotateY(0) scale(1)" }], { duration: 560 });
}

/** Shuffle / repeat: strokes redraw in sequence, stars spin and pop, the icon flips or turns. */
function loopFx(btn: HTMLElement, mode: "flip" | "turn"): void {
  btn.querySelectorAll(".et-cv").forEach((p, i) => A(p, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 520, delay: i * 140, easing: "ease-in-out" }));
  btn.querySelectorAll(".et-st").forEach((s, i) => A(s, [{ transform: "rotate(0) scale(1)" }, { transform: "rotate(180deg) scale(1.9)", offset: 0.5 }, { transform: "rotate(360deg) scale(1)" }], { duration: 640, delay: i * 140 + 100 }));
  const svg = btn.firstElementChild;
  if (!svg) return;
  if (mode === "flip") A(svg, [{ transform: "rotateY(0)" }, { transform: "rotateY(180deg)", offset: 0.5 }, { transform: "rotateY(360deg)" }], { duration: 660, easing: "ease-in-out" });
  else A(svg, [{ transform: "rotate(0) scale(1)" }, { transform: "rotate(180deg) scale(.82)", offset: 0.5 }, { transform: "rotate(360deg) scale(1)" }], { duration: 700, easing: "ease-in-out" });
}

const STAR = "M0-5.5C0-2.25 2.25 0 5.5 0C2.25 0 0 2.25 0 5.5C0 2.25-2.25 0-5.5 0C-2.25 0 0-2.25 0-5.5Z";
const TRI_L = "M38 10Q32 24 38 38Q27 32 17 24Q27 16 38 10Z";
const TRI_R = "M10 10Q16 24 10 38Q21 32 31 24Q21 16 10 10Z";

export function EyeTransport() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const track = usePlayer(shownTrack);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const seek = usePlayer((s) => s.seek);

  const playRef = useRef<HTMLButtonElement>(null);
  const eyeGRef = useRef<SVGGElement>(null);
  const glyphRef = useRef<SVGGElement>(null);
  const tcRef = useRef<HTMLSpanElement>(null);
  const tdRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // The glyph acts like the logo's pupil and follows the pointer; the loop runs only while it travels.
  useEffect(() => {
    let gx = 0, gy = 0, tx = 0, ty = 0, raf = 0, dead = false;
    const frame = () => {
      raf = 0;
      if (dead) return;
      gx += (tx - gx) * 0.15;
      gy += (ty - gy) * 0.15;
      glyphRef.current?.setAttribute("transform", `translate(${gx} ${gy})`);
      if (Math.abs(tx - gx) > 0.02 || Math.abs(ty - gy) > 0.02) raf = requestAnimationFrame(frame);
    };
    const onMove = (e: PointerEvent) => {
      const b = playRef.current;
      if (!b) return;
      const r = b.getBoundingClientRect();
      const vx = e.clientX - (r.left + r.width / 2), vy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(vx, vy) || 1, k = Math.min(1, d / 350);
      tx = (vx / d) * k * 55;
      ty = (vy / d) * k * 10;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      dead = true;
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // A new song: the times tick over.
  const firstTrack = useRef(true);
  useEffect(() => {
    if (firstTrack.current) {
      firstTrack.current = false;
      return;
    }
    for (const el of [tdRef.current, tcRef.current]) {
      if (!el) continue;
      el.classList.remove("et-tick");
      void el.offsetWidth;
      el.classList.add("et-tick");
      el.addEventListener("animationend", () => el.classList.remove("et-tick"), { once: true });
    }
  }, [track?.id]);

  // Seek bar. Dragging is visual; the song is sought once, on release.
  const [drag, setDrag] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  const known = duration > 0;
  const shown = drag ?? (known ? Math.min(position, duration) : position);
  const pct = known ? Math.min(100, Math.max(0, (shown / duration) * 100)) : 0;
  const fromPointer = (e: ReactPointerEvent): number => {
    const r = barRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))) * duration;
  };
  const setDragValue = (v: number | null) => {
    dragRef.current = v;
    setDrag(v);
  };
  const commit = () => {
    const v = dragRef.current;
    setDragValue(null);
    if (v !== null) seek(Math.min(v, duration));
  };

  const onPlay = () => {
    const g = eyeGRef.current;
    if (g) {
      g.classList.remove("blink");
      void g.getBoundingClientRect();
      g.classList.add("blink");
      g.addEventListener("animationend", () => g.classList.remove("blink"), { once: true });
    }
    toggle();
  };
  const skip = (e: ReactMouseEvent<HTMLButtonElement>, s: 1 | -1) => {
    skipFx(e.currentTarget, s);
    if (s < 0) prev();
    else next(true);
  };

  return (
    <div className="et" role="group" aria-label="Playback controls">
      <div className="et-row">
        <button
          className={`et-btn${shuffle ? " on" : ""}`}
          aria-label={shuffle ? "Disable Shuffle" : "Enable Shuffle"}
          aria-pressed={shuffle}
          title={shuffle ? "Disable Shuffle" : "Enable Shuffle"}
          onClick={(e) => {
            loopFx(e.currentTarget, "flip");
            toggleShuffle();
          }}
        >
          <svg className="et-ico" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <path className="et-cv" pathLength={1} strokeDasharray={1} d="M6 14C20 14 26 34 34 34" />
            <path className="et-cv" pathLength={1} strokeDasharray={1} d="M6 34C20 34 26 14 34 14" />
            <g fill="currentColor" stroke="none">
              <g transform="translate(40 14)"><path className="et-st et-tb" d={STAR} /></g>
              <g transform="translate(40 34)"><path className="et-st et-tb" d={STAR} /></g>
            </g>
          </svg>
        </button>

        <button className="et-btn" aria-label="Previous" title="Previous" onClick={(e) => skip(e, -1)}>
          <svg className="et-ico" viewBox="0 0 48 48" fill="currentColor">
            <path className="et-gh et-gh1 et-tb" d={TRI_L} />
            <path className="et-gh et-gh2 et-tb" d={TRI_L} />
            <path className="et-tri et-tb" d={TRI_L} />
            <path className="et-bar-i et-tb" d="M12 9C16 18 16 30 12 39C8 30 8 18 12 9Z" />
            <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <line className="et-sk et-tb" x1="47" y1="16" x2="39" y2="16" />
              <line className="et-sk et-tb" x1="47" y1="32" x2="39" y2="32" />
            </g>
          </svg>
        </button>

        <button
          ref={playRef}
          className={`et-btn et-play${playing ? " playing" : ""}${buffering ? " loading" : ""}`}
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause" : "Play"}
          onClick={onPlay}
        >
          <svg viewBox={EYE_VIEWBOX}>
            <defs>
              <clipPath id={`${uid}a`}><path d={EYE_ALMOND} /></clipPath>
            </defs>
            <path fill="#fff" d={EYE_BODY} />
            <g ref={eyeGRef} className="et-eyeg">
              <path fill="#000" d={EYE_ALMOND} />
              <g clipPath={`url(#${uid}a)`}>
                <g ref={glyphRef} className="et-glyph" fill="#fff">
                  <path className="et-g et-gplay" d="M575 488Q608 600 575 712Q697 668 788 600Q697 532 575 488Z" />
                  <g className="et-g et-gpause">
                    <path d="M588 488C612 555 612 645 588 712C564 645 564 555 588 488Z" />
                    <path d="M666 488C690 555 690 645 666 712C642 645 642 555 666 488Z" />
                  </g>
                </g>
              </g>
            </g>
          </svg>
        </button>

        <button className="et-btn" aria-label="Next" title="Next" onClick={(e) => skip(e, 1)}>
          <svg className="et-ico" viewBox="0 0 48 48" fill="currentColor">
            <path className="et-gh et-gh1 et-tb" d={TRI_R} />
            <path className="et-gh et-gh2 et-tb" d={TRI_R} />
            <path className="et-tri et-tb" d={TRI_R} />
            <path className="et-bar-i et-tb" d="M36 9C40 18 40 30 36 39C32 30 32 18 36 9Z" />
            <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <line className="et-sk et-tb" x1="1" y1="16" x2="9" y2="16" />
              <line className="et-sk et-tb" x1="1" y1="32" x2="9" y2="32" />
            </g>
          </svg>
        </button>

        <button
          className={`et-btn${repeat !== "off" ? " on" : ""}`}
          aria-label={repeat === "off" ? "Enable repeat" : repeat === "all" ? "Enable repeat one" : "Disable repeat"}
          aria-pressed={repeat !== "off"}
          title={repeat === "off" ? "Enable repeat" : repeat === "all" ? "Enable repeat one" : "Disable repeat"}
          onClick={(e) => {
            loopFx(e.currentTarget, "turn");
            cycleRepeat();
          }}
        >
          <svg className="et-ico" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <path className="et-cv" pathLength={1} strokeDasharray={1} d="M9 25V21Q9 12 18 12H32" />
            <path className="et-cv" pathLength={1} strokeDasharray={1} d="M39 23V27Q39 36 30 36H16" />
            <g fill="currentColor" stroke="none">
              <g transform="translate(39 12)"><path className="et-st et-tb" d={STAR} /></g>
              <g transform="translate(9 36)"><path className="et-st et-tb" d={STAR} /></g>
            </g>
          </svg>
          {repeat === "one" && <span className="et-one" aria-hidden>1</span>}
        </button>
      </div>

      <div className="et-prog">
        <span ref={tcRef}>{fmtTime(shown)}</span>
        <div
          ref={barRef}
          className={`et-bar${drag !== null ? " drag" : ""}`}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(shown)}
          aria-valuetext={`${fmtTime(shown)} of ${fmtTime(duration)}`}
          onPointerDown={(e) => {
            if (!known) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragValue(fromPointer(e));
          }}
          onPointerMove={(e) => {
            if (dragRef.current !== null) setDragValue(fromPointer(e));
          }}
          onPointerUp={commit}
          onPointerCancel={() => setDragValue(null)}
        >
          <div className="et-rail"><div className="et-fill" style={{ width: `${pct}%` }} /></div>
          <div className="et-knob" style={{ left: `${pct}%` }}>
            <svg viewBox="0 0 48 48"><path fill="#fff" d="M24 2C24 15 33 24 46 24C33 24 24 33 24 46C24 33 15 24 2 24C15 24 24 15 24 2Z" /></svg>
          </div>
        </div>
        <span ref={tdRef}>{fmtTime(duration)}</span>
      </div>
    </div>
  );
}
