"use client";

import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GithubAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User
} from "firebase/auth";
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
