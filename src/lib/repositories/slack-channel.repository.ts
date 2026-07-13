import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";

export type SlackChannelRecord = {
  id: string;
  channelId: string;
  name: string;
  isPrivate: boolean;
  updatedAt: string;
};

type SlackChannelDb = {
  channels: Array<SlackChannelRecord & { ownerId: string }>;
};

const EMPTY_DB: SlackChannelDb = { channels: [] };
const FILE_NAME = "slack-channels.json";

export async function upsertSlackChannels(ownerId: string, channels: SlackChannelRecord[]) {
  return withJsonStoreLock(FILE_NAME, async () => {
    const db = await readDb();
    const ownedChannels = channels.map((channel) => ({ ...channel, ownerId }));
    for (const channel of ownedChannels) {
      const index = db.channels.findIndex(
        (item) => item.ownerId === ownerId && item.channelId === channel.channelId
      );
      if (index >= 0) db.channels[index] = channel;
      else db.channels.unshift(channel);
    }
    await writeDb(db);
    return ownedChannels;
  });
}

export async function listSlackChannels(ownerId: string) {
  return (await readDb()).channels.filter((item) => item.ownerId === ownerId);
}

async function readDb() {
  const db = await readJsonStore<SlackChannelDb>(FILE_NAME, EMPTY_DB);
  return { channels: Array.isArray(db.channels) ? db.channels : [] };
}

function writeDb(db: SlackChannelDb) {
  return writeJsonStore(FILE_NAME, db);
}
