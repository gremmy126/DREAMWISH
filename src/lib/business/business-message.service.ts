import { listGmailMessages } from "../repositories/gmail-message.repository";
import { listGmailThreads } from "../repositories/gmail-thread.repository";
import { listSlackChannels } from "../repositories/slack-channel.repository";
import { listSlackMessages } from "../repositories/slack-message.repository";
import type { ExternalMessage } from "../integrations/types";

export type MessageProvider = "gmail" | "slack";
export type BusinessConversation = {
  id: string;
  provider: MessageProvider;
  title: string;
  subtitle: string;
  updatedAt: string;
  messages: ExternalMessage[];
};

export async function listBusinessConversations(ownerId: string, provider: MessageProvider) {
  if (provider === "gmail") {
    const [messages, threads] = await Promise.all([listGmailMessages(ownerId), listGmailThreads(ownerId)]);
    const byExternalId = new Map(messages.map((message) => [message.externalId, message]));
    const threadConversations: BusinessConversation[] = threads.map((thread) => {
      const threadMessages = thread.messageIds.map((id) => byExternalId.get(id)).filter((message): message is ExternalMessage & { ownerId: string } => Boolean(message)).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
      const fallback = messages.find((message) => message.subject === thread.subject);
      const selected = threadMessages.length ? threadMessages : fallback ? [fallback] : [];
      const latest = selected.at(-1);
      return { id: thread.threadId, provider, title: thread.subject || "(제목 없음)", subtitle: latest?.sender || "Gmail", updatedAt: latest?.receivedAt || thread.updatedAt, messages: selected };
    });
    const known = new Set(threadConversations.flatMap((conversation) => conversation.messages.map((message) => message.externalId)));
    const loose = messages.filter((message) => !known.has(message.externalId)).map((message) => ({ id: message.externalId, provider, title: message.subject || "(제목 없음)", subtitle: message.sender, updatedAt: message.receivedAt, messages: [message] } satisfies BusinessConversation));
    return [...threadConversations, ...loose].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  const [channels, messages] = await Promise.all([listSlackChannels(ownerId), listSlackMessages(ownerId)]);
  return channels.map((channel) => {
    const channelMessages = messages.filter((message) => message.subject === `#${channel.name}` || message.externalId.startsWith(`${channel.channelId}_`)).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    return { id: channel.channelId, provider, title: `# ${channel.name}`, subtitle: channel.isPrivate ? "비공개 채널" : "Slack 채널", updatedAt: channelMessages.at(-1)?.receivedAt || channel.updatedAt, messages: channelMessages } satisfies BusinessConversation;
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function buildGmailRawMessage(input: { to: string; subject: string; body: string }) {
  const to = input.to.trim();
  if (!/^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/u.test(to)) throw new Error("invalid_recipient");
  const subject = input.subject.replace(/[\r\n]+/gu, " ").trim().slice(0, 300) || "(제목 없음)";
  const encodedSubject = Buffer.from(subject, "utf8").toString("base64");
  const mime = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${encodedSubject}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.body.slice(0, 100_000)
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}
