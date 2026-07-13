export function normalizeChatAnswer(value: string) {
  return value
    .replace(/\*\*/gu, "")
    .split("\n")
    .filter((line) => !/^\s*(?:관련도|relevance|relevancy)\s*[:：-]?\s*\d{1,3}%?\s*$/iu.test(line))
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}
