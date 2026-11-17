/** Shared motion helpers for the eye-style controls (WAAPI; every call is a no-op where `animate` is missing). */
export type Anim = (el: Element, kf: Keyframe[], o?: KeyframeAnimationOptions) => Animation | undefined;

export const A: Anim = (el, kf, o) => el.animate?.(kf, { duration: 500, easing: "cubic-bezier(.3,.8,.3,1)", ...o });

/** A star that spins in, swells and fades. */
export const twinkle = (el: Element | null | undefined, d = 0): void => {
  if (!el) return;
  A(el, [
    { opacity: 0, transform: "rotate(0) scale(.2)" },
    { opacity: 1, transform: "rotate(180deg) scale(1.7)", offset: 0.5 },
    { opacity: 0, transform: "rotate(360deg) scale(.4)" },
  ], { duration: 700, delay: d });
};

/** A star that spins a full turn while swelling and settling. */
export const pop = (el: Element | null | undefined, d = 0): void => {
  if (!el) return;
  A(el, [
    { transform: "rotate(0) scale(1)" },
    { transform: "rotate(180deg) scale(1.9)", offset: 0.5 },
    { transform: "rotate(360deg) scale(1)" },
  ], { duration: 620, delay: d });
};

/** Four-point sparkle, centred on 0,0. */
export const STAR = "M0-5.5C0-2.25 2.25 0 5.5 0C2.25 0 0 2.25 0 5.5C0 2.25-2.25 0-5.5 0C-2.25 0 0-2.25 0-5.5Z";
/** The same sparkle filling a 48×48 box (the volume knob). */
export const STAR_KNOB = "M24 2C24 15 33 24 46 24C33 24 24 33 24 46C24 33 15 24 2 24C15 24 24 15 24 2Z";

/** Quick press feedback for any button: a springy squash. Used by the plain buttons across the app. */
export const squash = (el: Element | null | undefined): void => {
  if (!el) return;
  A(el, [{ transform: "scale(1)" }, { transform: "scale(.86)", offset: 0.35 }, { transform: "scale(1.08)", offset: 0.7 }, { transform: "scale(1)" }], { duration: 380 });
};
