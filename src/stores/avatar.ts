/**
 * Who has which picture. Kept on this computer (localStorage), one entry per profile: each account by its username,
 * the guest as "guest". A profile with no entry yet gets one of the built-in pictures at random, once, and keeps it
 * until the person picks another.
 */
import { useEffect } from "react";
import { create } from "zustand";
import { avatarKey, avatarSrc, isAvatarChoice, randomAvatarChoice, type AvatarChoice } from "../lib/avatars";
import { useSession } from "../lib/session";

const KEY = "blutheist.avatars";

function load(): Record<string, AvatarChoice> {
  try {
    const o: unknown = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (o && typeof o === "object" && !Array.isArray(o)) {
      const out: Record<string, AvatarChoice> = {};
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (isAvatarChoice(v)) out[k] = v;
      return out;
    }
  } catch {
    /* no storage, or not JSON: start empty */
  }
  return {};
}

function save(choices: Record<string, AvatarChoice>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(choices));
  } catch {
    /* full or blocked: the choice still holds for this run */
  }
}

interface AvatarState {
  choices: Record<string, AvatarChoice>;
  /** Gives a profile a random picture if it has none. */
  ensure(key: string): void;
  set(key: string, choice: AvatarChoice): void;
}

export const useAvatars = create<AvatarState>((set, get) => ({
  choices: load(),
  ensure: (key) => {
    if (get().choices[key]) return;
    const choices = { ...get().choices, [key]: randomAvatarChoice() };
    save(choices);
    set({ choices });
  },
  set: (key, choice) => {
    if (!isAvatarChoice(choice)) return;
    const choices = { ...get().choices, [key]: choice };
    save(choices);
    set({ choices });
  },
}));

/** The signed-in profile's picture (null until it has one, and for no one), and a way to change it. */
export function useMyAvatar(): { src: string | null; choice: AvatarChoice | null; change(choice: AvatarChoice): void } {
  const mode = useSession((s) => s.mode);
  const username = useSession((s) => s.username);
  const key = avatarKey(mode, username);
  const choice = useAvatars((s) => (key ? s.choices[key] ?? null : null));
  const ensure = useAvatars((s) => s.ensure);
  useEffect(() => {
    if (key && !choice) ensure(key);
  }, [key, choice, ensure]);
  const change = (c: AvatarChoice): void => {
    if (key) useAvatars.getState().set(key, c);
  };
  return { src: avatarSrc(choice), choice, change };
}
