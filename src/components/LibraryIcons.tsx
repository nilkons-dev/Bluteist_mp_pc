/**
 * The bold eye-style icons of Your Library (the brand's "eye library icons" page): solid glyphs on a 48×48 grid,
 * cut-outs painted in the panel colour (--lb-cut). Each part carries a class its click animation targets (libraryFx).
 */
import { STAR } from "./eyeFx";

export type LibIconKind = "overview" | "spotify" | "replay" | "local" | "liked" | "downloads" | "playlist" | "folder" | "about" | "settings";

const sw = (w: number) => ({ stroke: "currentColor", strokeWidth: w, strokeLinejoin: "round" as const });

export function LibIcon({ kind, on = false }: { kind: LibIconKind; on?: boolean }) {
  switch (kind) {
    case "overview":
      return (
        <svg className="lb-ico" viewBox="0 0 48 48" aria-hidden>
          <g className="lb-ho lb-tb"><path d="M24 6.5L5.5 22.5H10.5V40.5H20V30H28V40.5H37.5V22.5H42.5Z" {...sw(2.4)} /></g>
        </svg>
      );
    case "spotify":
      return (
        <svg className="lb-ico" viewBox="0 0 48 48" aria-hidden>
          <g className="lb-ci lb-tb"><circle cx="24" cy="24" r="19" /></g>
          <g fill="none" stroke="var(--lb-cut)" strokeWidth="3.4" strokeLinecap="round">
            <path className="lb-sa" pathLength={1} strokeDasharray={1} d="M13.5 19Q24 14.5 34.5 20" />
            <path className="lb-sa" pathLength={1} strokeDasharray={1} d="M16 26.5Q24 23 32 27.5" />
            <path className="lb-sa" pathLength={1} strokeDasharray={1} d="M18.5 33Q24 30.5 29.5 33.5" />
          </g>
        </svg>
      );
    case "replay":
      return (
        <svg className="lb-ico" viewBox="0 0 48 48" aria-hidden>
          <rect className="lb-rb lb-tb" x="8" y="26" width="9" height="13" rx="3" />
          <rect className="lb-rb lb-tb" x="19.5" y="13" width="9" height="26" rx="3" />
          <rect className="lb-rb lb-tb" x="31" y="20" width="9" height="19" rx="3" />
          <g transform="translate(24 6.5) scale(.7)"><path d={STAR} className="lb-st lb-sp lb-tb" /></g>
        </svg>
      );
    case "local":
    case "folder":
      return (
        <svg className="lb-ico" viewBox="0 0 48 48" aria-hidden>
          <path className="lb-fo lb-tb" d="M6 15Q6 10 11 10H18L23 15H37Q42 15 42 20V34Q42 39 37 39H11Q6 39 6 34Z" />
          {kind === "local" && (
            <g className="lb-nt lb-tb" fill="var(--lb-cut)" stroke="var(--lb-cut)" strokeWidth="2.4" strokeLinecap="round">
              <circle cx="21" cy="31" r="3" stroke="none" />
              <path d="M24 31V22L30 20.5" fill="none" />
            </g>
          )}
        </svg>
      );
    case "liked":
      return (
        <svg className="lb-ico" viewBox="0 0 48 48" aria-hidden>
          <g className={`lb-hr lb-tb${on ? " on" : ""}`} {...sw(2)}><path d="M24 40C10 30 6 22 6 16.5C6 11.5 10 8 14.5 8C18.5 8 22 10.5 24 14C26 10.5 29.5 8 33.5 8C38 8 42 11.5 42 16.5C42 22 38 30 24 40Z" /></g>
          <g transform="translate(40 7) scale(.6)"><path d={STAR} className="lb-st lb-sp lb-tb" /></g>
          <g transform="translate(8 6) scale(.5)"><path d={STAR} className="lb-st lb-sp lb-tb" /></g>
        </svg>
      );
    case "downloads":
      return (
        <svg className="lb-ico" viewBox="0 0 48 48" aria-hidden>
          <g className="lb-da lb-tb"><path d="M20 7H28V21H34.5L24 33L13.5 21H20Z" {...sw(2)} /></g>
          <rect className="lb-tr lb-tb" x="9" y="37" width="30" height="4.5" rx="2.25" />
        </svg>
      );
    case "playlist":
      return (
        <svg className="lb-ico" viewBox="0 0 48 48" aria-hidden>
          <rect className="lb-pb lb-tb" x="8" y="9" width="32" height="6" rx="3" />
          <rect className="lb-pb lb-tb" x="8" y="20" width="32" height="6" rx="3" />
          <rect className="lb-pb lb-tb" x="8" y="31" width="16" height="6" rx="3" />
          <path className="lb-pt lb-tb" d="M30 29.5L42 35.5L30 41.5Z" {...sw(2)} />
        </svg>
      );
    case "about":
      return (
        <svg className="lb-ico" viewBox="0 0 48 48" aria-hidden>
          <g className="lb-ci lb-tb"><circle cx="24" cy="24" r="19" /></g>
          <circle className="lb-ad lb-tb" cx="24" cy="15.5" r="3" fill="var(--lb-cut)" />
          <rect className="lb-as" x="21.5" y="21.5" width="5" height="14.5" rx="2.5" fill="var(--lb-cut)" />
        </svg>
      );
    case "settings":
      return (
        <svg className="lb-ico" viewBox="0 0 48 48" aria-hidden>
          <g className="lb-gr lb-tb">
            <circle cx="24" cy="24" r="12.5" />
            {[0, 45, 90, 135].map((d) => (
              <rect key={d} x="20.5" y="5" width="7" height="38" rx="2.5" transform={d ? `rotate(${d} 24 24)` : undefined} />
            ))}
            <circle cx="24" cy="24" r="5.5" fill="var(--lb-cut)" />
          </g>
        </svg>
      );
  }
}

export function PinGlyph() {
  return (
    <svg className="lb-ico" viewBox="0 0 48 48" aria-hidden>
      <g className="lb-pg lb-tb">
        <path className="lb-pn" d="M17 8H31L29 20L35 27H13L19 20Z" {...sw(2)} />
        <path d="M24 27V41" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function BookGlyph() {
  return (
    <svg className="lb-ico lb-book" viewBox="0 0 48 48" aria-hidden>
      <rect x="8" y="9" width="7" height="30" rx="2.2" />
      <rect x="18" y="9" width="7" height="30" rx="2.2" />
      <path className="lb-lean lb-tb" d="M28 12L34.5 10L41 36L34.5 38Z" {...sw(1.6)} />
    </svg>
  );
}

export function PlusGlyph() {
  return (
    <svg className="lb-ico" viewBox="0 0 48 48" aria-hidden>
      <g className="lb-pl lb-tb">
        <rect x="21" y="8" width="6" height="32" rx="3" />
        <rect x="8" y="21" width="32" height="6" rx="3" />
      </g>
    </svg>
  );
}
