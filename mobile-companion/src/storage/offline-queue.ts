import AsyncStorage from '@react-native-async-storage/async-storage';
import {deviceSecurity} from '../native/device-security';
import type {DeviceSyncPayload} from '../types';

const STORAGE_KEY = 'dreamwish.encrypted-offline-queue.v1';
type QueueRow = {id: string; ciphertext: string; attempt: number; nextAttemptAt: number; createdAt: string};

async function rows(): Promise<QueueRow[]> {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  if (!value) return [];
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed as QueueRow[] : [];
}

async function save(value: QueueRow[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export async function enqueueOfflinePayload(payload: DeviceSyncPayload) {
  const ciphertext = await deviceSecurity.encryptQueuePayload(JSON.stringify(payload));
  const current = await rows();
  const row: QueueRow = {id: randomId(), ciphertext, attempt: 0, nextAttemptAt: Date.now(), createdAt: new Date().toISOString()};
  await save([...current, row].slice(-500));
  return row.id;
}

export async function claimDuePayload() {
  const current = await rows();
  const row = current.find(item => item.nextAttemptAt <= Date.now());
  if (!row) return null;
  const plaintext = await deviceSecurity.decryptQueuePayload(row.ciphertext);
  return {id: row.id, payload: JSON.parse(plaintext) as DeviceSyncPayload};
}

export async function acknowledgePayload(id: string) {
  await save((await rows()).filter(row => row.id !== id));
}

export async function retryPayload(id: string) {
  const current = await rows();
  const updated = current.map(row => row.id === id ? {
    ...row,
    attempt: row.attempt + 1,
    nextAttemptAt: Date.now() + Math.min(6 * 60 * 60_000, 15_000 * 2 ** row.attempt)
  } : row);
  await save(updated);
}

export async function clearOfflineQueue() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

function randomId() {
  return `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
