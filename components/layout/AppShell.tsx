"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { AutomationView } from "@/components/Automation/AutomationView";
import { CalendarView } from "@/components/Calendar/CalendarView";
import { ChatView } from "@/components/Chat/ChatView";
import { CRMView } from "@/components/CRM/CRMView";
import { FilesView } from "@/components/Files/FilesView";
import { IntegrationsView } from "@/components/integrations/IntegrationsView";
import { KnowledgeView } from "@/components/Knowledge/KnowledgeView";
import { MemoryView } from "@/components/Memory/MemoryView";
import { SettingsView } from "@/components/Settings/SettingsView";
import { WorkflowView } from "@/components/Workflow/WorkflowView";
import { AuthGate } from "@/components/auth/AuthGate";
import { PageTransition } from "@/components/Common/PageTransition";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import type { ViewId } from "@/components/layout/types";

export function AppShell() {
  const [activeView, setActiveView] = useState<ViewId>("chat");

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const requestedView = searchParams.get("view");
    if (isViewId(requestedView)) setActiveView(requestedView);
  }, []);

  const content = useMemo(() => {
    switch (activeView) {
      case "chat":
        return <ChatView />;
      case "knowledge":
        return <KnowledgeView />;
      case "memory":
        return <MemoryView />;
      case "crm":
        return <CRMView />;
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
                <div className="min-w-0">{content}</div>
              </PageTransition>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </AuthGate>
  );
}

function isViewId(value: string | null): value is ViewId {
  return (
    value === "chat" ||
    value === "knowledge" ||
    value === "memory" ||
    value === "crm" ||
    value === "workflow" ||
    value === "automation" ||
    value === "calendar" ||
    value === "files" ||
    value === "integrations" ||
    value === "settings"
  );
}
