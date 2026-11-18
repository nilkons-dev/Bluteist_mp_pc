/**
 * The twenty profile pictures that come with the app. Everyone gets one at random when their profile is made
 * (a guest's, a new account's) and can change it later, to another of these or to a picture of their own.
 */
import a01 from "../assets/avatars/01_raven_moon.webp";
import a02 from "../assets/avatars/02_red_cassette.webp";
import a03 from "../assets/avatars/03_dj_turntable.webp";
import a04 from "../assets/avatars/04_electric_guitar.webp";
import a05 from "../assets/avatars/05_oni_mask.webp";
import a06 from "../assets/avatars/06_wolf_eclipse.webp";
import a07 from "../assets/avatars/07_piano_keys.webp";
import a08 from "../assets/avatars/08_black_rose.webp";
import a09 from "../assets/avatars/09_neon_city.webp";
import a10 from "../assets/avatars/10_robot_microphone.webp";
import a11 from "../assets/avatars/11_mystic_moth.webp";
import a12 from "../assets/avatars/12_fox_speaker.webp";
import a13 from "../assets/avatars/13_prism_waveform.webp";
import a14 from "../assets/avatars/14_crowned_skull.webp";
import a15 from "../assets/avatars/15_metronome.webp";
import a16 from "../assets/avatars/16_koi_moon.webp";
import a17 from "../assets/avatars/17_pocket_watch.webp";
import a18 from "../assets/avatars/18_red_violin.webp";
import a19 from "../assets/avatars/19_night_butterfly.webp";
import a20 from "../assets/avatars/20_radio_tower.webp";

export interface BuiltInAvatar {
  id: string;
  name: string;
  src: string;
}

export const AVATARS: ReadonlyArray<BuiltInAvatar> = [
  { id: "01_raven_moon", name: "Raven Moon", src: a01 },
  { id: "02_red_cassette", name: "Red Cassette", src: a02 },
  { id: "03_dj_turntable", name: "Dj Turntable", src: a03 },
  { id: "04_electric_guitar", name: "Electric Guitar", src: a04 },
  { id: "05_oni_mask", name: "Oni Mask", src: a05 },
  { id: "06_wolf_eclipse", name: "Wolf Eclipse", src: a06 },
  { id: "07_piano_keys", name: "Piano Keys", src: a07 },
  { id: "08_black_rose", name: "Black Rose", src: a08 },
  { id: "09_neon_city", name: "Neon City", src: a09 },
  { id: "10_robot_microphone", name: "Robot Microphone", src: a10 },
  { id: "11_mystic_moth", name: "Mystic Moth", src: a11 },
  { id: "12_fox_speaker", name: "Fox Speaker", src: a12 },
  { id: "13_prism_waveform", name: "Prism Waveform", src: a13 },
  { id: "14_crowned_skull", name: "Crowned Skull", src: a14 },
  { id: "15_metronome", name: "Metronome", src: a15 },
  { id: "16_koi_moon", name: "Koi Moon", src: a16 },
  { id: "17_pocket_watch", name: "Pocket Watch", src: a17 },
  { id: "18_red_violin", name: "Red Violin", src: a18 },
  { id: "19_night_butterfly", name: "Night Butterfly", src: a19 },
  { id: "20_radio_tower", name: "Radio Tower", src: a20 },
];

/**
 * A saved choice is text: "b:" + the id of one of the pictures above, or "c:" + a picture of the person's own
 * (a small data: image). Anything else is not a choice.
 */
export type AvatarChoice = string;
const CUSTOM_MAX = 400_000;

export function isAvatarChoice(v: unknown): v is AvatarChoice {
  if (typeof v !== "string") return false;
  if (v.startsWith("b:")) return AVATARS.some((a) => a.id === v.slice(2));
  return v.startsWith("c:data:image/") && v.length <= CUSTOM_MAX;
}

export const builtInChoice = (id: string): AvatarChoice => `b:${id}`;
export const customChoice = (dataUrl: string): AvatarChoice => `c:${dataUrl}`;

/** The picture a choice stands for; null for a choice that is not one. */
export function avatarSrc(choice: AvatarChoice | null | undefined): string | null {
  if (!isAvatarChoice(choice)) return null;
  if (choice.startsWith("c:")) return choice.slice(2);
  return AVATARS.find((a) => a.id === choice.slice(2))?.src ?? null;
}

/** One of the twenty, at random (the number source is a parameter so a test can steer it). */
export function randomAvatarChoice(rand: () => number = Math.random): AvatarChoice {
  const i = Math.min(AVATARS.length - 1, Math.max(0, Math.floor(rand() * AVATARS.length)));
  return builtInChoice(AVATARS[i].id);
}

/** Whose picture it is: an account by its username, a guest as "guest"; null while no one is signed in. */
export function avatarKey(mode: "guest" | "account" | null, username: string | null): string | null {
  if (mode === "account") return username?.trim() ? `a:${username.trim().toLowerCase()}` : null;
  return mode === "guest" ? "guest" : null;
}
