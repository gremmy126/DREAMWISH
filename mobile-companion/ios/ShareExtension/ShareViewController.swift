import Social
import UniformTypeIdentifiers

final class ShareViewController: SLComposeServiceViewController {
  private static let maximumLength = 4_000
  override func isContentValid() -> Bool {
    let value = (contentText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    return !value.isEmpty && value.count <= Self.maximumLength
  }
  override func didSelectPost() {
    let value = (contentText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !value.isEmpty, value.count <= Self.maximumLength else { extensionContext?.cancelRequest(withError: ShareError.invalidText); return }
    let redacted = value.replacingOccurrences(of: #"(?<!\d)(\d{2,6})[- ]?(\d{2,6})[- ]?(\d{4,8})(?!\d)"#, with: "***-***-$3", options: .regularExpression)
    let event = SharedRevenueEvent(eventId: "ios-share-\(UUID().uuidString)", sourceApp: "ios-share-extension", capturedAt: Date(), rawText: redacted)
    Task {
      do { try await SharedRevenueInbox.store(event); extensionContext?.completeRequest(returningItems: []) }
      catch { extensionContext?.cancelRequest(withError: error) }
    }
  }
}

enum ShareError: Error { case invalidText }
enum SharedRevenueInbox { static func store(_ event: SharedRevenueEvent) async throws { try await EncryptedOfflineQueue.shared.enqueue(event) } }
