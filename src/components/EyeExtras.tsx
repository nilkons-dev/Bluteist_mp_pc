/**
 * The player bar's right cluster, in the brand's "eye player extras" layout: sleep timer, lyrics, queue, friends/room,
 * speaker + volume slider, miniplayer and fullscreen. Wired to the real app state (the "on" sparkle mirrors it); the
 * look and the per-icon motion are the brand page's own. Only the last-tapped icon leans toward the pointer.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useRoom } from "../stores/room";
import { usePlayer } from "../stores/player";
import { useSettings } from "../stores/settings";
import { useUI, type MenuItem } from "../stores/ui";
import { SLEEP_MAX_MINUTES, formatSleepLeft, parseSleepMinutes, useSleepTimer } from "../lib/sleepTimer";
import { A, STAR, STAR_KNOB, pop, twinkle } from "./eyeFx";
import "./eyeExtras.css";

const q = (b: Element, s: string): Element | null => b.querySelector(s);
const qa = (b: Element, s: string): Element[] => Array.from(b.querySelectorAll(s));
const MINI_P = "translate(-14px,-7px)";
const MINI_Z = "translate(0,0)";

type Fx = (b: HTMLElement) => void;

const fx: Record<string, Fx> = {
  sleep: (b) => {
    const m = q(b, ".ex-moon");
    if (m) A(m, [{ transform: "rotate(0) scale(1)" }, { transform: "rotate(-32deg) scale(1.1)", offset: 0.35 }, { transform: "rotate(8deg) scale(.97)", offset: 0.7 }, { transform: "rotate(0) scale(1)" }], { duration: 850 });
    pop(q(b, ".ex-st"), 120);
  },
  lyrics: (b) => {
    const h = q(b, ".ex-mh");
    if (h) A(h, [{ transform: "scale(1)" }, { transform: "scale(1.25)", offset: 0.3 }, { transform: "scale(.94)", offset: 0.6 }, { transform: "scale(1)" }], { duration: 650 });
    qa(b, ".ex-wv").forEach((w, i) => A(w, [{ opacity: 1, strokeDashoffset: 1 }, { opacity: 1, strokeDashoffset: 0, offset: 0.5 }, { opacity: 0, strokeDashoffset: 0 }], { duration: 950, delay: i * 130, easing: "ease-out" }));
  },
  queue: (b) => {
    const r = qa(b, ".ex-qb"), e = "ease-in-out";
    if (r[0]) A(r[0], [{ transform: "translateY(0)" }, { transform: "translateY(20px)", offset: 0.5 }, { transform: "translateY(0)" }], { duration: 800, easing: e });
    if (r[2]) A(r[2], [{ transform: "translateY(0)" }, { transform: "translateY(-20px)", offset: 0.5 }, { transform: "translateY(0)" }], { duration: 800, easing: e });
    if (r[1]) A(r[1], [{ transform: "translateX(0) scaleX(1)" }, { transform: "translateX(-3px) scaleX(.75)", offset: 0.5 }, { transform: "translateX(0) scaleX(1)" }], { duration: 800, easing: e });
  },
  people: (b) => {
    const f = q(b, ".ex-pf"), k = q(b, ".ex-pb");
    if (f) A(f, [{ transform: "translateY(0) scale(1)" }, { transform: "translateY(-7px) scale(1.08)", offset: 0.35 }, { transform: "translateY(1px) scale(.96)", offset: 0.65 }, { transform: "translateY(0) scale(1)" }], { duration: 700 });
    if (k) A(k, [{ transform: "translateX(6px)", opacity: 0.2 }, { transform: "translateX(0)", opacity: 0.6 }], { duration: 600, delay: 120 });
    qa(b, ".ex-sp").forEach((s, i) => twinkle(s, 150 + i * 130));
  },
};

export function EyeExtras() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const hideVolumeBar = useSettings((s) => s.hideVolumeBar);
  const lyricsCenter = useUI((s) => s.lyricsCenter);
  const rightPanel = useUI((s) => s.rightPanel);
  const nowPlayingOpen = useUI((s) => s.nowPlayingOpen);
  const toggleLyrics = useUI((s) => s.toggleLyrics);
  const toggleQueue = useUI((s) => s.toggleQueue);
  const toggleRoom = useUI((s) => s.toggleRoom);
  const toggleNowPlaying = useUI((s) => s.toggleNowPlaying);
  const roomCode = useRoom((s) => s.view.state?.code ?? null);

  // Sleep timer: lit while it runs, with the time left beside it.
  const endsAt = useSleepTimer((s) => s.endsAt);
  const endOfSong = useSleepTimer((s) => s.endOfSong);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (endsAt == null) return;
    setNow(performance.now());
    const id = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(id);
  }, [endsAt]);
  const left = endsAt != null ? formatSleepLeft(endsAt - now) : null;
  const sleepStatus = endOfSong ? "Stops after this song" : left ? `Stops in ${left}` : null;

  // The miniplayer is a separate native window (electron/pip.ts); mirror its state.
  const [pipOpen, setPipOpen] = useState(false);
  useEffect(() => {
    const bridge = window.bytune;
    if (!bridge?.pipToggle) return;
    void bridge.pipIsOpen?.().then((open) => setPipOpen(!!open));
    return bridge.onPipOpenChange?.((open) => setPipOpen(open));
  }, []);

  const root = useRef<HTMLDivElement>(null);
  const sleepRef = useRef<HTMLButtonElement>(null);
  const spkRef = useRef<HTMLButtonElement>(null);
  const miniAnim = useRef<Animation | undefined>(undefined);
  const fullAnims = useRef<Animation[]>([]);

  // Settled state wins over a finished animation: drop the fill-forwards once the real state has changed.
  useEffect(() => {
    miniAnim.current?.cancel();
    miniAnim.current = undefined;
  }, [pipOpen]);
  useEffect(() => {
    fullAnims.current.forEach((a) => a.cancel());
    fullAnims.current = [];
  }, [nowPlayingOpen]);

  /* ---- only the last-tapped icon leans toward the pointer while the pointer is on it ---- */
  const lean = useRef<{ live: HTMLElement | null; st: Map<HTMLElement, { x: number; y: number; r: number; tx: number; ty: number; tr: number }>; raf: number }>({
    live: null,
    st: new Map(),
    raf: 0,
  });
  const frame = (): void => {
    const L = lean.current;
    L.raf = 0;
    let busy = false;
    L.st.forEach((s, b) => {
      s.x += (s.tx - s.x) * 0.15;
      s.y += (s.ty - s.y) * 0.15;
      s.r += (s.tr - s.r) * 0.15;
      const svg = b.firstElementChild as SVGElement | null;
      if (svg) {
        svg.style.translate = `${s.x.toFixed(2)}px ${s.y.toFixed(2)}px`;
        svg.style.rotate = `${s.r.toFixed(2)}deg`;
      }
      if (Math.abs(s.tx - s.x) > 0.02 || Math.abs(s.ty - s.y) > 0.02 || Math.abs(s.tr - s.r) > 0.02) busy = true;
    });
    if (busy) L.raf = requestAnimationFrame(frame);
  };
  const kick = (): void => {
    if (!lean.current.raf) lean.current.raf = requestAnimationFrame(frame);
  };
  const stateOf = (b: HTMLElement) => {
    let s = lean.current.st.get(b);
    if (!s) {
      s = { x: 0, y: 0, r: 0, tx: 0, ty: 0, tr: 0 };
      lean.current.st.set(b, s);
    }
    return s;
  };
  const release = (b: HTMLElement | null): void => {
    if (!b) return;
    const s = stateOf(b);
    s.tx = s.ty = s.tr = 0;
    b.style.setProperty("--k", "0");
    kick();
  };
  const setLive = (b: HTMLElement): void => {
    const L = lean.current;
    if (L.live && L.live !== b) {
      release(L.live);
      L.live.removeAttribute("data-live");
    }
    L.live = b;
    b.setAttribute("data-live", "");
  };

  useEffect(() => {
    const L = lean.current;
    const onMove = (e: PointerEvent): void => {
      const b = L.live;
      if (!b) return;
      const r = b.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      if (Math.abs(dx) > r.width / 2 || Math.abs(dy) > r.height / 2) return release(b);
      const d = Math.hypot(dx, dy) || 1, m = Math.min(1, d / 10), s = stateOf(b);
      s.tx = (dx / d) * m * 4.5;
      s.ty = (dy / d) * m * 4.5;
      s.tr = Math.max(-1, Math.min(1, dx / 20)) * 12;
      b.style.setProperty("--k", "1");
      kick();
    };
    const onLeave = (): void => release(L.live);
    window.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      if (L.raf) cancelAnimationFrame(L.raf);
      L.raf = 0;
    };
  }, []);

  /* ---- actions ---- */
  const tap = (e: { currentTarget: HTMLElement }, name: keyof typeof fx): void => {
    setLive(e.currentTarget);
    fx[name](e.currentTarget);
  };

  const openSleepMenu = (): void => {
    const ui = useUI.getState();
    const sleep = useSleepTimer.getState();
    const start = (minutes: number, label: string): void => {
      sleep.start(minutes);
      ui.toast(`Music stops in ${label}`, "info");
    };
    const preset = (minutes: number, label: string): MenuItem => ({ label, action: () => start(minutes, label) });
    const items: MenuItem[] = [
      { label: sleepStatus ?? "Sleep timer", header: true },
      preset(5, "5 minutes"),
      preset(15, "15 minutes"),
      preset(30, "30 minutes"),
      preset(45, "45 minutes"),
      preset(60, "1 hour"),
      preset(120, "2 hours"),
      {
        label: "End of this song",
        action: () => {
          sleep.startEndOfSong();
          ui.toast("Music stops after this song", "info");
        },
      },
      {
        label: "Custom",
        action: () =>
          ui.openDialog({
            title: "Sleep timer",
            body: "Stop the music after how long? Minutes, or hours and minutes like 1:30 — up to 12 hours.",
            initialValue: "60",
            placeholder: "Minutes",
            confirmLabel: "Start",
            onConfirm: (value) => {
              const minutes = parseSleepMinutes(value);
              if (minutes == null || minutes < 1 || minutes > SLEEP_MAX_MINUTES) {
                useUI.getState().toast("Enter a time from 1 minute to 12 hours", "error");
                return;
              }
              start(minutes, formatSleepLeft(minutes * 60_000));
            },
          }),
      },
    ];
    if (sleepStatus) items.push({ label: "Turn off", separatorBefore: true, action: () => sleep.cancel() });
    const rect = sleepRef.current?.getBoundingClientRect();
    ui.openContextMenu(rect?.left ?? window.innerWidth / 2, rect?.top ?? window.innerHeight / 2, items, { above: true });
  };

  const onMini = (e: { currentTarget: HTMLElement }): void => {
    setLive(e.currentTarget);
    const b = e.currentTarget, w = q(b, ".ex-mw"), o = q(b, ".ex-mo");
    const to = pipOpen ? MINI_Z : MINI_P, from = pipOpen ? MINI_P : MINI_Z;
    miniAnim.current?.cancel();
    if (w) miniAnim.current = A(w, [{ transform: `${from} scale(1)` }, { transform: `${to} scale(1.25)`, offset: 0.55 }, { transform: `${to} scale(1)` }], { duration: 620, easing: "cubic-bezier(.34,1.3,.64,1)", fill: "forwards" });
    if (o) A(o, [{ transform: "scale(1)" }, { transform: "scale(1.06,.92)", offset: 0.3 }, { transform: "scale(1)" }], { duration: 520 });
    void window.bytune?.pipToggle();
  };

  const onFull = (e: { currentTarget: HTMLElement }): void => {
    setLive(e.currentTarget);
    const b = e.currentTarget;
    const from = nowPlayingOpen ? 5 : 0, to = nowPlayingOpen ? 0 : 5;
    fullAnims.current.forEach((a) => a.cancel());
    fullAnims.current = qa(b, ".ex-fc")
      .map((c) => A(c, [{ transform: `translate(${from}px,${from}px)` }, { transform: `translate(${to}px,${to}px)` }], { duration: 600, easing: "cubic-bezier(.34,1.5,.64,1)", fill: "forwards" }))
      .filter((a): a is Animation => !!a);
    twinkle(q(b, ".ex-sp"), 120);
    toggleNowPlaying();
  };

  const onSpeaker = (e: { currentTarget: HTMLElement }): void => {
    setLive(e.currentTarget);
    const b = e.currentTarget, slash = q(b, ".ex-slash"), cone = q(b, ".ex-cone");
    if (!muted) {
      if (slash) A(slash, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 420, easing: "ease-out" });
      if (cone) A(cone, [{ transform: "translateX(0)" }, { transform: "translateX(-3px)", offset: 0.2 }, { transform: "translateX(3px)", offset: 0.45 }, { transform: "translateX(-2px)", offset: 0.7 }, { transform: "translateX(0)" }], { duration: 420 });
    } else {
      qa(b, ".ex-a1,.ex-a2").forEach((a, i) => A(a, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 420, delay: i * 110, easing: "ease-out" }));
      if (cone) A(cone, [{ transform: "scale(1)" }, { transform: "scale(1.2)", offset: 0.4 }, { transform: "scale(1)" }], { duration: 480 });
    }
    toggleMute();
  };

  /* ---- volume slider ---- */
  const volRef = useRef<HTMLDivElement>(null);
  const trkRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const shown = muted ? 0 : volume;
  const valueAt = (clientX: number): number => {
    const r = trkRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return volume;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };
  const onVolDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (spkRef.current) {
      setLive(spkRef.current);
      const b = spkRef.current;
      qa(b, ".ex-a1,.ex-a2").forEach((a, i) => A(a, [{ transform: "scale(1)" }, { transform: "scale(1.2)", offset: 0.4 }, { transform: "scale(1)" }], { duration: 420, delay: i * 60 }));
      const cone = q(b, ".ex-cone");
      if (cone) A(cone, [{ transform: "scale(1)" }, { transform: "scale(1.12)", offset: 0.4 }, { transform: "scale(1)" }], { duration: 420 });
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    setDrag(true);
    setVolume(valueAt(e.clientX));
  };
  const onVolMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (drag) setVolume(valueAt(e.clientX));
  };
  const onVolKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = e.shiftKey ? 0.1 : 0.05;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") setVolume(shown + step);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") setVolume(shown - step);
    else if (e.key === "Home") setVolume(0);
    else if (e.key === "End") setVolume(1);
    else return;
    e.preventDefault();
  };

  const on = (v: boolean): string => `ex-btn${v ? " on" : ""}`;
  const roomOn = rightPanel === "room" || !!roomCode;

  return (
    <div className="ex" ref={root}>
      <button ref={sleepRef} className={on(!!sleepStatus)} aria-label={sleepStatus ? `Sleep timer: ${sleepStatus.toLowerCase()}` : "Sleep timer"} title={sleepStatus ?? "Sleep timer"} aria-haspopup="menu" onClick={(e) => { tap(e, "sleep"); openSleepMenu(); }}>
        <svg viewBox="0 0 48 48">
          <g className="ex-moon ex-tb"><path d="M42 25.58A18 18 0 1 1 22.42 6A14 14 0 0 0 42 25.58Z" /></g>
          <g transform="translate(37 11) scale(.75)"><path className="ex-st ex-tb" d={STAR} /></g>
        </svg>
      </button>
      {left && <span className="ex-left">{left}</span>}

      <button className={on(lyricsCenter)} aria-label="Lyrics" title="Lyrics" aria-pressed={lyricsCenter} onClick={(e) => { tap(e, "lyrics"); toggleLyrics(); }}>
        <svg viewBox="0 0 48 48">
          <path className="ex-wv" pathLength={1} strokeDasharray={1} d="M8 12Q4 18 8 24" />
          <path className="ex-wv" pathLength={1} strokeDasharray={1} d="M40 12Q44 18 40 24" />
          <path className="ex-mh ex-tb" d="M24 5C31 12 31 22 24 28C17 22 17 12 24 5Z" />
          <path d="M14 23Q14 34 24 34Q34 34 34 23" /><path d="M24 34V42" /><path d="M18 42H30" />
        </svg>
      </button>

      <button className={on(rightPanel === "queue")} aria-label="Queue" title="Queue" aria-pressed={rightPanel === "queue"} onClick={(e) => { tap(e, "queue"); toggleQueue(); }}>
        <svg viewBox="0 0 48 48">
          <g className="ex-qb ex-tb"><path d="M10 14H38" /></g>
          <g className="ex-qb ex-tb"><path d="M10 24H38" /></g>
          <g className="ex-qb ex-tb"><path d="M10 34H24" /><g transform="translate(34 34) scale(.8)"><path className="ex-st" d={STAR} /></g></g>
        </svg>
      </button>

      <button className={on(roomOn)} aria-label={roomCode ? `Room ${roomCode}` : "Room"} title={roomCode ? `Room ${roomCode}` : "Room"} aria-pressed={roomOn} onClick={(e) => { tap(e, "people"); toggleRoom(); }}>
        <svg viewBox="0 0 48 48">
          <g transform="translate(-1 0)">
            <g className="ex-pb ex-tb" opacity=".6"><circle cx="35" cy="17" r="4.5" /><path d="M34 27.5C39 28.5 42 32 42 38" /></g>
            <g className="ex-pf ex-tb"><circle cx="20" cy="18" r="5.5" /><path d="M8 40C8 32 13 27.5 20 27.5C27 27.5 32 32 32 40" /></g>
          </g>
          <g transform="translate(40 7) scale(.6)"><path className="ex-st ex-sp ex-tb" d={STAR} /></g>
          <g transform="translate(8 8) scale(.7)"><path className="ex-st ex-sp ex-tb" d={STAR} /></g>
        </svg>
      </button>

      {!hideVolumeBar && (
        <div className="ex-vwrap">
          <button ref={spkRef} className="ex-btn" aria-label={muted ? "Unmute" : "Mute"} title={muted ? "Unmute" : "Mute"} onClick={onSpeaker}>
            <svg viewBox="0 0 48 48">
              <g transform="translate(-1.5 0)">
                <g className="ex-cone ex-tb"><path d="M8 19H15L25 10Q22 24 25 38L15 29H8Z" /></g>
                <path className="ex-a1" pathLength={1} strokeDasharray={1} style={{ opacity: shown > 0 ? 1 : 0 }} d="M31 19Q35 24 31 29" />
                <path className="ex-a2" pathLength={1} strokeDasharray={1} style={{ opacity: shown > 0.45 ? 1 : 0 }} d="M35 13Q43 24 35 35" />
                <path className="ex-slash" pathLength={1} strokeDasharray={1} style={{ opacity: shown === 0 ? 1 : 0 }} d="M32 19L42 29M42 19L32 29" />
              </g>
            </svg>
          </button>
          <div
            ref={volRef}
            className={`ex-vol${drag ? " drag" : ""}`}
            role="slider"
            tabIndex={0}
            aria-label="Volume"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(shown * 100)}
            onPointerDown={onVolDown}
            onPointerMove={onVolMove}
            onPointerUp={() => setDrag(false)}
            onPointerCancel={() => setDrag(false)}
            onKeyDown={onVolKey}
          >
            <div className="ex-trk" ref={trkRef}>
              <div className="ex-rail"><div className="ex-vf" style={{ width: `${shown * 100}%` }} /></div>
              <div className="ex-vk" style={{ left: `${shown * 100}%` }}>
                <svg viewBox="0 0 48 48"><path d={STAR_KNOB} style={{ fill: "#fff", stroke: "#000", strokeWidth: 5, paintOrder: "stroke", strokeLinejoin: "round" }} /></svg>
              </div>
            </div>
          </div>
        </div>
      )}

      <button className={on(pipOpen)} aria-label={pipOpen ? "Close Miniplayer" : "Open Miniplayer"} title={pipOpen ? "Close Miniplayer" : "Open Miniplayer"} aria-pressed={pipOpen} onClick={onMini}>
        <svg viewBox="0 0 48 48">
          <rect className="ex-mo ex-tb" x="6" y="11" width="36" height="26" rx="5" />
          <rect className="ex-mw ex-tb" x="25" y="23" width="12" height="9" rx="2" fill="currentColor" stroke="none" style={{ transform: pipOpen ? MINI_P : MINI_Z }} />
        </svg>
      </button>

      <button className={on(nowPlayingOpen)} aria-label={nowPlayingOpen ? "Exit Full screen" : "Enter Full screen"} title={nowPlayingOpen ? "Exit Full screen" : "Enter Full screen"} aria-pressed={nowPlayingOpen} onClick={onFull}>
        <svg viewBox="0 0 48 48">
          <g className="ex-fg ex-tb">
            {[0, 90, 180, 270].map((deg) => (
              <g key={deg} transform={deg ? `rotate(${deg} 24 24)` : undefined}>
                <path className="ex-fc ex-tb" style={{ transform: nowPlayingOpen ? "translate(5px,5px)" : "translate(0,0)" }} d="M6 16V10Q6 6 10 6H16" />
              </g>
            ))}
          </g>
          <g transform="translate(24 24) scale(.7)"><path className="ex-st ex-sp ex-tb" d={STAR} /></g>
        </svg>
      </button>
    </div>
  );
}
