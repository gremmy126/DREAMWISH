import Foundation
import Security

struct DeviceCredentials: Codable {
    let apiBaseURL: URL
    let deviceId: String
    let deviceSecret: String
}

enum DeviceCredentialStore {
    private static let service = "kr.co.dreamwish.companion.device"
    private static let account = "paired-device"

    static func save(_ value: DeviceCredentials) throws {
        let data = try JSONEncoder().encode(value)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        SecItemDelete(query as CFDictionary)
        var insert = query
        insert[kSecValueData as String] = data
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(insert as CFDictionary, nil) == errSecSuccess else { throw DeviceSyncError.keychain }
    }

    static func load() throws -> DeviceCredentials {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
            kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { throw DeviceSyncError.notPaired }
        return try JSONDecoder().decode(DeviceCredentials.self, from: data)
    }
}

actor DeviceSyncClient {
    private var sequence: Int = UserDefaults.standard.integer(forKey: "dreamwish.device.sequence")

    func upload(contacts: [[String: Any]] = [], calendarEvents: [[String: Any]] = []) async throws {
        let credentials = try DeviceCredentialStore.load()
        sequence += 1
        var request = URLRequest(url: credentials.apiBaseURL.appending(path: "/api/devices/\(credentials.deviceId)/sync"))
        request.httpMethod = "POST"
        request.setValue("Device \(credentials.deviceSecret)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["sequence": sequence, "contacts": contacts, "calendarEvents": calendarEvents])
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw DeviceSyncError.rejected }
        UserDefaults.standard.set(sequence, forKey: "dreamwish.device.sequence")
    }
}

enum DeviceSyncError: Error { case keychain, notPaired, rejected }
