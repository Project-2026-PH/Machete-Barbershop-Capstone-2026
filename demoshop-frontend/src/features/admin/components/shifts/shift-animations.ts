import type { Transition, Variants } from 'framer-motion';

/**
 * Spring physics configurations according to DemoShop UI standards.
 * GPU-accelerated: only affects transform (scale, x, y) & opacity.
 */
export const springTransition: Transition = {
    type: 'spring',
    stiffness: 380,
    damping: 30,
    mass: 0.8,
};

export const gentleSpringTransition: Transition = {
    type: 'spring',
    stiffness: 280,
    damping: 24,
    mass: 1,
};

export const snappySpringTransition: Transition = {
    type: 'spring',
    stiffness: 500,
    damping: 35,
    mass: 0.6,
};

export const pageFadeTransition: Transition = {
    duration: 0.22,
    ease: [0.16, 1, 0.3, 1], // easeOutExpo
};

/**
 * Page/View Transition Variants
 */
export const viewTransitionVariants: Variants = {
    initial: {
        opacity: 0,
        y: 8,
    },
    animate: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.22,
            ease: [0.16, 1, 0.3, 1],
        },
    },
    exit: {
        opacity: 0,
        y: -8,
        transition: {
            duration: 0.15,
            ease: [0.7, 0, 0.84, 0],
        },
    },
};

export const reducedMotionVariants: Variants = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.1 } },
    exit: { opacity: 0, transition: { duration: 0.1 } },
};

/**
 * Card stagger & container variants
 */
export const cardContainerVariants: Variants = {
    initial: {},
    animate: {
        transition: {
            staggerChildren: 0.04,
            delayChildren: 0.05,
        },
    },
    exit: {
        transition: {
            staggerChildren: 0.02,
            staggerDirection: -1,
        },
    },
};

export const cardItemVariants: Variants = {
    initial: {
        opacity: 0,
        y: 12,
        scale: 0.98,
    },
    animate: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: gentleSpringTransition,
    },
    exit: {
        opacity: 0,
        scale: 0.96,
        transition: { duration: 0.12 },
    },
};

/**
 * Interactive Chip / Badge hover & tap variants
 */
export const interactiveBadgeVariants: Variants = {
    rest: {
        scale: 1,
    },
    hover: {
        scale: 1.05,
        transition: snappySpringTransition,
    },
    tap: {
        scale: 0.95,
        transition: snappySpringTransition,
    },
};

/**
 * Toggle Switch variants
 */
export const toggleHandleVariants: Variants = {
    off: {
        x: 0,
        backgroundColor: '#71717a', // zinc-500
    },
    on: {
        x: 20,
        backgroundColor: '#D4AF37', // gold
    },
};
