"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";

const focusableElements = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

type ResponsiveAutomationPanelProps = {
  open: boolean;
  title: string;
  side: "left" | "right";
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

export function ResponsiveAutomationPanel({
  open,
  title,
  side,
  onClose,
  returnFocusRef,
  children
}: ResponsiveAutomationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    previousFocus.current = returnFocusRef?.current || (document.activeElement as HTMLElement | null);
    const panel = panelRef.current;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusable = panel?.querySelectorAll<HTMLElement>(focusableElements);
    (focusable?.[0] || panel)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(focusableElements));
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      requestAnimationFrame(() => previousFocus.current?.focus());
    };
  }, [open, returnFocusRef]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="패널 닫기"
        className="absolute inset-0 min-h-11 min-w-11 bg-slate-950/35 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`absolute inset-x-0 bottom-0 flex max-h-[min(88dvh,760px)] min-h-0 flex-col overflow-hidden rounded-t-[22px] bg-white pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl outline-none sm:inset-y-0 sm:bottom-auto sm:h-[100dvh] sm:max-h-[100dvh] sm:w-[min(88vw,360px)] sm:max-w-[360px] sm:rounded-none sm:pb-[max(1rem,env(safe-area-inset-bottom))] ${
          side === "left" ? "sm:left-0 sm:right-auto" : "sm:left-auto sm:right-0"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <h2 className="text-sm font-bold text-slate-950">{title}</h2>
          <button
            type="button"
            aria-label={`${title} 닫기`}
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
