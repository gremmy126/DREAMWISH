import { Mail } from "lucide-react";
import type { Integration } from "@/src/lib/integrations/types";
import { IntegrationCard } from "./IntegrationCard";

export function GmailIntegrationCard({
  integration,
  active,
  onSelect
}: {
  integration: Integration;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <IntegrationCard
      icon={Mail}
      appId="gmail"
      integration={integration}
      active={active}
      onSelect={onSelect}
    />
  );
}
