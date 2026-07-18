export type Platform = 'android' | 'ios';

export type PairingLink = {
  apiBaseUrl: string;
  apiVersion: 1;
  sessionId: string;
  publicToken: string;
};

export type DeviceBinding = {
  apiBaseUrl: string;
  deviceId: string;
  keyAlias: string;
  platform: Platform;
};

export type RevenueSignal = {
  eventId: string;
  sourceApp: string;
  capturedAt: string;
  rawText: string;
};

export type DeviceSyncPayload = {
  apiVersion: 1;
  type: 'device.sync';
  contacts: Array<Record<string, unknown>>;
  calendarEvents: Array<Record<string, unknown>>;
  revenueSignals: RevenueSignal[];
};
