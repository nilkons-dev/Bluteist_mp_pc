/**
 * Floating windows over the app: the equalizer (opened from the now-playing panel), About (opened from the library's
 * footer) and the profile picture (opened from Settings). One host, rendered once in App; `useUI.floating` says which is open. Escape or a click outside closes.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import { Switch } from "./primitives";
import { EqualizerBoard } from "./EqualizerBoard";
import { STAR } from "./eyeFx";
import { ProfileAvatar } from "./ProfileAvatar";
import { AboutBody } from "./AboutBody";
import { AVATARS, builtInChoice, customChoice, randomAvatarChoice } from "../lib/avatars";
import { useMyAvatar } from "../stores/avatar";
import { pickCoverImage } from "../lib/coverImage";
import brandLogo from "../assets/brand/blutheist-logo.svg";
import brandText from "../assets/brand/blutheist-wordmark.png";
import "./floating.css";

function Shell({ id, title, wide, right, children }: { id: string; title: string; wide?: boolean; right?: ReactNode; children: ReactNode }) {
  const close = useUI((s) => s.closeFloating);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const t = window.setTimeout(() => ref.current?.focus(), 30);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.clearTimeout(t);
    };
  }, [close]);
  return (
    <div className="fw-back" onMouseDown={close} role="presentation">
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} className={`fw-win${wide ? " fw-wide" : ""}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="fw-head">
          <h2 id={id}>{title}</h2>
          <div className="fw-right">
            {right}
            <button type="button" className="fw-x" aria-label="Close" title="Close" onClick={close}>
              <svg viewBox="0 0 48 48" aria-hidden>
                <path d="M12 12L36 36M36 12L12 36" />
              </svg>
            </button>
          </div>
        </div>
        <div className="fw-body">{children}</div>
      </div>
    </div>
  );
}

function EqualizerWindow() {
  const enabled = useSettings((s) => s.eqEnabled);
  const setEqEnabled = useSettings((s) => s.setEqEnabled);
  const flat = useSettings((s) => s.eqGains.every((g) => g === 0));
  return (
    <Shell
      id="fw-eq"
      title="Equalizer"
      wide
      right={
        <label className="fw-sw">
          <span>{enabled ? "On" : "Off"}</span>
          <Switch checked={enabled} onChange={setEqEnabled} label="Equalizer" />
        </label>
      }
    >
      <p className="fw-lede">Shape the sound with ten bands. Turn it on, pick a preset or drag the sliders; double-click a slider to zero it.</p>
      <EqualizerBoard />
      <div className="fw-foot">
        <button type="button" className="fw-btn" disabled={!enabled || flat} onClick={() => useSettings.getState().setEqGains(Array(10).fill(0))}>
          Reset to flat
        </button>
      </div>
    </Shell>
  );
}

function AboutWindow() {
  const versions = window.bytune?.versions;
  return (
    <Shell id="fw-about" title="About Blutheist">
      <div className="fw-about">
        <img src={brandLogo} alt="" aria-hidden className="fw-mark" />
        <img src={brandText} alt="Blutheist" className="fw-word" />
        <p className="fw-ver">Version {versions?.app ?? "1.1.1"}</p>
        <AboutBody />
        <div className="fw-foot is-center">
          <button type="button" className="fw-btn is-solid" onClick={() => useUI.getState().closeFloating()}>
            Close
          </button>
        </div>
      </div>
    </Shell>
  );
}

function AvatarWindow() {
  const { choice, change } = useMyAvatar();
  const [busy, setBusy] = useState(false);
  const own = choice?.startsWith("c:") ?? false;
  const fromFile = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const img = await pickCoverImage();
      if (img) change(customChoice(img));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell id="fw-avatar" title="Profile picture">
      <div className="av-win">
        <ProfileAvatar size={96} className="av-big" />
        <p className="fw-lede">Pick one of these, or use a picture from your computer. It is kept on this computer.</p>
        <div className="av-grid" role="group" aria-label="Pictures">
          {AVATARS.map((a) => {
            const on = choice === builtInChoice(a.id);
            return (
              <button key={a.id} type="button" className={`av-opt${on ? " on" : ""}`} aria-pressed={on} aria-label={a.name} title={a.name} onClick={() => change(builtInChoice(a.id))}>
                <img src={a.src} alt="" draggable={false} />
              </button>
            );
          })}
        </div>
        <div className="fw-foot is-center">
          <button type="button" className={`fw-btn${own ? " is-solid" : ""}`} disabled={busy} onClick={() => void fromFile()}>
            {own ? "Choose another file…" : "Choose from files…"}
          </button>
          <button type="button" className="fw-btn" onClick={() => change(randomAvatarChoice())}>
            Surprise me
          </button>
          <button type="button" className="fw-btn is-solid" onClick={() => useUI.getState().closeFloating()}>
            Done
          </button>
        </div>
      </div>
    </Shell>
  );
}

export function FloatingWindows() {
  const floating = useUI((s) => s.floating);
  if (floating === "eq") return <EqualizerWindow />;
  if (floating === "about") return <AboutWindow />;
  if (floating === "avatar") return <AvatarWindow />;
  return null;
}
