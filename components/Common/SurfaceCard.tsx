"use client";

import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";

type SurfaceCardProps = HTMLMotionProps<"div"> & {
  children: ReactNode;
  delay?: number;
  interactive?: boolean;
};

export function SurfaceCard({
  children,
  className = "",
  delay = 0,
  interactive = false,
  ...props
}: SurfaceCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={interactive ? { y: -2, scale: 1.005 } : undefined}
      className={`rounded-app border border-app-border bg-app-card shadow-soft ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
}
