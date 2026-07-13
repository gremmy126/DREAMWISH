import { Polar } from "@polar-sh/sdk";

let client: Polar | null = null;

export function getPolarClient() {
  const accessToken = requirePolarEnv("POLAR_ACCESS_TOKEN");
  client ??= new Polar({
    accessToken,
    server: getPolarServer()
  });
  return client;
}

export function getPolarServer() {
  return process.env.POLAR_SERVER?.trim().toLowerCase() === "sandbox"
    ? ("sandbox" as const)
    : ("production" as const);
}

export function getPolarProductId() {
  return requirePolarEnv("POLAR_PRODUCT_ID");
}

export function getAppOrigin() {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:3100";
  const url = new URL(raw);
  if (!/^https?:$/u.test(url.protocol)) {
    throw new Error("NEXT_PUBLIC_APP_URL must use http or https.");
  }
  if (
    process.env.NODE_ENV === "production" &&
    url.hostname !== "dreamwish.co.kr"
  ) {
    throw new Error("NEXT_PUBLIC_APP_URL must use dreamwish.co.kr in production.");
  }
  return url.origin;
}

export function requirePolarEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}
