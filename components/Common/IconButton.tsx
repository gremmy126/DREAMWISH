"use client";

import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";

type IconButtonProps = HTMLMotionProps<"button"> & {
  children: ReactNode;
  label: string;
  active?: boolean;
};

export function IconButton({
  children,
  label,
  active = false,
  className = "",
  ...props
}: IconButtonProps) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.96 }}
      whileHover={{ y: -1 }}
      aria-label={label}
      title={label}
      className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition ${
        active
          ? "border-app-primary bg-app-hover text-app-primary"
          : "border-app-border bg-app-card text-slate-600 hover:bg-app-hover hover:text-app-primary"
      } ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}
