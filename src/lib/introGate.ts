/**
 * The launch intro (public/intro.js, src/intro.ts) animates on the same thread the app boots on, so network and
 * parsing work that is not needed for the first picture waits until the show has handed over. Everything that is
 * needed to paint stays untouched: Home's first draw comes from caches, and only the fetching behind it is held.
 */

/** True while the intro is on screen (index.html's `html.intro`, removed by src/intro.ts at the very end). */
export function introPlaying(): boolean {
  return document.documentElement.classList.contains("intro");
}

/** Never held longer than this, whatever happens to the intro. */
const CAP_MS = 15_000;

/** Resolves at once when there is no intro, otherwise as soon as it has handed over (or after CAP_MS). */
export function afterIntro(): Promise<void> {
  if (!introPlaying()) return Promise.resolve();
  return new Promise((resolve) => {
    const html = document.documentElement;
    let timer = 0;
    const observer = new MutationObserver(() => {
      if (!introPlaying()) done();
    });
    function done(): void {
      observer.disconnect();
      window.clearTimeout(timer);
      // One beat after the hand-over, so the first frames of the app are not shared with a burst of parsing.
      window.setTimeout(resolve, 120);
    }
    observer.observe(html, { attributes: true, attributeFilter: ["class"] });
    timer = window.setTimeout(done, CAP_MS);
  });
}
