"use client";

import { AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AutomationView } from "@/components/Automation/AutomationView";
import { CalendarView } from "@/components/Calendar/CalendarView";
import { ChatView } from "@/components/Chat/ChatView";
import { BusinessHub } from "@/components/Business/BusinessHub";
import { CRMView } from "@/components/CRM/CRMView";
import { FilesView } from "@/components/Files/FilesView";
import { IntegrationsView } from "@/components/integrations/IntegrationsView";
import { MemoryView } from "@/components/Memory/MemoryView";
import { SettingsView } from "@/components/Settings/SettingsView";
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

export function AppShell({ hasServerSession }: { hasServerSession: boolean }) {
  const [activeView, setActiveView] = useState<ViewId>("chat");

  const navigateToView = useCallback((view: ViewId) => {
    setActiveView(view);
    window.history.replaceState(null, "", getWorkspaceViewUrl(view));
  }, []);

  useEffect(() => {
    setActiveView(resolveWorkspaceView(window.location.pathname, window.location.search));
    if (window.location.pathname !== "/" || new URLSearchParams(window.location.search).has("view")) {
      window.history.replaceState(null, "", "/");
    }

    const handleNavigate = (event: Event) => {
      const requested = normalizeWorkspaceView(
        (event as CustomEvent<{ view?: string }>).detail?.view
      );
      if (requested) navigateToView(requested);
    };
    window.addEventListener("dreamwish:navigate", handleNavigate);
    return () => window.removeEventListener("dreamwish:navigate", handleNavigate);
  }, [navigateToView]);

  const content = useMemo(() => {
    switch (activeView) {
      case "chat":
        return <ChatView />;
      case "memory":
        return <MemoryView />;
      case "business":
        return <BusinessHub />;
      case "crm":
        return <CRMView />;
      case "automation":
        return <AutomationView />;
      case "calendar":
        return <CalendarView />;
      case "files":
        return <FilesView />;
      case "integrations":
        return <IntegrationsView />;
      case "settings":
        return <SettingsView />;
      default:
        return <ChatView />;
    }
  }, [activeView]);

  return (
    <AuthGate hasServerSession={hasServerSession}>
      <div className="min-h-screen bg-app-bg">
        <Sidebar activeView={activeView} onViewChange={navigateToView} />
        <div className="pl-[248px]">
          <Topbar />
          <main className="px-6 pb-6">
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
      <div className="flex flex-wrap items-center gap-3 border-t border-app-border pt-5">
        <Link className="font-medium transition hover:text-app-text" href="/privacy">
          Privacy Policy
        </Link>
        <Link className="font-medium transition hover:text-app-text" href="/cookies">
          Cookie Policy
        </Link>
        <Link className="font-medium transition hover:text-app-text" href="/terms">
          Terms
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
