import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

export type GmailAttachmentRecord = {
  id: string;
  messageId: string;
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

type GmailAttachmentDb = {
  attachments: GmailAttachmentRecord[];
};

const EMPTY_DB: GmailAttachmentDb = { attachments: [] };

export async function upsertGmailAttachments(attachments: GmailAttachmentRecord[]) {
  const db = await readDb();
  for (const attachment of attachments) {
    const index = db.attachments.findIndex(
      (item) => item.messageId === attachment.messageId && item.attachmentId === attachment.attachmentId
    );
    if (index >= 0) db.attachments[index] = attachment;
    else db.attachments.unshift(attachment);
  }
  await writeDb(db);
  return attachments;
}

export async function listGmailAttachments() {
  return (await readDb()).attachments;
}

async function readDb() {
  const db = await readJsonStore<GmailAttachmentDb>("gmail-attachments.json", EMPTY_DB);
  return { attachments: Array.isArray(db.attachments) ? db.attachments : [] };
}

function writeDb(db: GmailAttachmentDb) {
  return writeJsonStore("gmail-attachments.json", db);
}
