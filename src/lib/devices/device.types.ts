export type DevicePlatform = "android" | "ios";
export type DeviceStatus = "active" | "paused" | "revoked";

export type PairedDevice = {
  id: string;
  ownerId: string;
  platform: DevicePlatform;
  name: string;
  status: DeviceStatus;
  lastSequence: number;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PairingChallenge = {
  id: string;
  ownerId: string;
  platform: DevicePlatform;
  code: string;
  expiresAt: string;
};

export type ContactCandidate = {
  id: string;
  ownerId: string;
  deviceId: string;
  externalId: string;
  name: string;
  phone: string;
  email: string;
  companyName: string;
  position: string;
  status: "pending" | "imported" | "ignored";
  createdAt: string;
  updatedAt: string;
};

export type CalendarCandidate = {
  id: string;
  ownerId: string;
  deviceId: string;
  externalId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  sourceCalendar: string;
  sourceDevice: string;
  status: "pending" | "imported" | "conflict" | "ignored";
  createdAt: string;
  updatedAt: string;
};
