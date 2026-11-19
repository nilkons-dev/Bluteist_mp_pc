/**
 * The Settings categories' icons, each with a small animation of its own that plays while the row is hovered, and once
 * more when the category is picked (the row gets .is-play for a moment). Sound's bars keep going while the pointer is on
 * it and finish their beat before they stop. The motion is in settingsIcons.css.
 */
import "./settingsIcons.css";

type Props = { className?: string };
const cls = (name: string, extra?: string): string => `si si-${name}${extra ? ` ${extra}` : ""}`;

export function AccountIcon({ className }: Props) {
  return (
    <svg aria-hidden className={cls("account", className)} viewBox="0 0 24 24">
      <circle className="si-halo si-ghost" cx="12" cy="12" r="10" />
      <circle className="si-head" cx="12" cy="8" r="4" />
      <path className="si-body" d="M4.5 21c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" />
    </svg>
  );
}

export function PlaybackIcon({ className }: Props) {
  return (
    <svg aria-hidden className={cls("playback", className)} viewBox="0 0 24 24">
      <circle className="si-rr si-ghost" cx="12" cy="12" r="9" />
      <circle className="si-ring" cx="12" cy="12" r="9" pathLength={1} />
      <path className="si-tri" d="M10.2 8.6v6.8l5.6-3.4z" />
    </svg>
  );
}

const BARS: ReadonlyArray<readonly [string, number, number, string]> = [
  ["M2.5 10v4", -0.1, 1.5, ".85s"],
  ["M6 7v10", -0.5, 1.3, "1s"],
  ["M9.5 4v16", -0.3, 1.2, ".8s"],
  ["M13 8v8", -0.7, 1.35, "1.1s"],
  ["M16.5 5.5v13", -0.2, 1.25, ".9s"],
  ["M20 9v6", -0.6, 1.5, ".95s"],
];
export function SoundIcon({ className }: Props) {
  return (
    <svg aria-hidden className={cls("sound", className)} viewBox="0 0 24 24">
      {BARS.map(([d, delay, amp, t]) => (
        <path key={d} className="si-bar" style={{ ["--d" as string]: `${delay}s`, ["--a" as string]: amp, ["--t" as string]: t }} d={d} />
      ))}
    </svg>
  );
}

export function LyricsIcon({ className }: Props) {
  return (
    <svg aria-hidden className={cls("lyrics", className)} viewBox="0 0 24 24">
      <g className="si-mic">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
      </g>
      <path className="si-w si-ghost" style={{ ["--d" as string]: "0s", ["--x" as string]: "-2px" }} d="M4 8.5a4.5 4.5 0 0 0 0 5" />
      <path className="si-w si-ghost" style={{ ["--d" as string]: ".15s", ["--x" as string]: "-4px" }} d="M1.5 7a7 7 0 0 0 0 8" />
      <path className="si-w si-ghost" style={{ ["--d" as string]: "0s", ["--x" as string]: "2px" }} d="M20 8.5a4.5 4.5 0 0 1 0 5" />
      <path className="si-w si-ghost" style={{ ["--d" as string]: ".15s", ["--x" as string]: "4px" }} d="M22.5 7a7 7 0 0 1 0 8" />
    </svg>
  );
}

export function DisplayIcon({ className }: Props) {
  return (
    <svg aria-hidden className={cls("display", className)} viewBox="0 0 24 24">
      <path className="si-pal" d="M12 3a9 9 0 1 0 0 18c1.3 0 1.9-.9 1.6-1.9-.4-1.1.3-2.3 1.5-2.3H17a4 4 0 0 0 4-4c0-5-4-9.8-9-9.8z" />
      <circle className="si-dot" style={{ ["--d" as string]: "0s", ["--c" as string]: "#ff6b6b" }} cx="7.5" cy="11.5" r="1" />
      <circle className="si-dot" style={{ ["--d" as string]: ".1s", ["--c" as string]: "#ffd166" }} cx="10" cy="7.5" r="1" />
      <circle className="si-dot" style={{ ["--d" as string]: ".2s", ["--c" as string]: "#4dabf7" }} cx="14.5" cy="7.8" r="1" />
    </svg>
  );
}

export function LibraryIcon({ className }: Props) {
  return (
    <svg aria-hidden className={cls("library", className)} viewBox="0 0 24 24">
      <path className="si-b1" d="M4.5 4v16" />
      <path className="si-b2" d="M9 4v16" />
      <path className="si-b3" d="M13.5 5.5l5 14.5" />
    </svg>
  );
}

export function DataIcon({ className }: Props) {
  return (
    <svg aria-hidden className={cls("data", className)} viewBox="0 0 24 24">
      <ellipse className="si-top" cx="12" cy="5.5" rx="8" ry="3" />
      <path className="si-m1" d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13" />
      <path className="si-m2" d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
      <circle className="si-bit" cx="12" cy="9" r="1" />
    </svg>
  );
}

export function AboutIcon({ className }: Props) {
  return (
    <svg aria-hidden className={cls("about", className)} viewBox="0 0 24 24">
      <circle className="si-rr si-ghost" cx="12" cy="12" r="9" />
      <circle className="si-circ" cx="12" cy="12" r="9" />
      <path className="si-istem" d="M12 11v5.5" />
      <circle className="si-idot" cx="12" cy="7.8" r=".7" fill="currentColor" />
    </svg>
  );
}
