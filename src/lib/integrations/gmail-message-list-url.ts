const GMAIL_MESSAGE_LIST_ENDPOINT =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages";

export function buildGmailMessageListUrl(limit: number) {
  const url = new URL(GMAIL_MESSAGE_LIST_ENDPOINT);
  url.searchParams.set("maxResults", String(limit));
  return url;
}
