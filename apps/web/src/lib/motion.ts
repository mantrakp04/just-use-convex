import type { Transition, TargetAndTransition, Variants } from "motion/react"

// =============================================================================
// EASING CURVES
// =============================================================================

/**
 * iOS-style easing curve - smooth deceleration
 * Use for: drawers, sheets, most UI animations
 * Reference: ease-ios-drawer from Emil Kowalski animations
 */
export const easeIOS = [0.32, 0.72, 0, 1] as const

/**
 * Standard ease-out for UI transitions
 * Use for: enter animations, hover effects
 */
export const easeOut = [0.33, 1, 0.68, 1] as const

// =============================================================================
// SPRING CONFIGURATIONS
// =============================================================================

/**
 * Snappy spring for layout animations
 * Use for: tab indicators, moving elements between positions
 */
export const springSnappy = {
  type: "spring",
  stiffness: 500,
  damping: 40,
} as const satisfies Transition

/**
 * Bouncy spring for playful animations
 * Use for: notifications, badges, attention-grabbing elements
 */
export const springBouncy = {
  type: "spring",
  stiffness: 400,
  damping: 25,
} as const satisfies Transition

// =============================================================================
// TRANSITION PRESETS
// =============================================================================

/**
 * Standard UI transition with iOS easing
 * Use for: most hover/release animations
 */
export const transitionDefault: Transition = {
  duration: 0.2,
  ease: easeIOS,
}

/**
 * Instant transition for press feedback
 * Use for: whileTap to make press feel immediate
 * Reference: timing-asymmetric from Emil Kowalski animations
 */
export const transitionInstant: Transition = {
  duration: 0.08,
}

/**
 * Infinite linear animation
 * Use for: shimmer effects, loading indicators
 */
export const transitionInfinite = (duration: number): Transition => ({
  repeat: Infinity,
  duration,
  ease: "linear",
})

// =============================================================================
// TAP PRESETS
// =============================================================================

/**
 * Standard button tap effect
 * Scale 0.99 + inset shadow for pressed look
 * Reference: transform-scale-097 from Emil Kowalski animations
 */
export const tapButton: TargetAndTransition = {
  scale: 0.99,
  boxShadow: "inset 0 2px 0 0 rgb(0 0 0 / 0.25)",
  transition: transitionInstant,
}

/**
 * Subtle tap for smaller interactive elements
 */
export const tapSubtle: TargetAndTransition = {
  scale: 0.99,
  transition: transitionInstant,
}

// =============================================================================
// HOVER PRESETS
// =============================================================================

/**
 * Standard button hover effect
 * No shadow - just for hover state detection
 */
export const hoverButton: TargetAndTransition = {}

/**
 * Scale up hover for cards/containers
 */
export const hoverLift: TargetAndTransition = {
  scale: 1.02,
  transition: transitionDefault,
}

// =============================================================================
// EXPAND/COLLAPSE PRESETS
// =============================================================================

/**
 * Spring for collapsible/accordion content expand
 * Use for: height animations on panels that open/close
 */
export const springExpand = {
  type: "spring",
  stiffness: 400,
  damping: 35,
} as const satisfies Transition

/**
 * Variants for collapsible content with height animation
 * Use with AnimatePresence and motion.div
 * Overflow is hidden during animation, visible when fully expanded
 */
export const collapseVariants: Variants = {
  collapsed: {
    height: 0,
    opacity: 0,
    overflow: "hidden",
    transition: { duration: 0.2, ease: easeIOS },
  },
  expanded: {
    height: "auto",
    opacity: 1,
    overflow: "visible",
    transition: {
      ...springExpand,
      overflow: { delay: 0.2 }, // delay overflow:visible until height animation settles
    },
  },
}
