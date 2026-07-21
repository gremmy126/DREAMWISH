"use client";

import { AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatDecisionWorkspace } from "@/components/Chat/ChatDecisionWorkspace";
import { FilesView } from "@/components/Files/FilesView";
import { MemoryOsView } from "@/components/Memory/MemoryOsView";
import { SettingsView } from "@/components/Settings/SettingsView";
import { TeamView } from "@/components/Team/TeamView";
import { AuthGate } from "@/components/auth/AuthGate";
import { PageTransition } from "@/components/Common/PageTransition";
import { openCookieSettings } from "@/components/consent/consent";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { PaymentGate } from "@/components/billing/PaymentGate";
import type { ViewId } from "@/components/layout/types";
import {
  getWorkspaceViewUrl,
  normalizeWorkspaceView,
  resolveWorkspaceView
} from "@/src/lib/navigation/workspace-view";

export function AppShell({
  hasServerSession,
  initialView = "chat"
}: {
  hasServerSession: boolean;
  initialView?: ViewId;
}) {
  const [activeView, setActiveView] = useState<ViewId>(initialView);

  const navigateToView = useCallback((view: ViewId) => {
    setActiveView(view);
    window.history.replaceState(null, "", getWorkspaceViewUrl(view));
  }, []);

  useEffect(() => {
    const resolved = resolveWorkspaceView(window.location.pathname, window.location.search);
    setActiveView(resolved);
    if (new URLSearchParams(window.location.search).has("view")) {
      window.history.replaceState(null, "", getWorkspaceViewUrl(resolved));
    }

    const handleNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ view?: string }>).detail;
      const requested = normalizeWorkspaceView(detail?.view);
      if (requested) navigateToView(requested);
    };
    window.addEventListener("dreamwish:navigate", handleNavigate);
    return () => window.removeEventListener("dreamwish:navigate", handleNavigate);
  }, [navigateToView]);

  const content = useMemo(() => {
    switch (activeView) {
      case "chat":
        return <ChatDecisionWorkspace />;
      case "memory":
        return <MemoryOsView />;
      case "team":
        return <TeamView />;
      case "files":
        return <FilesView />;
      case "settings":
        return <SettingsView />;
      default:
        return <ChatDecisionWorkspace />;
    }
  }, [activeView]);

  return (
    <AuthGate hasServerSession={hasServerSession}>
      <div className="min-h-screen bg-app-bg">
        <Sidebar activeView={activeView} onViewChange={navigateToView} />
        <div className="md:pl-[248px]">
          <Topbar />
          <main className="px-4 pb-6 md:px-6">
            <AnimatePresence mode="wait">
              <PageTransition key={activeView}>
                <PaymentGate>
                  <div className="min-w-0">{content}</div>
                </PaymentGate>
              </PageTransition>
            </AnimatePresence>
          </main>
          <AppFooter />
        </div>
      </div>
    </AuthGate>
  );
}

function AppFooter() {
  return (
    <footer className="px-6 pb-8 text-xs text-app-muted">
      <nav
        aria-label="주요 페이지"
        className="flex flex-wrap items-center gap-3 border-t border-app-border pt-5"
      >
        <Link className="font-semibold transition hover:text-app-primary" href="/chat">
          AI Chat
        </Link>
        <Link className="font-semibold transition hover:text-app-primary" href="/memory">
          Memory
        </Link>
        <Link className="font-semibold transition hover:text-app-primary" href="/team">
          Team
        </Link>
        <Link className="font-semibold transition hover:text-app-primary" href="/pricing">
          Pricing
        </Link>
        <Link className="font-semibold transition hover:text-app-primary" href="/login">
          Login
        </Link>
        <Link className="font-semibold transition hover:text-app-primary" href="/signup">
          Get Started
        </Link>
      </nav>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link className="font-medium transition hover:text-app-text" href="/privacy">
          Privacy Policy
        </Link>
        <Link className="font-medium transition hover:text-app-text" href="/cookies">
          Cookie Policy
        </Link>
        <Link className="font-medium transition hover:text-app-text" href="/terms">
          Terms
        </Link>
        <Link className="font-medium transition hover:text-app-text" href="/refunds">
          Refunds
        </Link>
        <button
          type="button"
          onClick={openCookieSettings}
          className="font-medium text-app-primary transition hover:text-app-text"
        >
          Cookie settings
        </button>
      </div>
    </footer>
  );
}
