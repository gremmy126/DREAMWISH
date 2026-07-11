"use client";

import { initializeApp, getApps } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  GithubAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  type User
} from "firebase/auth";
import { hasPasswordProvider } from "./firebase-password-policy";
import { getFirebaseAuthClientConfig } from "./firebase-client-config";

export function getFirebaseClientAuth() {
  const config = getFirebaseAuthClientConfig();
  if (!config) return null;
  const app = getApps()[0] || initializeApp(config);
  return getAuth(app);
}

export async function signInWithFirebasePassword(input: {
  email: string;
  password: string;
}) {
  const auth = requireAuth();
  return signInWithEmailAndPassword(auth, input.email, input.password);
}

export async function createFirebasePasswordAccount(input: {
  email: string;
  password: string;
  name?: string;
}) {
  const auth = requireAuth();
  const credential = await createUserWithEmailAndPassword(auth, input.email, input.password);
  if (input.name?.trim()) {
    await updateProfile(credential.user, { displayName: input.name.trim() });
  }
  return credential;
}

export async function changeFirebasePassword(input: {
  currentPassword: string;
  newPassword: string;
}) {
  const auth = requireAuth();
  if (!auth.currentUser?.email) {
    throw new Error("Sign in again before changing your password.");
  }
  const credential = EmailAuthProvider.credential(auth.currentUser.email, input.currentPassword);
  await reauthenticateWithCredential(auth.currentUser, credential);
  await updatePassword(auth.currentUser, input.newPassword);
}

export function firebaseUserHasPasswordProvider() {
  const auth = getFirebaseClientAuth();
  return hasPasswordProvider(auth?.currentUser?.providerData || []);
}

export async function signInWithFirebaseGoogle() {
  const auth = requireAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider);
}

export async function signInWithFirebaseGithub() {
  const auth = requireAuth();
  const provider = new GithubAuthProvider();
  provider.addScope("read:user");
  return signInWithPopup(auth, provider);
}

export async function sendFirebasePasswordReset(email: string) {
  const auth = requireAuth();
  return sendPasswordResetEmail(auth, email);
}

export function waitForFirebaseUser() {
  const auth = getFirebaseClientAuth();
  if (!auth) return Promise.resolve<User | null>(null);
  return new Promise<User | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

export async function logoutFirebaseUser() {
  const auth = getFirebaseClientAuth();
  if (auth) await signOut(auth);
}

function requireAuth() {
  const auth = getFirebaseClientAuth();
  if (!auth) throw new Error("Firebase Auth is not configured.");
  return auth;
}
