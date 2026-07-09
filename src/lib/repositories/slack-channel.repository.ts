import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

export type SlackChannelRecord = {
  id: string;
  channelId: string;
  name: string;
  isPrivate: boolean;
  updatedAt: string;
};

type SlackChannelDb = {
  channels: SlackChannelRecord[];
};

const EMPTY_DB: SlackChannelDb = { channels: [] };

export async function upsertSlackChannels(channels: SlackChannelRecord[]) {
  const db = await readDb();
  for (const channel of channels) {
    const index = db.channels.findIndex((item) => item.channelId === channel.channelId);
    if (index >= 0) db.channels[index] = channel;
    else db.channels.unshift(channel);
  }
  await writeDb(db);
  return channels;
}

export async function listSlackChannels() {
  return (await readDb()).channels;
}

async function readDb() {
  const db = await readJsonStore<SlackChannelDb>("slack-channels.json", EMPTY_DB);
  return { channels: Array.isArray(db.channels) ? db.channels : [] };
}

function writeDb(db: SlackChannelDb) {
  return writeJsonStore("slack-channels.json", db);
}
