import EventKit
import Foundation

struct CalendarSyncService {
    let client: DeviceSyncClient

    func syncRecentEvents() async throws {
        let store = EKEventStore()
        guard try await store.requestFullAccessToEvents() else { throw CalendarSyncError.permissionDenied }
        let start = Calendar.current.date(byAdding: .day, value: -30, to: Date()) ?? Date()
        let end = Calendar.current.date(byAdding: .year, value: 1, to: Date()) ?? Date()
        let events = store.events(matching: store.predicateForEvents(withStart: start, end: end, calendars: nil)).prefix(500)
        let formatter = ISO8601DateFormatter()
        let payload: [[String: Any]] = events.map { event in [
            "externalId": event.eventIdentifier ?? event.calendarItemIdentifier,
            "title": event.title ?? "(제목 없음)",
            "startsAt": formatter.string(from: event.startDate),
            "endsAt": formatter.string(from: event.endDate),
            "timezone": event.timeZone?.identifier ?? TimeZone.current.identifier,
            "sourceCalendar": event.calendar.title
        ] }
        try await client.upload(calendarEvents: payload)
    }
}

enum CalendarSyncError: Error { case permissionDenied }
