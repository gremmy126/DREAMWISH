import type { ExternalEvent, ExternalFile, ExternalMessage } from "@/src/lib/integrations/types";

export function normalizeExternalMessage(input: {
  integrationId: string;
  externalId: string;
  source: string;
  sender: string;
  recipients?: string[];
  subject: string;
  bodyText: string;
  receivedAt?: string;
}): ExternalMessage {
  const now = new Date().toISOString();
  return {
    id: `external_message_${input.externalId}`,
    integrationId: input.integrationId,
    externalId: input.externalId,
    source: input.source,
    sender: input.sender,
    recipients: input.recipients || [],
    subject: input.subject,
    bodyPreview: input.bodyText.slice(0, 160),
    bodyText: input.bodyText,
    receivedAt: input.receivedAt || now,
    relatedCustomerId: null,
    relatedProjectId: null,
    createdAt: now
  };
}

export function normalizeExternalEvent(input: {
  integrationId: string;
  externalId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  attendees?: string[];
  location?: string;
}): ExternalEvent {
  return {
    id: `external_event_${input.externalId}`,
    integrationId: input.integrationId,
    externalId: input.externalId,
    title: input.title,
    description: input.description || "",
    startTime: input.startTime,
    endTime: input.endTime,
    attendees: input.attendees || [],
    location: input.location || "",
    relatedCustomerId: null,
    relatedProjectId: null,
    createdAt: new Date().toISOString()
  };
}

export function normalizeExternalFile(input: {
  integrationId: string;
  externalId: string;
  fileName: string;
  mimeType: string;
  size: number;
  source: string;
  path: string;
}): ExternalFile {
  return {
    id: `external_file_${input.externalId}`,
    integrationId: input.integrationId,
    externalId: input.externalId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    size: input.size,
    source: input.source,
    path: input.path,
    relatedCustomerId: null,
    relatedProjectId: null,
    createdAt: new Date().toISOString()
  };
}
