import {deviceSecurity} from '../native/device-security';
import {acknowledgePayload, claimDuePayload, retryPayload} from '../storage/offline-queue';

export function canonicalize(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).filter(key => key !== 'signature' && record[key] !== undefined).sort().map(key => [key, canonicalValue(record[key])]));
  }
  return value;
}

export async function flushOfflineQueue() {
  const binding = await deviceSecurity.loadDeviceBinding();
  if (!binding) return {sent: 0, pending: true};
  let sent = 0;
  for (;;) {
    const queued = await claimDuePayload();
    if (!queued) return {sent, pending: false};
    const sequence = await deviceSecurity.nextSequence();
    const unsigned = {
      apiVersion: 1 as const,
      deviceId: binding.deviceId,
      eventId: queued.id,
      sequence,
      sentAt: new Date().toISOString(),
      payload: queued.payload
    };
    const signature = await deviceSecurity.signWithDeviceKey(binding.keyAlias, canonicalize(unsigned));
    try {
      const response = await fetch(`${binding.apiBaseUrl}/api/devices/${encodeURIComponent(binding.deviceId)}/sync`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...unsigned, signature})
      });
      const body = await response.json().catch(() => null) as {error?: {code?: string; message?: string}} | null;
      if (!response.ok && body?.error?.code !== 'DEVICE_EVENT_DUPLICATE') throw new Error(body?.error?.message || '동기화에 실패했습니다.');
      await acknowledgePayload(queued.id);
      sent += 1;
    } catch {
      await retryPayload(queued.id);
      return {sent, pending: true};
    }
  }
}

export async function revokeCurrentDevice() {
  const binding = await deviceSecurity.loadDeviceBinding();
  if (!binding) return;
  const sequence = await deviceSecurity.nextSequence();
  const unsigned = {
    apiVersion: 1 as const,
    deviceId: binding.deviceId,
    eventId: `disconnect-${Date.now()}`,
    sequence,
    sentAt: new Date().toISOString(),
    payload: {apiVersion: 1 as const, type: 'device.disconnect' as const}
  };
  const signature = await deviceSecurity.signWithDeviceKey(binding.keyAlias, canonicalize(unsigned));
  const response = await fetch(`${binding.apiBaseUrl}/api/devices/${encodeURIComponent(binding.deviceId)}/disconnect`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...unsigned, signature})
  });
  if (!response.ok) throw new Error('서버에서 휴대폰 연결을 해제하지 못했습니다. 네트워크를 확인해 주세요.');
}
