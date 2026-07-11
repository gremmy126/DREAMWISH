import Social
import UniformTypeIdentifiers

final class ShareViewController: SLComposeServiceViewController {
    override func isContentValid() -> Bool {
        !(contentText ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    override func didSelectPost() {
        let sharedText = (contentText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !sharedText.isEmpty else {
            extensionContext?.cancelRequest(withError: ShareError.emptyText)
            return
        }
        SharedRevenueInbox.store(text: sharedText, capturedAt: Date())
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }
}

enum ShareError: Error { case emptyText }

enum SharedRevenueInbox {
    static func store(text: String, capturedAt: Date) {
        // Store in an encrypted App Group container; the host app uploads after review.
    }
}
