import { readJsonStore, writeJsonStore } from "../local-db/json-store";

export type IntegrationSyncSetting = {
  ownerId: string;
  connectorId: string;
  enabled: boolean;
  syncDays: number;
  commandPrefix: string;
  updatedAt: string;
};

type IntegrationSettingsDb = {
  settings: IntegrationSyncSetting[];
};

const EMPTY_DB: IntegrationSettingsDb = { settings: [] };

export async function listIntegrationSyncSettings(ownerId: string) {
  return (await readDb()).settings.filter((setting) => setting.ownerId === ownerId);
}

export async function listEnabledIntegrationApps(ownerId: string) {
  return (await listIntegrationSyncSettings(ownerId)).filter((setting) => setting.enabled);
}

export async function saveIntegrationSyncSetting(input: {
  ownerId: string;
  connectorId: string;
  enabled: boolean;
  syncDays: number;
  commandPrefix: string;
}) {
  const db = await readDb();
  const setting: IntegrationSyncSetting = {
    ownerId: input.ownerId,
    connectorId: input.connectorId,
    enabled: input.enabled,
    syncDays: Math.max(1, Math.min(30, input.syncDays)),
    commandPrefix: input.commandPrefix,
    updatedAt: new Date().toISOString()
  };
  const index = db.settings.findIndex(
    (item) => item.ownerId === input.ownerId && item.connectorId === input.connectorId
  );
  if (index >= 0) db.settings[index] = setting;
  else db.settings.unshift(setting);
  await writeDb(db);
  return setting;
}

async function readDb() {
  const db = await readJsonStore<IntegrationSettingsDb>("integration-settings.json", EMPTY_DB);
  return { settings: Array.isArray(db.settings) ? db.settings : [] };
}

function writeDb(db: IntegrationSettingsDb) {
  return writeJsonStore("integration-settings.json", db);
}
