export function canEnableFirebaseGitHubLogin() {
  return process.env.NEXT_PUBLIC_ENABLE_FIREBASE_GITHUB_LOGIN === "true";
}
