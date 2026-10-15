import type { Transition, Variants } from "motion/react";

/**
 * Motion presets. A pro tool should feel quick and physical, never floaty:
 *  - `snappy` for direct responses (thumbs, indicators, toggles)
 *  - `bouncy` for arrivals that deserve a little life (toasts, the generate button)
 *  - `glide`  for large surfaces (views, sheets, the profile-open transition)
 * Keep most motion between 120 and 350 ms. Reduced motion is honored by MotionConfig.
 */
export const snappy: Transition = { type: "spring", stiffness: 620, damping: 40, mass: 0.6 };
export const bouncy: Transition = { type: "spring", stiffness: 460, damping: 24, mass: 0.8 };
export const glide: Transition = { type: "spring", stiffness: 260, damping: 32, mass: 1 };

export const press = { whileTap: { scale: 0.96 }, transition: snappy } as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: glide },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 4 },
  show: { opacity: 1, scale: 1, y: 0, transition: snappy },
  exit: { opacity: 0, scale: 0.98, y: 2, transition: { duration: 0.12 } },
};

export const stagger = (step = 0.045, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
});
