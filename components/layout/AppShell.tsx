"use client";

import { AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AutomationView } from "@/components/Automation/AutomationView";
import { CalendarView } from "@/components/Calendar/CalendarView";
import { ChatView } from "@/components/Chat/ChatView";
import { BusinessHub } from "@/components/Business/BusinessHub";
import { FilesView } from "@/components/Files/FilesView";
import { IntegrationsView } from "@/components/integrations/IntegrationsView";
import { KnowledgeView } from "@/components/Knowledge/KnowledgeView";
import { MemoryView } from "@/components/Memory/MemoryView";
import { SettingsView } from "@/components/Settings/SettingsView";
import { WorkflowView } from "@/components/Workflow/WorkflowView";
import { AuthGate } from "@/components/auth/AuthGate";
import { PageTransition } from "@/components/Common/PageTransition";
import { openCookieSettings } from "@/components/consent/consent";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { PaymentGate } from "@/components/billing/PaymentGate";
import type { ViewId } from "@/components/layout/types";

export function AppShell() {
  const [activeView, setActiveView] = useState<ViewId>("chat");

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const requestedView = searchParams.get("view");
    if (requestedView === "crm") setActiveView("business");
    else if (isViewId(requestedView)) setActiveView(requestedView);
    else if (window.location.pathname.startsWith("/business")) setActiveView("business");

    const handleNavigate = (event: Event) => {
      const requested = (event as CustomEvent<{ view?: string }>).detail?.view || null;
      if (requested === "crm") setActiveView("business");
      else if (isViewId(requested)) setActiveView(requested);
    };
    window.addEventListener("dreamwish:navigate", handleNavigate);
    return () => window.removeEventListener("dreamwish:navigate", handleNavigate);
  }, []);

  const content = useMemo(() => {
    switch (activeView) {
      case "chat":
        return <ChatView />;
      case "knowledge":
        return <KnowledgeView />;
      case "memory":
        return <MemoryView />;
      case "business":
        return <BusinessHub />;
      case "crm":
        return <BusinessHub initialSection="customers" />;
      case "workflow":
        return <WorkflowView />;
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
    <AuthGate>
      <div className="min-h-screen bg-app-bg">
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
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

function isViewId(value: string | null): value is ViewId {
  return (
    value === "chat" ||
    value === "knowledge" ||
    value === "memory" ||
    value === "business" ||
    value === "crm" ||
    value === "workflow" ||
    value === "automation" ||
    value === "calendar" ||
    value === "files" ||
    value === "integrations" ||
    value === "settings"
  );
}
