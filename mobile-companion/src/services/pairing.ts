import {deviceSecurity} from '../native/device-security';
import type {DeviceBinding, PairingLink} from '../types';

const APP_VERSION = '0.1.0';

export function parsePairingLink(value: string): PairingLink {
  const url = new URL(value);
  const custom = url.protocol === 'dreamwish:';
  const validHttps = url.protocol === 'https:' && (url.pathname === '/companion/pair' || url.pathname === '/pair');
  if (!custom && !validHttps) throw new Error('지원하지 않는 연결 링크입니다.');
  if (custom && `${url.hostname}${url.pathname}` !== 'companion/pair') throw new Error('지원하지 않는 연결 링크입니다.');
  const apiVersion = Number(url.searchParams.get('apiVersion'));
  const sessionId = url.searchParams.get('sessionId') || '';
  const publicToken = url.searchParams.get('token') || '';
  if (apiVersion !== 1 || !/^[0-9a-f-]{36}$/iu.test(sessionId) || !/^[A-Za-z0-9_-]{43,128}$/u.test(publicToken)) {
    throw new Error('연결 링크가 올바르지 않거나 만료되었습니다.');
  }
  return {
    apiVersion: 1,
    sessionId,
    publicToken,
    apiBaseUrl: validHttps ? url.origin : 'https://dreamwish.co.kr'
  };
}

export async function registerPairing(link: PairingLink) {
  const alias = `dreamwish-device-${link.sessionId}`;
  const key = await deviceSecurity.generateDeviceKey(alias);
  const response = await fetch(`${link.apiBaseUrl}/api/devices/pairing-challenges/${encodeURIComponent(link.sessionId)}/register`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${link.publicToken}`},
    body: JSON.stringify({
      platform: deviceSecurity.platform,
      keyAlgorithm: 'ES256',
      publicKeySpki: key.publicKeySpki,
      appVersion: APP_VERSION
    })
  });
  const body = await response.json() as {confirmationCode?: string; expiresAt?: string; error?: {message?: string}};
  if (!response.ok || !body.confirmationCode || !body.expiresAt) {
    throw new Error(body.error?.message || '휴대폰을 등록하지 못했습니다.');
  }
  return {confirmationCode: body.confirmationCode, expiresAt: body.expiresAt, keyAlias: key.keyAlias};
}

export async function waitForPairingConfirmation(link: PairingLink, keyAlias: string, signal?: AbortSignal): Promise<DeviceBinding> {
  while (!signal?.aborted) {
    const response = await fetch(`${link.apiBaseUrl}/api/devices/pairing-challenges/${encodeURIComponent(link.sessionId)}/status`, {
      headers: {Authorization: `Bearer ${link.publicToken}`},
      signal
    });
    const body = await response.json() as {status?: string; deviceId?: string; error?: {message?: string}};
    if (!response.ok) throw new Error(body.error?.message || '연결 상태를 확인하지 못했습니다.');
    if (body.status === 'active' && body.deviceId) {
      const binding: DeviceBinding = {apiBaseUrl: link.apiBaseUrl, deviceId: body.deviceId, keyAlias, platform: deviceSecurity.platform};
      await deviceSecurity.saveDeviceBinding(binding);
      return binding;
    }
    if (body.status === 'expired' || body.status === 'locked') throw new Error('연결 링크가 만료되었거나 잠겼습니다.');
    await delay(1500, signal);
  }
  throw new Error('연결이 취소되었습니다.');
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('연결이 취소되었습니다.')); }, {once: true});
  });
}
