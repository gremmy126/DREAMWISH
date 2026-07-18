import {NativeModules, Platform} from 'react-native';
import type {DeviceBinding} from '../types';

type DeviceSecurityBridge = {
  generateDeviceKey(alias: string): Promise<{keyAlias: string; publicKeySpki: string}>;
  signWithDeviceKey(alias: string, canonicalMessage: string): Promise<string>;
  saveDeviceBinding(binding: DeviceBinding): Promise<void>;
  loadDeviceBinding(): Promise<DeviceBinding | null>;
  deleteDeviceBinding(): Promise<void>;
  nextSequence(): Promise<number>;
  encryptQueuePayload(plaintext: string): Promise<string>;
  decryptQueuePayload(ciphertext: string): Promise<string>;
  getAllowedNotificationPackages(): Promise<string[]>;
  setAllowedNotificationPackages(packages: string[]): Promise<void>;
  openNotificationAccessSettings(): Promise<void>;
  peekSharedRevenueEvent(): Promise<{queueId: string; event: {eventId: string; sourceApp: string; capturedAt: string; rawText: string}} | null>;
  ackSharedRevenueEvent(queueId: string): Promise<void>;
  retrySharedRevenueEvent(queueId: string): Promise<void>;
};

const bridge = NativeModules.DreamwishDeviceSecurity as DeviceSecurityBridge | undefined;

function requiredBridge(): DeviceSecurityBridge {
  if (!bridge) throw new Error('보안 모듈을 사용할 수 없습니다. 앱을 다시 설치해 주세요.');
  return bridge;
}

export const deviceSecurity = {
  generateDeviceKey: (alias: string) => requiredBridge().generateDeviceKey(alias),
  signWithDeviceKey: (alias: string, message: string) => requiredBridge().signWithDeviceKey(alias, message),
  saveDeviceBinding: (binding: DeviceBinding) => requiredBridge().saveDeviceBinding(binding),
  loadDeviceBinding: () => requiredBridge().loadDeviceBinding(),
  deleteDeviceBinding: () => requiredBridge().deleteDeviceBinding(),
  nextSequence: () => requiredBridge().nextSequence(),
  encryptQueuePayload: (plaintext: string) => requiredBridge().encryptQueuePayload(plaintext),
  decryptQueuePayload: (ciphertext: string) => requiredBridge().decryptQueuePayload(ciphertext),
  getAllowedNotificationPackages: () => Platform.OS === 'android' ? requiredBridge().getAllowedNotificationPackages() : Promise.resolve([]),
  setAllowedNotificationPackages: (packages: string[]) => Platform.OS === 'android' ? requiredBridge().setAllowedNotificationPackages(packages) : Promise.resolve(),
  openNotificationAccessSettings: () => Platform.OS === 'android' ? requiredBridge().openNotificationAccessSettings() : Promise.resolve(),
  peekSharedRevenueEvent: () => Platform.OS === 'ios' ? requiredBridge().peekSharedRevenueEvent() : Promise.resolve(null),
  ackSharedRevenueEvent: (queueId: string) => Platform.OS === 'ios' ? requiredBridge().ackSharedRevenueEvent(queueId) : Promise.resolve(),
  retrySharedRevenueEvent: (queueId: string) => Platform.OS === 'ios' ? requiredBridge().retrySharedRevenueEvent(queueId) : Promise.resolve(),
  platform: Platform.OS === 'ios' ? 'ios' as const : 'android' as const
};
