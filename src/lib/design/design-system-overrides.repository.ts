import { randomUUID } from "node:crypto";
import { mutateOwnerDocument, readOwnerDocument } from "../db/owner-document-store";
import { DESIGN_TOKENS } from "./design-tokens";

// User-editable design-token overrides (color tokens only for now). Values are
// strict hex colors validated server-side, so the client can safely inject
// them as CSS custom properties. Every save keeps the previous state as a
// restorable version.

export type TokenOverride = { light: string; dark: string };

export type DesignSystemOverrides = Record<string, TokenOverride>;

export type DesignSystemVersion = {
  versionId: string;
  overrides: DesignSystemOverrides;
  note: string;
  createdAt: string;
};

type OverridesDocument = {
  overrides: DesignSystemOverrides;
  versions: DesignSystemVersion[];
};

const NAMESPACE = "design.system.v1";
const EMPTY: OverridesDocument = { overrides: {}, versions: [] };
const MAX_VERSIONS = 10;
const HEX_COLOR = /^#[0-9a-f]{6}$/iu;

const EDITABLE_TOKEN_NAMES = new Set(
  DESIGN_TOKENS.filter((token) => token.group === "color").map((token) => token.name)
);

export function isEditableDesignToken(name: string): boolean {
  return EDITABLE_TOKEN_NAMES.has(name);
}

export function sanitizeOverrides(input: unknown): DesignSystemOverrides {
  const output: DesignSystemOverrides = {};
  if (!input || typeof input !== "object") return output;
  for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
    if (!EDITABLE_TOKEN_NAMES.has(name)) continue;
    const pair = value as { light?: unknown; dark?: unknown };
    const light = typeof pair?.light === "string" ? pair.light.trim() : "";
    const dark = typeof pair?.dark === "string" ? pair.dark.trim() : "";
    if (HEX_COLOR.test(light) && HEX_COLOR.test(dark)) {
      output[name] = { light: light.toLowerCase(), dark: dark.toLowerCase() };
    }
  }
  return output;
}

/**
 * Build the CSS that applies overrides on top of globals.css. Values are
 * hex-validated, so string interpolation here is safe.
 */
export function renderOverridesCss(overrides: DesignSystemOverrides): string {
  const entries = Object.entries(overrides).filter(([name]) => EDITABLE_TOKEN_NAMES.has(name));
  if (entries.length === 0) return "";
  const variable = (name: string) =>
    DESIGN_TOKENS.find((token) => token.name === name)?.cssVariable ?? `--${name}`;
  const light = entries.map(([name, pair]) => `${variable(name)}: ${pair.light};`).join(" ");
  const dark = entries.map(([name, pair]) => `${variable(name)}: ${pair.dark};`).join(" ");
  return `:root { ${light} }\n:root[data-theme="dark"] { ${dark} }`;
}

export async function getDesignSystemDocument(ownerId: string): Promise<OverridesDocument> {
  return readOwnerDocument<OverridesDocument>(ownerId, NAMESPACE, EMPTY);
}

export async function saveDesignSystemOverrides(
  ownerId: string,
  overrides: DesignSystemOverrides,
  note = "토큰 수정"
): Promise<OverridesDocument> {
  const clean = sanitizeOverrides(overrides);
  return mutateOwnerDocument<OverridesDocument, OverridesDocument>(
    ownerId,
    NAMESPACE,
    EMPTY,
    (document) => {
      // Keep the outgoing state restorable — including "no overrides".
      document.versions.unshift({
        versionId: randomUUID(),
        overrides: structuredClone(document.overrides),
        note: note.slice(0, 120),
        createdAt: new Date().toISOString()
      });
      document.versions = document.versions.slice(0, MAX_VERSIONS);
      document.overrides = clean;
      return structuredClone(document);
    }
  );
}

export async function restoreDesignSystemVersion(
  ownerId: string,
  versionId: string
): Promise<OverridesDocument> {
  return mutateOwnerDocument<OverridesDocument, OverridesDocument>(
    ownerId,
    NAMESPACE,
    EMPTY,
    (document) => {
      const version = document.versions.find((item) => item.versionId === versionId);
      if (!version) {
        throw new DesignSystemVersionNotFoundError(versionId);
      }
      document.versions.unshift({
        versionId: randomUUID(),
        overrides: structuredClone(document.overrides),
        note: "복원 전 상태",
        createdAt: new Date().toISOString()
      });
      document.overrides = structuredClone(version.overrides);
      document.versions = document.versions
        .filter((item) => item.versionId !== versionId)
        .slice(0, MAX_VERSIONS);
      return structuredClone(document);
    }
  );
}

export class DesignSystemVersionNotFoundError extends Error {
  readonly code = "VERSION_NOT_FOUND" as const;
  readonly status = 404 as const;

  constructor(id: string) {
    super(`Design system version not found: ${id}`);
    this.name = "DesignSystemVersionNotFoundError";
  }
}
