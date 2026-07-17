import { createHash } from "node:crypto";
import { upsertOperationalAccount } from "../admin/account-admin.repository";
import type { SocialProfile, SocialProvider } from "./social-oauth.types";

export function getSocialAccountId(provider: SocialProvider, subject: string) {
  return `social_${createHash("sha256").update(`${provider}:${subject}`).digest("hex").slice(0, 32)}`;
}

export async function linkOrCreateSocialIdentity(provider: SocialProvider, profile: SocialProfile) {
  return upsertOperationalAccount({
    id: getSocialAccountId(provider, profile.subject),
    email: profile.email,
    name: profile.name,
    provider,
    providerSubject: profile.subject
  });
}

