import Foundation
import CryptoKit
import Security

actor EncryptedOfflineQueue {
  static let shared = EncryptedOfflineQueue()
  static let appGroup = "group.kr.co.dreamwish.companion"
  private let fileURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)!.appendingPathComponent("revenue-queue.v1")

  struct Row: Codable { let id: String; let ciphertext: Data; var attempt: Int; var nextAttemptAt: Date }

  func enqueue(_ event: SharedRevenueEvent) throws {
    var rows = try load(); let sealed = try AES.GCM.seal(try JSONEncoder().encode(event), using: try queueKey()).combined!
    rows.append(Row(id: UUID().uuidString, ciphertext: sealed, attempt: 0, nextAttemptAt: Date()))
    try save(Array(rows.suffix(500)))
  }
  func due() throws -> (Row, SharedRevenueEvent)? {
    guard let row = try load().first(where: { $0.nextAttemptAt <= Date() }) else { return nil }
    let data = try AES.GCM.open(try AES.GCM.SealedBox(combined: row.ciphertext), using: try queueKey())
    return (row, try JSONDecoder().decode(SharedRevenueEvent.self, from: data))
  }
  func acknowledge(_ id: String) throws { try save(try load().filter { $0.id != id }) }
  func retry(_ id: String) throws {
    var rows = try load(); guard let index = rows.firstIndex(where: { $0.id == id }) else { return }
    rows[index].attempt += 1; rows[index].nextAttemptAt = Date().addingTimeInterval(min(21_600, 15 * pow(2, Double(rows[index].attempt))))
    try save(rows)
  }
  private func load() throws -> [Row] { guard FileManager.default.fileExists(atPath: fileURL.path) else { return [] }; return try JSONDecoder().decode([Row].self, from: Data(contentsOf: fileURL)) }
  private func save(_ rows: [Row]) throws { try JSONEncoder().encode(rows).write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]) }
  private func queueKey() throws -> SymmetricKey {
    if let data = try SharedQueueKeychain.read() { return SymmetricKey(data: data) }
    let key = SymmetricKey(size: .bits256)
    try SharedQueueKeychain.write(key.withUnsafeBytes { Data($0) })
    return key
  }
}

struct SharedRevenueEvent: Codable { let eventId: String; let sourceApp: String; let capturedAt: Date; let rawText: String }

private enum SharedQueueKeychain {
  private static let service = "kr.co.dreamwish.companion.shared-revenue"
  private static let account = "queue-key-v1"
  static func read() throws -> Data? {
    var query = baseQuery()
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var value: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &value)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = value as? Data else { throw NSError(domain: "SharedQueueKeychain", code: Int(status)) }
    return data
  }
  static func write(_ data: Data) throws {
    var query = baseQuery()
    query[kSecValueData as String] = data
    query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else { throw NSError(domain: "SharedQueueKeychain", code: Int(status)) }
  }
  private static func baseQuery() -> [String: Any] {
    var query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    if let group = Bundle.main.object(forInfoDictionaryKey: "DREAMWISHKeychainAccessGroup") as? String, !group.isEmpty {
      query[kSecAttrAccessGroup as String] = group
    }
    return query
  }
}
