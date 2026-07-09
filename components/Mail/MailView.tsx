"use client";

import { Inbox, Mail, Send, SquarePen } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/Common/EmptyState";
import { SectionHeader } from "@/components/Common/SectionHeader";
import { SegmentedControl } from "@/components/Common/SegmentedControl";
import { SurfaceCard } from "@/components/Common/SurfaceCard";

type MailBox = "Inbox" | "Sent" | "Draft";

export function MailView() {
  const [mailbox, setMailbox] = useState<MailBox>("Inbox");

  return (
    <SurfaceCard className="min-h-[720px] overflow-hidden">
      <div className="border-b border-app-border p-6">
        <SectionHeader
          icon={Mail}
          title="메일"
          description="Inbox, Sent, Draft를 정돈합니다."
          action={
            <SegmentedControl
              options={["Inbox", "Sent", "Draft"]}
              value={mailbox}
              onChange={setMailbox}
            />
          }
        />
      </div>
      <div className="grid min-h-[600px] grid-cols-[260px_minmax(0,1fr)]">
        <div className="border-r border-app-border bg-app-bg p-5">
          <button className="mb-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-app-primary text-sm font-medium text-white shadow-soft">
            <SquarePen size={16} />
            작성
          </button>
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-3 text-sm font-medium text-app-primary">
              <Inbox size={16} />
              Inbox
            </div>
            <div className="flex items-center gap-2 rounded-2xl px-3 py-3 text-sm text-app-muted">
              <Send size={16} />
              Sent
            </div>
            <div className="flex items-center gap-2 rounded-2xl px-3 py-3 text-sm text-app-muted">
              <SquarePen size={16} />
              Draft
            </div>
          </div>
        </div>
        <div className="p-6">
          <EmptyState
            icon={Mail}
            title={`${mailbox} 비어 있음`}
            description="표시할 메일이 없습니다."
          />
        </div>
      </div>
    </SurfaceCard>
  );
}
