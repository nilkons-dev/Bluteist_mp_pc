/**
 * The ten profile pictures that come with the app. Everyone gets one at random when their profile is made
 * (a guest's, a new account's) and can change it later, to another of these or to a picture of their own.
 */
import a01 from "../assets/avatars/01_leaping_cat.webp";
import a02 from "../assets/avatars/02_big_ears.webp";
import a03 from "../assets/avatars/03_sleepy_cat.webp";
import a04 from "../assets/avatars/04_hypno_cat.webp";
import a05 from "../assets/avatars/05_curious_cat.webp";
import a06 from "../assets/avatars/06_long_legs.webp";
import a07 from "../assets/avatars/07_sly_cat.webp";
import a08 from "../assets/avatars/08_peeping_cat.webp";
import a09 from "../assets/avatars/09_grumpy_cat.webp";
import a10 from "../assets/avatars/10_shy_cat.webp";

export interface BuiltInAvatar {
  id: string;
  name: string;
  src: string;
}

export const AVATARS: ReadonlyArray<BuiltInAvatar> = [
  { id: "01_leaping_cat", name: "Leaping Cat", src: a01 },
  { id: "02_big_ears", name: "Big Ears", src: a02 },
  { id: "03_sleepy_cat", name: "Sleepy Cat", src: a03 },
  { id: "04_hypno_cat", name: "Hypno Cat", src: a04 },
  { id: "05_curious_cat", name: "Curious Cat", src: a05 },
  { id: "06_long_legs", name: "Long Legs", src: a06 },
  { id: "07_sly_cat", name: "Sly Cat", src: a07 },
  { id: "08_peeping_cat", name: "Peeping Cat", src: a08 },
  { id: "09_grumpy_cat", name: "Grumpy Cat", src: a09 },
  { id: "10_shy_cat", name: "Shy Cat", src: a10 },
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

/** One of the ten, at random (the number source is a parameter so a test can steer it). */
export function randomAvatarChoice(rand: () => number = Math.random): AvatarChoice {
  const i = Math.min(AVATARS.length - 1, Math.max(0, Math.floor(rand() * AVATARS.length)));
  return builtInChoice(AVATARS[i].id);
}

/** Whose picture it is: an account by its username, a guest as "guest"; null while no one is signed in. */
export function avatarKey(mode: "guest" | "account" | null, username: string | null): string | null {
  if (mode === "account") return username?.trim() ? `a:${username.trim().toLowerCase()}` : null;
  return mode === "guest" ? "guest" : null;
}
