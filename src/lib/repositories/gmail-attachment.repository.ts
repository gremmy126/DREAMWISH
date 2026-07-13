import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";

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
  attachments: Array<GmailAttachmentRecord & { ownerId: string }>;
};

const EMPTY_DB: GmailAttachmentDb = { attachments: [] };
const FILE_NAME = "gmail-attachments.json";

export async function upsertGmailAttachments(
  ownerId: string,
  attachments: GmailAttachmentRecord[]
) {
  return withJsonStoreLock(FILE_NAME, async () => {
    const db = await readDb();
    const ownedAttachments = attachments.map((attachment) => ({ ...attachment, ownerId }));
    for (const attachment of ownedAttachments) {
      const index = db.attachments.findIndex(
        (item) =>
          item.ownerId === ownerId &&
          item.messageId === attachment.messageId &&
          item.attachmentId === attachment.attachmentId
      );
      if (index >= 0) db.attachments[index] = attachment;
      else db.attachments.unshift(attachment);
    }
    await writeDb(db);
    return ownedAttachments;
  });
}

export async function listGmailAttachments(ownerId: string) {
  return (await readDb()).attachments.filter((item) => item.ownerId === ownerId);
}

async function readDb() {
  const db = await readJsonStore<GmailAttachmentDb>(FILE_NAME, EMPTY_DB);
  return { attachments: Array.isArray(db.attachments) ? db.attachments : [] };
}

function writeDb(db: GmailAttachmentDb) {
  return writeJsonStore(FILE_NAME, db);
}
