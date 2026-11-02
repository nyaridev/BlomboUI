import type { Transition, Variants } from "motion/react";

/**
 * Motion presets. A pro tool should feel instant and physical, never floaty:
 *  - `snappy` for direct responses (menus, popovers, thumbs, indicators, toggles)
 *  - `bouncy` for arrivals that deserve a little life (toasts, the generate button)
 *  - `glide`  for large surfaces (views, sheets, dialogs)
 * Springs are critically damped (bouncy a little under) so they settle without a slow tail:
 * snappy in about 100 ms, glide in about 200 ms. Exits are plain fades of 60–80 ms.
 * Reduced motion is honored by MotionConfig.
 */
export const snappy: Transition = { type: "spring", stiffness: 1400, damping: 53, mass: 0.5 };
export const bouncy: Transition = { type: "spring", stiffness: 900, damping: 38, mass: 0.6 };
export const glide: Transition = { type: "spring", stiffness: 800, damping: 57, mass: 1 };
/** Leaving is quicker than arriving: a short fade, nothing to watch. */
export const exitFast: Transition = { duration: 0.07 };

export const press = { whileTap: { scale: 0.96 }, transition: snappy } as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: glide },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 4 },
  show: { opacity: 1, scale: 1, y: 0, transition: snappy },
  exit: { opacity: 0, scale: 0.98, y: 2, transition: exitFast },
};

export const stagger = (step = 0.045, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
});
