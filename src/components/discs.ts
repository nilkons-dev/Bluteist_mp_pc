/** The ten record sleeves of the now-playing turntable, and the centre label every record carries. */
import d01 from "../assets/discs/01-pink-lilies.png";
import d02 from "../assets/discs/02-sun-and-moon.png";
import d03 from "../assets/discs/03-white-lily.png";
import d04 from "../assets/discs/04-koi-fish.png";
import d05 from "../assets/discs/05-stars.png";
import d06 from "../assets/discs/06-ladybug.png";
import d07 from "../assets/discs/07-playing-cards.png";
import d08 from "../assets/discs/08-roses.png";
import d09 from "../assets/discs/09-fractal.png";
import d10 from "../assets/discs/10-violet-flowers.png";
import label from "../assets/discs/label.webp";

export const DISCS: readonly string[] = [d01, d02, d03, d04, d05, d06, d07, d08, d09, d10];
export const DISC_LABEL: string = label;

/**
 * Which record is on the deck. It lives outside the component so the panel closing and reopening (queue, room) keeps
 * the same record for the same song; it changes only when a different song starts.
 */
let current = Math.floor(Math.random() * DISCS.length);
let bag: number[] = [];
let lastSong: string | null = null;

/** The record now on the deck. */
export const currentDisc = (): number => current;

/** A shuffled bag, so every record is shown before any repeats, and never the same one twice in a row. */
export function pickDisc(): number {
  if (!bag.length) {
    bag = DISCS.map((_, i) => i).filter((i) => i !== current);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag.pop() as number;
}

export const setCurrentDisc = (i: number): void => {
  current = i;
};

/**
 * Tells the deck a song is showing. True exactly when a different song than the last one began, i.e. when the record
 * should be swapped; the first song of the session keeps the record already on the deck.
 */
export function songBegan(id: string): boolean {
  const changed = lastSong !== null && lastSong !== id;
  lastSong = id;
  return changed;
}
