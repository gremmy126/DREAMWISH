import { CalendarDays } from "lucide-react";
import type { Integration } from "@/src/lib/integrations/types";
import { IntegrationCard } from "./IntegrationCard";

export function CalendarIntegrationCard({
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
      icon={CalendarDays}
      appId="calendar"
      integration={integration}
      active={active}
      onSelect={onSelect}
    />
  );
}
