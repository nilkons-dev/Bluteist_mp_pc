/**
 * The middle panel's glow: a soft, light grey-white haze across the top of the panel, fading down into it. It is always
 * that, whatever is playing or whichever card the pointer is on: a cover's own colours do not tint the page. Not on the
 * artist page (its hero is its own artwork) or Settings.
 */
import { useUI } from "../stores/ui";

/** Kept for the callers that wait for a glow to change; the glow no longer changes. */
export const GLOW_FADE_MS = 600;

export function CoverGlow() {
  const viewName = useUI((s) => s.view.name);
  if (viewName === "artist" || viewName === "settings") return null;
  return (
    <div aria-hidden className="cover-glow cover-glow-neutral pointer-events-none absolute inset-x-0 top-0 h-[360px]">
      <div className="cover-glow-grain" />
    </div>
  );
}
