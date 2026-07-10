const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  copy: "©",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  reg: "®",
  aacute: "á",
  Aacute: "Á",
  acirc: "â",
  Acirc: "Â",
  agrave: "à",
  Agrave: "À",
  aring: "å",
  Aring: "Å",
  atilde: "ã",
  Atilde: "Ã",
  ccedil: "ç",
  Ccedil: "Ç",
  eacute: "é",
  Eacute: "É",
  ecirc: "ê",
  Ecirc: "Ê",
  egrave: "è",
  Egrave: "È",
  iacute: "í",
  Iacute: "Í",
  ntilde: "ñ",
  Ntilde: "Ñ",
  oacute: "ó",
  Oacute: "Ó",
  ocirc: "ô",
  Ocirc: "Ô",
  otilde: "õ",
  Otilde: "Õ",
  uacute: "ú",
  Uacute: "Ú",
  yacute: "ý",
  Yacute: "Ý"
};

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/giu, (entity, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return decodeCodePoint(Number.parseInt(body.slice(2), 16), entity);
    }

    if (body.startsWith("#")) {
      return decodeCodePoint(Number.parseInt(body.slice(1), 10), entity);
    }

    return NAMED_ENTITIES[body] ?? entity;
  });
}

export function normalizeSearchText(input: string): string {
  return decodeHtmlEntities(input)
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/p\s*>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .normalize("NFC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, " ")
    .replace(/[ \t\f\v]+/gu, " ")
    .replace(/\n\s*/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .replace(/\s+/gu, " ")
    .trim();
}

export function safeExternalUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return "";
  }

  return "";
}

function decodeCodePoint(value: number, fallback: string) {
  if (!Number.isFinite(value) || value < 0) return fallback;

  try {
    return String.fromCodePoint(value);
  } catch {
    return fallback;
  }
}
