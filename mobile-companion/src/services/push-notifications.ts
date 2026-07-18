import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Alert, Linking, PermissionsAndroid, Platform} from 'react-native';
import {deviceSecurity} from '../native/device-security';
import {canonicalize} from './device-sync';

export function registerBackgroundMessageHandler() {
  messaging().setBackgroundMessageHandler(async () => undefined);
}

const PUSH_ENABLED_KEY = 'dreamwish.push-enabled.v1';
let tokenRefreshSubscription: (() => void) | null = null;

export async function enablePushNotifications() {
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  } else if (Platform.OS === 'ios') {
    await messaging().requestPermission();
  }
  const token = await messaging().getToken();
  await registerPushToken(token, 'register');
  await AsyncStorage.setItem(PUSH_ENABLED_KEY, 'true');
  tokenRefreshSubscription?.();
  tokenRefreshSubscription = messaging().onTokenRefresh(next => { void registerPushToken(next, 'register'); });
}

export async function disablePushNotifications() {
  const token = await messaging().getToken();
  await registerPushToken(token, 'revoke');
  await messaging().deleteToken();
  tokenRefreshSubscription?.(); tokenRefreshSubscription = null;
  await AsyncStorage.removeItem(PUSH_ENABLED_KEY);
}

export async function isPushNotificationsEnabled() {
  return (await AsyncStorage.getItem(PUSH_ENABLED_KEY)) === 'true';
}

export async function bootstrapPushNotifications() {
  if (await isPushNotificationsEnabled()) await enablePushNotifications();
}

export function installPushNavigationHandlers() {
  const open = (candidateId: unknown) => typeof candidateId === 'string' && candidateId
    ? Linking.openURL(`dreamwish://business/revenue/${encodeURIComponent(candidateId)}`)
    : Promise.resolve();
  void messaging().getInitialNotification().then(message => open(message?.data?.candidateId));
  const opened = messaging().onNotificationOpenedApp(message => { void open(message.data?.candidateId); });
  const foreground = messaging().onMessage(async message => {
    const candidateId = message.data?.candidateId;
    Alert.alert('새 매출 후보', '확인이 필요한 새 매출 후보가 있습니다.', [
      {text: '나중에'},
      {text: '검토', onPress: () => void open(candidateId)}
    ]);
  });
  return () => { opened(); foreground(); };
}

async function registerPushToken(token: string, action: 'register' | 'revoke') {
  const binding = await deviceSecurity.loadDeviceBinding();
  if (!binding) throw new Error('먼저 휴대폰을 연결해 주세요.');
  const sequence = await deviceSecurity.nextSequence();
  const unsigned = {
    apiVersion: 1 as const,
    deviceId: binding.deviceId,
    eventId: `push-${action}-${Date.now()}`,
    sequence,
    sentAt: new Date().toISOString(),
    payload: {apiVersion: 1 as const, type: 'device.push-token' as const, action, platform: binding.platform, token}
  };
  const signature = await deviceSecurity.signWithDeviceKey(binding.keyAlias, canonicalize(unsigned));
  const response = await fetch(`${binding.apiBaseUrl}/api/devices/${encodeURIComponent(binding.deviceId)}/push-token`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...unsigned, signature})
  });
  if (!response.ok) throw new Error('푸시 알림 설정을 저장하지 못했습니다.');
}
