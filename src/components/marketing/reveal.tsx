"use client";

import { motion, useReducedMotion } from "motion/react";

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  id?: string;
}

/**
 * Fade-up on scroll entry. Degrades to an instant (duration: 0) transition
 * under prefers-reduced-motion rather than skipping the `initial` prop
 * entirely - `useReducedMotion()` resolves differently on the server (no
 * `matchMedia`) than on the client, so branching the `initial` prop's value
 * itself (object vs `false`) produced a real server/client markup mismatch:
 * React would abandon reconciling that subtree, leaving it stuck at the
 * server's `opacity: 0` forever. Keeping `initial` identical on both sides
 * and only changing the transition duration keeps SSR and CSR output
 * identical, so hydration never mismatches.
 */
export function Reveal({ children, delay = 0, className, id }: RevealProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      id={id}
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={reduce ? { duration: 0 } : { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
