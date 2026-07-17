import { MessageSquare } from "lucide-react";
import type { Integration } from "@/src/lib/integrations/types";
import { IntegrationCard } from "./IntegrationCard";

export function SlackIntegrationCard({
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
      icon={MessageSquare}
      appId="slack"
      integration={integration}
      active={active}
      onSelect={onSelect}
    />
  );
}
