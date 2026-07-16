import { lookup as dnsLookup } from "node:dns/promises";

export class UnsafeUrlError extends Error {
  readonly code = "UNSAFE_URL" as const;

  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localdomain", ".lan", ".home", ".corp"];
const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "instance-data"]);
const MAX_URL_LENGTH = 2_048;
const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 1_536 * 1024;
const MAX_TEXT_CHARS = 40_000;

/** Synchronous URL policy: HTTPS only, default port, no credentials, no private hosts. */
export function assertSafeUrlFormat(rawUrl: string): URL {
  if (!rawUrl || rawUrl.length > MAX_URL_LENGTH) {
    throw new UnsafeUrlError("URL이 비어 있거나 너무 깁니다.");
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("URL 형식이 올바르지 않습니다.");
  }
  if (url.protocol !== "https:") {
    throw new UnsafeUrlError("HTTPS 주소만 열람할 수 있습니다.");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("자격 증명이 포함된 URL은 열람하지 않습니다.");
  }
  if (url.port && url.port !== "443") {
    throw new UnsafeUrlError("기본 HTTPS 포트(443)만 허용됩니다.");
  }
  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) {
    throw new UnsafeUrlError("내부 호스트는 열람할 수 없습니다.");
  }
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new UnsafeUrlError("내부 네트워크 도메인은 열람할 수 없습니다.");
  }
  if (isIpLiteral(hostname) && isPrivateAddress(hostname)) {
    throw new UnsafeUrlError("사설·내부 IP 주소는 열람할 수 없습니다.");
  }
  return url;
}

export function isIpLiteral(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/gu, "");
  return /^[0-9.]+$/u.test(bare) || bare.includes(":");
}

export function isPrivateAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/gu, "").toLowerCase();

  if (bare.includes(":")) {
    if (bare === "::" || bare === "::1") return true;
    if (bare.startsWith("fe80") || bare.startsWith("fc") || bare.startsWith("fd")) return true;
    if (bare.startsWith("::ffff:")) return isPrivateAddress(bare.slice(7));
    return false;
  }

  const parts = bare.split(".").map((part) => parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

type LookupFn = (hostname: string) => Promise<Array<{ address: string }>>;

export async function assertPublicDns(
  hostname: string,
  lookupFn: LookupFn = defaultLookup
): Promise<void> {
  if (isIpLiteral(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new UnsafeUrlError("사설·내부 IP 주소는 열람할 수 없습니다.");
    }
    return;
  }
  let records: Array<{ address: string }>;
  try {
    records = await lookupFn(hostname);
  } catch {
    throw new UnsafeUrlError("호스트 이름을 확인할 수 없습니다.");
  }
  if (records.length === 0) {
    throw new UnsafeUrlError("호스트 이름을 확인할 수 없습니다.");
  }
  for (const record of records) {
    if (isPrivateAddress(record.address)) {
      throw new UnsafeUrlError("내부 네트워크로 해석되는 주소는 열람할 수 없습니다.");
    }
  }
}

async function defaultLookup(hostname: string) {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

export type SafePageResult = {
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  contentChars: number;
};

/**
 * Fetches a public HTTPS page with SSRF checks, manual redirects, byte and
 * time limits, and returns extracted plain text only (never raw HTML).
 */
export async function fetchPublicPageText(
  rawUrl: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    lookupFn?: LookupFn;
    fetchFn?: typeof fetch;
  } = {}
): Promise<SafePageResult> {
  const fetchFn = options.fetchFn || fetch;
  let url = assertSafeUrlFormat(rawUrl);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertPublicDns(url.hostname, options.lookupFn);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
    const abortForward = () => controller.abort();
    options.signal?.addEventListener("abort", abortForward, { once: true });

    try {
      const response = await fetchFn(url.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,text/plain",
          "Accept-Language": "ko,en;q=0.8",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 DREAMWISH-Research/0.1"
        }
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new UnsafeUrlError("리디렉션 대상이 없습니다.");
        url = assertSafeUrlFormat(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) {
        throw new Error(`페이지 응답 오류 (HTTP ${response.status})`);
      }
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
        throw new Error("HTML 또는 텍스트 문서만 열람합니다.");
      }

      const body = await readBodyWithLimit(response, MAX_BODY_BYTES);
      const title = extractTitle(body);
      const text = extractReadableText(body);
      return {
        url: rawUrl,
        finalUrl: url.toString(),
        title,
        text,
        contentChars: text.length
      };
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortForward);
    }
  }

  throw new UnsafeUrlError("리디렉션이 너무 많습니다.");
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, Math.min(chunk.byteLength, merged.byteLength - offset));
    merged.set(slice, offset);
    offset += slice.byteLength;
    if (offset >= merged.byteLength) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

export function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/iu);
  return decodeEntities(match?.[1] || "").replace(/\s+/gu, " ").trim().slice(0, 200);
}

/** Strips markup, scripts, styles and controls; returns bounded plain text. */
export function extractReadableText(html: string): string {
  const withoutBlocks = html
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/giu, " ")
    .replace(/<template[\s\S]*?<\/template>/giu, " ")
    .replace(/<svg[\s\S]*?<\/svg>/giu, " ")
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/<(nav|footer|header|aside|form)[\s\S]*?<\/\1>/giu, " ");
  const withBreaks = withoutBlocks
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote)>/giu, "\n")
    .replace(/<br\s*\/?\s*>/giu, "\n");
  const text = decodeEntities(withBreaks.replace(/<[^>]{0,500}>/gu, " "));
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_TEXT_CHARS);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/&#(\d{1,6});/gu, (_match, code) => {
      const parsed = Number(code);
      return Number.isFinite(parsed) && parsed > 0 && parsed < 1_114_112
        ? String.fromCodePoint(parsed)
        : " ";
    });
}
