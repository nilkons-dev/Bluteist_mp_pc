/**
 * What About says, in the window and in Settings alike: the line under the name, a short introduction, the four things
 * Blutheist is built around, and the closing line.
 */
import { STAR } from "./eyeFx";
import "./about.css";

export const ABOUT_TAGLINE = "Beyond Music. Beyond Ordinary.";
const INTRO =
  "Blutheist is a thoughtfully engineered desktop music player built around the art of listening. Combining a refined dark interface with powerful audio features, it delivers a seamless environment where your music takes center stage. Every element is designed with purpose, bringing together performance, personalization, and simplicity to create a listening experience that feels entirely your own.";
export const ABOUT_SECTIONS: ReadonlyArray<readonly [string, string]> = [
  [
    "Your Music, Your Library",
    "Take complete control of your music collection. Organize your tracks, curate personal playlists, save your favorites, and access your downloaded music through a unified library designed for effortless navigation and complete convenience.",
  ],
  [
    "Precision in Every Sound",
    "Experience your music with greater depth and control. Shape your sound using a powerful 10-band equalizer and immerse yourself in a dynamic audio visualizer that transforms real-time sound into a captivating visual experience.",
  ],
  [
    "Lyrics in Perfect Sync",
    "Stay connected to every moment of your music. Follow synchronized lyrics as each song plays, with adjustable timing controls that let you fine-tune the experience and keep every line perfectly aligned.",
  ],
  [
    "Privacy Without Compromise",
    "Your music belongs to you, and your experience should remain personal. Start listening without creating an account. Your music library and personal settings remain on your computer, giving you a more private and independent listening environment.",
  ],
];
export const ABOUT_CLOSING = "Built with Purpose. Designed for Music. Defined by You.";

export function AboutBody() {
  return (
    <div className="ab-body">
      <p className="ab-tag">{ABOUT_TAGLINE}</p>
      <p className="ab-intro">{INTRO}</p>
      <ul className="ab-list">
        {ABOUT_SECTIONS.map(([t, d]) => (
          <li key={t}>
            <svg viewBox="-6 -6 12 12" aria-hidden>
              <path d={STAR} />
            </svg>
            <span>
              <b>{t}</b>
              {d}
            </span>
          </li>
        ))}
      </ul>
      <p className="ab-closing">{ABOUT_CLOSING}</p>
    </div>
  );
}
