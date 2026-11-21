/**
 * The Discord row's icon: a small speech-bubble mascot drawn in the same line style as the Settings icons, so it takes the
 * theme's colours. Its eyes blink and the bubble wobbles while the row is hovered, and while Discord is connected it keeps
 * a slow glow (.is-live). The motion is in discordIcon.css and only moves transforms and opacity.
 */
import "./discordIcon.css";

export function DiscordIcon({ className = "", live = false }: { className?: string; live?: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`dc-icon${live ? " is-live" : ""} ${className}`}>
      <circle className="dc-halo" cx="12" cy="11.5" r="9.5" />
      <path
        className="dc-body"
        d="M6 6.1C7.6 5.2 9.6 4.6 12 4.6s4.4.6 6 1.5c1.5 2.5 2.4 5.2 2.6 8.3-1.3 1.2-2.9 2-4.6 2.5l-1.1-1.7c-1 .3-2 .4-2.9.4s-1.9-.1-2.9-.4L8 17.9c-1.7-.5-3.3-1.3-4.6-2.5.2-3.1 1.1-5.8 2.6-8.3z"
      />
      <ellipse className="dc-eye dc-eye-l" cx="9.1" cy="11.3" rx="1.25" ry="1.6" />
      <ellipse className="dc-eye dc-eye-r" cx="14.9" cy="11.3" rx="1.25" ry="1.6" />
    </svg>
  );
}
