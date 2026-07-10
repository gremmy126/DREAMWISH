"use client";

import { LogIn } from "lucide-react";
import { getIntegrationConnectPath } from "@/src/lib/oauth/oauth-connect-url";
import type {
  ConnectableOAuthProviderId,
  OAuthServiceId
} from "@/src/lib/oauth/oauth.types";

export function OAuthConnectButton({
  provider,
  service,
  label
}: {
  provider: ConnectableOAuthProviderId;
  service?: OAuthServiceId | null;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        window.location.assign(getIntegrationConnectPath({ provider, service }));
      }}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-app-primary px-4 text-xs font-semibold text-white shadow-soft"
    >
      <LogIn size={14} />
      {label}
    </button>
  );
}
