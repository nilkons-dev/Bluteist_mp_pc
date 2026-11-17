/**
 * The now-playing turntable (the brand's "eye now playing" layout): a record that spins while a song plays, a tonearm
 * that swings onto it, the title and artist, a real-time spectrum read from the audio that is actually playing, and an
 * equalizer switch.
 *
 *  - The record changes only when a different song starts (never mid-song, never on pause, resume or seek): the old one
 *    fades out, the new one fades in, picked at random without repeating.
 *  - The spectrum is the live frequency content of the output (an AnalyserNode in the local audio graph: streams and
 *    files on this computer alike, nothing online). It is still while nothing plays.
 *  - Tapping the record or arm plays / pauses.
 */
import { useEffect, useId, useRef, useState } from "react";
import { usePlayer } from "../stores/player";
import { useLibrary } from "../stores/library";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import { getSpectrumAnalyser } from "../lib/audio";
import { shortTitle } from "../lib/format";
import { trackMenuItems } from "../lib/trackActions";
import { A, STAR, twinkle } from "./eyeFx";
import { DISCS, DISC_LABEL, currentDisc, pickDisc, setCurrentDisc, songBegan } from "./discs";
import type { Track } from "../types";
import "./turntable.css";

const BARS = 30;
const HEART = "M24 40C10 30 6 22 6 16.5C6 11.5 10 8 14.5 8C18.5 8 22 10.5 24 14C26 10.5 29.5 8 33.5 8C38 8 42 11.5 42 16.5C42 22 38 30 24 40Z";
const BASE = 0.04;

export function Turntable({ track }: { track: Track }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const playing = usePlayer((s) => s.playing);
  const toggle = usePlayer((s) => s.toggle);
  const liked = useLibrary((s) => s.liked.some((t) => t.id === track.id));
  const eqEnabled = useSettings((s) => s.eqEnabled);
  const setEqEnabled = useSettings((s) => s.setEqEnabled);

  const [disc, setDisc] = useState(currentDisc);
  const discRef = useRef<SVGGElement>(null);
  const artRef = useRef<SVGImageElement>(null);
  const armRef = useRef<SVGGElement>(null);
  const deckRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const likeRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const eqRef = useRef<HTMLButtonElement>(null);

  /* ---- the record: swapped only when a new song begins ---- */
  const swapping = useRef(false);
  const again = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const changeDisc = async (): Promise<void> => {
    if (swapping.current) {
      again.current = true;
      return;
    }
    swapping.current = true;
    try {
      const next = pickDisc();
      const im = new Image();
      im.src = DISCS[next];
      try {
        await im.decode();
      } catch {
        /* a failed decode just means no pre-warm */
      }
      const art = artRef.current;
      if (!art || !alive.current) return;
      const out = art.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: "forwards" });
      if (out) await out.finished.catch(() => undefined);
      if (!alive.current) return;
      setCurrentDisc(next);
      art.setAttribute("href", DISCS[next]);
      const inn = art.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 420, fill: "forwards" });
      if (inn) await inn.finished.catch(() => undefined);
      art.getAnimations?.().forEach((a) => a.cancel());
      if (alive.current) setDisc(next);
    } finally {
      swapping.current = false;
      if (again.current) {
        again.current = false;
        if (alive.current) void changeDisc();
      }
    }
  };

  useEffect(() => {
    if (songBegan(track.id)) void changeDisc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id]);

  /* ---- motion: record, arm and spectrum share one loop that runs only while something is moving ---- */
  const sim = useRef({ ang: 0, om: 0, arm: 0, last: 0, raf: 0, v: new Array<number>(BARS).fill(BASE), pk: new Array<number>(BARS).fill(BASE) });
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const analyser = useRef<AnalyserNode | null>(null);

  const kick = useRef<() => void>(() => undefined);
  useEffect(() => {
    const S = sim.current;
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d") ?? null;
    let dead = false;

    const size = (): void => {
      if (!cv || !ctx) return;
      const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
      cv.width = Math.max(1, Math.round(r.width * d));
      cv.height = Math.max(1, Math.round(r.height * d));
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    size();
    const ro = typeof ResizeObserver !== "undefined" && cv ? new ResizeObserver(() => { size(); kick.current(); }) : null;
    if (ro && cv) ro.observe(cv);

    const makeBuf = (n: number) => new Uint8Array(n);
    let data = makeBuf(0);
    /** the heard level of each bar: log-spaced bands from ~45 Hz up to ~16 kHz */
    const levels = (): number[] | null => {
      if (!analyser.current) analyser.current = getSpectrumAnalyser();
      const an = analyser.current;
      if (!an) return null;
      if (data.length !== an.frequencyBinCount) data = makeBuf(an.frequencyBinCount);
      an.getByteFrequencyData(data);
      const nyq = an.context.sampleRate / 2, per = nyq / data.length;
      const f0 = 45, f1 = Math.min(16000, nyq * 0.95);
      const out: number[] = [];
      for (let i = 0; i < BARS; i++) {
        const lo = f0 * Math.pow(f1 / f0, i / BARS), hi = f0 * Math.pow(f1 / f0, (i + 1) / BARS);
        const a = Math.max(0, Math.floor(lo / per)), b = Math.max(a, Math.min(data.length - 1, Math.ceil(hi / per) - 1));
        let sum = 0, mx = 0;
        for (let k = a; k <= b; k++) {
          sum += data[k];
          if (data[k] > mx) mx = data[k];
        }
        const avg = sum / (b - a + 1);
        const v = (avg * 0.5 + mx * 0.5) / 255;
        out.push(Math.min(1, Math.pow(v, 1.35) * (0.9 + 0.55 * (i / BARS))));
      }
      return out;
    };

    const draw = (dt: number, live: number[] | null): boolean => {
      if (!cv || !ctx) return false;
      const r = cv.getBoundingClientRect(), W = r.width, H = r.height, gap = 3, w = (W - gap * (BARS - 1)) / BARS;
      ctx.clearRect(0, 0, W, H);
      let moving = false;
      for (let i = 0; i < BARS; i++) {
        const tg = playingRef.current && live ? Math.max(BASE, live[i]) : BASE;
        const before = S.v[i];
        S.v[i] += (tg - S.v[i]) * (tg > S.v[i] ? 0.38 : 0.1);
        S.pk[i] = Math.max(S.v[i], S.pk[i] - dt * 0.4);
        if (Math.abs(S.v[i] - before) > 0.0005 || Math.abs(S.v[i] - tg) > 0.003 || S.pk[i] - S.v[i] > 0.003) moving = true;
        const h = Math.max(3, S.v[i] * (H - 8)), x = i * (w + gap), b = H, c = Math.min(4, h);
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.moveTo(x, b);
        ctx.lineTo(x, b - h + c);
        ctx.quadraticCurveTo(x, b - h, x + w / 2, b - h);
        ctx.quadraticCurveTo(x + w, b - h, x + w, b - h + c);
        ctx.lineTo(x + w, b);
        ctx.fill();
        ctx.fillStyle = "#777";
        ctx.fillRect(x, Math.max(0, b - S.pk[i] * (H - 8) - 6), w, 2);
      }
      return moving;
    };

    const frame = (n: number): void => {
      S.raf = 0;
      if (dead) return;
      const dt = Math.min(0.05, S.last ? (n - S.last) / 1000 : 0.016);
      S.last = n;
      const p = playingRef.current;
      S.om += ((p ? 150 : 0) - S.om) * Math.min(1, dt * (p ? 1.6 : 1.1));
      S.ang = (S.ang + S.om * dt) % 360;
      S.arm += ((p ? 19 : 0) - S.arm) * Math.min(1, dt * 3.2);
      discRef.current?.setAttribute("transform", `rotate(${S.ang.toFixed(2)} 125 152)`);
      armRef.current?.setAttribute("transform", `rotate(${S.arm.toFixed(2)} 264 36)`);
      const barsMoving = draw(dt, p ? levels() : null);
      if (p || barsMoving || S.om > 0.05 || Math.abs(S.arm - (p ? 19 : 0)) > 0.05) S.raf = requestAnimationFrame(frame);
      else S.last = 0;
    };
    kick.current = () => {
      if (!S.raf && !dead) S.raf = requestAnimationFrame(frame);
    };
    kick.current();
    return () => {
      dead = true;
      if (S.raf) cancelAnimationFrame(S.raf);
      S.raf = 0;
      S.last = 0;
      ro?.disconnect();
      kick.current = () => undefined;
    };
  }, []);

  // Play / pause (and any change of the song's state) restarts the loop when it had gone idle.
  useEffect(() => {
    kick.current();
  }, [playing]);

  /* ---- buttons ---- */
  const onDeck = (): void => {
    if (deckRef.current && playing) A(deckRef.current, [{ transform: "translateY(0)" }, { transform: "translateY(1.5px)", offset: 0.4 }, { transform: "translateY(0)" }], { duration: 260 });
    toggle();
  };
  const onLike = (): void => {
    const b = likeRef.current;
    if (b) {
      const h = b.querySelector(".tt-hr");
      if (h) A(h, [{ transform: "scale(1)" }, { transform: "scale(1.32)", offset: 0.25 }, { transform: "scale(.92)", offset: 0.5 }, { transform: "scale(1.14)", offset: 0.72 }, { transform: "scale(1)" }], { duration: 720 });
      b.querySelectorAll(".tt-sp").forEach((s, i) => twinkle(s, 120 + i * 110));
    }
    useLibrary.getState().toggleLike(track);
  };
  const onMore = (): void => {
    const b = moreRef.current;
    b?.querySelectorAll(".tt-dt").forEach((d, i) => A(d, [{ transform: "translateY(0) rotate(0)" }, { transform: "translateY(-7px) rotate(180deg)", offset: 0.4 }, { transform: "translateY(0) rotate(360deg)" }], { duration: 620, delay: i * 110, easing: "ease-in-out" }));
    const r = b?.getBoundingClientRect();
    useUI.getState().openContextMenu(r ? r.right - 8 : window.innerWidth / 2, r ? r.bottom + 4 : window.innerHeight / 2, trackMenuItems(track));
  };
  const KNOBS = [[0, 8], [0, -9], [0, 3]] as const;
  const onEq = (): void => {
    const next = !eqEnabled;
    eqRef.current?.querySelectorAll(".tt-kn").forEach((k, i) => {
      const [a, b] = KNOBS[i] ?? [0, 0];
      const from = next ? a : b, to = next ? b : a;
      A(k, [{ transform: `translateY(${from}px)` }, { transform: `translateY(${to + (next ? -1 : 1) * 2}px)`, offset: 0.7 }, { transform: `translateY(${to}px)` }], { duration: 560, delay: i * 90, easing: "cubic-bezier(.3,.9,.4,1)" });
    });
    setEqEnabled(next);
  };

  const id = (n: string): string => `tt${uid}${n}`;

  return (
    <div className="tt">
      <div className="tt-top">
        <small>NOW PLAYING</small>
        <div className="tt-acts">
          <button ref={likeRef} className={`tt-ib${liked ? " on" : ""}`} aria-label={liked ? "Remove from Liked Songs" : "Add to Liked Songs"} aria-pressed={liked} title={liked ? "Remove from Liked Songs" : "Add to Liked Songs"} onClick={onLike}>
            <svg className="tt-ico" viewBox="0 0 48 48">
              <path className="tt-hr tt-tb" d={HEART} />
              <g transform="translate(40 7) scale(.6)"><path d={STAR} className="tt-st tt-sp tt-tb" /></g>
              <g transform="translate(8 6) scale(.5)"><path d={STAR} className="tt-st tt-sp tt-tb" /></g>
            </svg>
          </button>
          <button ref={moreRef} className="tt-ib" aria-label="More" title="More" aria-haspopup="menu" onClick={onMore}>
            <svg className="tt-ico" viewBox="0 0 48 48">
              {[8, 24, 40].map((x) => (
                <g key={x} transform={`translate(${x} 24) scale(.8)`}><path d={STAR} className="tt-st tt-dt tt-tb" /></g>
              ))}
            </svg>
          </button>
        </div>
      </div>

      <svg ref={deckRef} className="tt-deck" viewBox="0 0 300 270" role="button" tabIndex={0} aria-label={playing ? "Turntable — tap to pause" : "Turntable — tap to play"} onClick={onDeck} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDeck(); } }}>
        <defs>
          <radialGradient id={id("vg")} cx="125" cy="152" r="110" gradientUnits="userSpaceOnUse"><stop offset=".32" stopColor="#101010" /><stop offset=".75" stopColor="#070707" /><stop offset="1" stopColor="#030303" /></radialGradient>
          <linearGradient id={id("w1")} x1="72" y1="60" x2="125" y2="152" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".2" /><stop offset=".7" stopColor="#fff" stopOpacity=".03" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <linearGradient id={id("w2")} x1="178" y1="244" x2="125" y2="152" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#fff" stopOpacity=".2" /><stop offset=".7" stopColor="#fff" stopOpacity=".03" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <clipPath id={id("dc")}><circle cx="125" cy="152" r="110" /></clipPath>
        </defs>
        <g ref={discRef}>
          <circle cx="125" cy="152" r="116" fill="none" stroke="#1c1c1c" strokeWidth="1" />
          <circle cx="125" cy="152" r="110" fill="#000" />
          <image ref={artRef} href={DISCS[disc]} x="15" y="42" width="220" height="220" clipPath={`url(#${id("dc")})`} />
          <circle cx="125" cy="152" r="110" fill="none" stroke="#fff" strokeWidth="2.5" />
        </g>
        <g>
          <circle cx="125" cy="152" r="42" fill="none" stroke="#262626" strokeWidth="1" />
          <circle cx="125" cy="152" r="38" fill="#0a0a0a" stroke="#fff" strokeWidth="1.4" />
          <circle cx="125" cy="152" r="33.5" fill="none" stroke="#3a3a3a" strokeWidth=".8" />
          <image href={DISC_LABEL} x="95" y="130.36" width="60" height="43.29" />
        </g>
        <path d="M47.2 74.2A110 110 0 0 1 96.5 45.8L125 152Z" fill={`url(#${id("w1")})`} />
        <path d="M202.8 229.8A110 110 0 0 1 153.5 258.2L125 152Z" fill={`url(#${id("w2")})`} />
        <g ref={armRef}>
          <path d="M261.5 50L266.5 50L265 220L263 220Z" fill="#fff" />
          <path d="M257 214H271L268 238H260Z" fill="#fff" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
          <rect x="260" y="14" width="8" height="18" rx="2.5" fill="#fff" />
          <circle cx="264" cy="36" r="15" fill="#0c0c0c" stroke="#fff" strokeWidth="2.5" />
          <g transform="translate(264 36) scale(1.1)"><path d={STAR} fill="#fff" /></g>
        </g>
      </svg>

      <h2 className="tt-title" title={track.title}>{shortTitle(track.title)}</h2>
      <p className="tt-artist">{track.artist}</p>
      <canvas ref={canvasRef} className="tt-spec" aria-hidden />
      <button ref={eqRef} className={`tt-eq${eqEnabled ? " on" : ""}`} aria-pressed={eqEnabled} aria-label="Equalizer" title="Equalizer on / off — set the bands in Settings" onClick={onEq}>
        <svg className="tt-ico" viewBox="0 0 48 48">
          <path d="M10 8V40" /><path d="M24 8V40" /><path d="M38 8V40" />
          {[10, 24, 38].map((x, i) => (
            <g key={x} className="tt-kn tt-tb" style={{ transform: `translateY(${eqEnabled ? KNOBS[i][1] : KNOBS[i][0]}px)` }}>
              <g transform={`translate(${x} 24) scale(1.25)`}><path d={STAR} className="tt-st" /></g>
            </g>
          ))}
        </svg>
        <span>Equalizer · {eqEnabled ? "On" : "Off"}</span>
      </button>
    </div>
  );
}
