import { createHash, randomBytes } from "crypto";

export type OAuthSecurityParams = {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
};

export function createOAuthSecurityParams(): OAuthSecurityParams {
  const codeVerifier = base64UrlRandom(64);
  return {
    state: base64UrlRandom(32),
    codeVerifier,
    codeChallenge: createS256CodeChallenge(codeVerifier)
  };
}

export function createS256CodeChallenge(codeVerifier: string) {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

function base64UrlRandom(bytes: number) {
  return randomBytes(bytes).toString("base64url");
}
