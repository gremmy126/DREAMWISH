import {Platform} from 'react-native';
import {deviceSecurity} from '../native/device-security';
import {enqueueOfflinePayload} from '../storage/offline-queue';

export async function importIosShareEvents() {
  if (Platform.OS !== 'ios') return 0;
  let imported = 0;
  for (let index = 0; index < 100; index += 1) {
    const queued = await deviceSecurity.peekSharedRevenueEvent();
    if (!queued) return imported;
    try {
      await enqueueOfflinePayload({
        apiVersion: 1,
        type: 'device.sync',
        contacts: [],
        calendarEvents: [],
        revenueSignals: [{...queued.event, capturedAt: new Date(queued.event.capturedAt).toISOString()}]
      });
      await deviceSecurity.ackSharedRevenueEvent(queued.queueId);
      imported += 1;
    } catch (error) {
      await deviceSecurity.retrySharedRevenueEvent(queued.queueId);
      throw error;
    }
  }
  return imported;
}
