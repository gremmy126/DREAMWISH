"use client";

import { Unplug } from "lucide-react";
import { useState } from "react";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import { getIntegrationDisconnectPath } from "@/src/lib/oauth/oauth-connect-url";
import type {
  ConnectableOAuthProviderId,
  OAuthServiceId
} from "@/src/lib/oauth/oauth.types";

export function IntegrationDisconnectButton({
  provider,
  service
}: {
  provider: ConnectableOAuthProviderId;
  service?: OAuthServiceId | null;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const { t } = useAppLanguage();

  async function disconnect() {
    const response = await fetch(getIntegrationDisconnectPath({ provider, service }), {
      method: "POST"
    });
    const data = (await response.json()) as { revoked?: boolean };
    setMessage(data.revoked ? t("integrations.disconnected") : t("integrations.noStoredConnection"));
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void disconnect()}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-app-border bg-white px-4 text-xs font-semibold text-app-muted hover:bg-red-50 hover:text-red-600"
      >
        <Unplug size={14} />
        {t("integrations.disconnect")}
      </button>
      {message ? <p className="mt-2 text-xs leading-5 text-app-muted">{message}</p> : null}
    </div>
  );
}
