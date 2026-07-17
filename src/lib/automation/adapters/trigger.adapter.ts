import type { ActionAdapter } from "./action-adapter.types";

export const triggerActionAdapter: ActionAdapter = {
  adapterVersion: 1,
  supports(adapterKey, adapterVersion) {
    return adapterVersion === 1 && (
      adapterKey === "gmail.watch-new-email" ||
      adapterKey === "webhook.receive" ||
      adapterKey.startsWith("schedule.")
    );
  },
  async execute(input) {
    return {
      output: {
        registered: true,
        triggerType: input.definition.adapterKey,
        configuration: input.normalizedInput
      },
      adapterLatencyMs: 0
    };
  }
};
