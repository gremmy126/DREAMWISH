import Contacts from 'react-native-contacts';
import RNCalendarEvents from 'react-native-calendar-events';
import {enqueueOfflinePayload} from '../storage/offline-queue';
import {flushOfflineQueue} from './device-sync';

export async function syncContactsWithConsent() {
  const permission = await Contacts.requestPermission();
  if (permission !== 'authorized' && permission !== 'limited') throw new Error('연락처 읽기 권한이 필요합니다.');
  const contacts = await Contacts.getAllWithoutPhotos();
  const candidates = contacts.slice(0, 500).map(contact => ({
    externalId: contact.recordID,
    name: contact.displayName || [contact.givenName, contact.familyName].filter(Boolean).join(' '),
    phone: contact.phoneNumbers[0]?.number,
    email: contact.emailAddresses[0]?.email,
    companyName: contact.company || undefined,
    position: contact.jobTitle || undefined
  }));
  await enqueueOfflinePayload({apiVersion: 1, type: 'device.sync', contacts: candidates, calendarEvents: [], revenueSignals: []});
  const result = await flushOfflineQueue();
  return {count: candidates.length, pending: result.pending};
}

export async function syncCalendarWithConsent() {
  const permission = await RNCalendarEvents.requestPermissions(true);
  if (permission !== 'authorized') throw new Error('캘린더 읽기 권한이 필요합니다.');
  const calendars = await RNCalendarEvents.findCalendars();
  const now = new Date();
  const end = new Date(now); end.setUTCFullYear(end.getUTCFullYear() + 1);
  const events = await RNCalendarEvents.fetchAllEvents(now.toISOString(), end.toISOString(), calendars.map(calendar => calendar.id));
  const candidates = events.slice(0, 500).map(event => ({
    externalId: event.id,
    title: event.title,
    startsAt: new Date(event.startDate).toISOString(),
    endsAt: new Date(event.endDate || event.startDate).toISOString(),
    timezone: event.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    sourceCalendar: event.calendar?.title || 'Default'
  }));
  await enqueueOfflinePayload({apiVersion: 1, type: 'device.sync', contacts: [], calendarEvents: candidates, revenueSignals: []});
  const result = await flushOfflineQueue();
  return {count: candidates.length, pending: result.pending};
}
