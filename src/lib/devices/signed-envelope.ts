function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .filter((key) => key !== "signature" && source[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalValue(source[key])])
    );
  }
  return value;
}

export function canonicalizeSignedEnvelope(value: Record<string, unknown>) {
  return JSON.stringify(canonicalValue(value));
}
