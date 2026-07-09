"use client";

import { LogIn } from "lucide-react";

export function OAuthConnectButton({
  provider,
  label
}: {
  provider: "google" | "slack";
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        window.location.href = `/api/oauth/${provider}/connect`;
      }}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-app-primary px-4 text-xs font-semibold text-white shadow-soft"
    >
      <LogIn size={14} />
      {label}
    </button>
  );
}
