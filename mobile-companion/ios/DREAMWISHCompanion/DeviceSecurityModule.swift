import Foundation
import CryptoKit
import Security

@objc(DreamwishDeviceSecurity)
final class DreamwishDeviceSecurity: NSObject {
  private let service = "kr.co.dreamwish.companion.device"
  private let accessGroup = "kr.co.dreamwish.companion.shared"
  private let defaults = UserDefaults(suiteName: "group.kr.co.dreamwish.companion")!

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func generateDeviceKey(_ alias: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    perform(resolve, reject) {
      let key: P256.Signing.PrivateKey
      if let stored = try? self.read(account: "key:\(alias)") { key = try P256.Signing.PrivateKey(rawRepresentation: stored) }
      else { key = P256.Signing.PrivateKey(); try self.write(key.rawRepresentation, account: "key:\(alias)") }
      let spkiPrefix = Data([0x30,0x59,0x30,0x13,0x06,0x07,0x2A,0x86,0x48,0xCE,0x3D,0x02,0x01,0x06,0x08,0x2A,0x86,0x48,0xCE,0x3D,0x03,0x01,0x07,0x03,0x42,0x00])
      return ["keyAlias": alias, "publicKeySpki": (spkiPrefix + key.publicKey.x963Representation).base64EncodedString()]
    }
  }

  @objc func signWithDeviceKey(_ alias: String, message: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    perform(resolve, reject) {
      let key = try P256.Signing.PrivateKey(rawRepresentation: self.read(account: "key:\(alias)"))
      return try key.signature(for: Data(message.utf8)).derRepresentation.base64URLEncodedString()
    }
  }

  @objc func saveDeviceBinding(_ binding: NSDictionary, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    perform(resolve, reject) {
      try self.write(try JSONSerialization.data(withJSONObject: binding), account: "binding")
      self.defaults.set(0, forKey: "sequence")
      return NSNull()
    }
  }
  @objc func loadDeviceBinding(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    do { resolve(try JSONSerialization.jsonObject(with: read(account: "binding"))) }
    catch { resolve(nil) }
  }
  @objc func deleteDeviceBinding(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    perform(resolve, reject) {
      if let data = try? self.read(account: "binding"), let binding = try? JSONSerialization.jsonObject(with: data) as? [String: String], let alias = binding?["keyAlias"] { self.delete(account: "key:\(alias)") }
      self.delete(account: "binding"); self.defaults.removeObject(forKey: "sequence"); return NSNull()
    }
  }
  @objc func nextSequence(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    objc_sync_enter(self); defer { objc_sync_exit(self) }
    let next = defaults.integer(forKey: "sequence") + 1; defaults.set(next, forKey: "sequence"); resolve(next)
  }
  @objc func encryptQueuePayload(_ plaintext: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    perform(resolve, reject) { try AES.GCM.seal(Data(plaintext.utf8), using: self.queueKey()).combined!.base64EncodedString() }
  }
  @objc func decryptQueuePayload(_ ciphertext: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    perform(resolve, reject) { String(decoding: try AES.GCM.open(try AES.GCM.SealedBox(combined: Data(base64Encoded: ciphertext)!), using: self.queueKey()), as: UTF8.self) }
  }
  @objc func getAllowedNotificationPackages(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) { resolve([]) }
  @objc func setAllowedNotificationPackages(_ packages: NSArray, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) { resolve(nil) }
  @objc func openNotificationAccessSettings(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) { resolve(nil) }
  @objc func peekSharedRevenueEvent(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task {
      do {
        guard let (row, event) = try await EncryptedOfflineQueue.shared.due() else { resolve(nil); return }
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(event)
        let object = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        resolve(["queueId": row.id, "event": object])
      } catch { reject("SHARE_QUEUE", "Unable to read the shared revenue queue", error) }
    }
  }
  @objc func ackSharedRevenueEvent(_ queueId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task { do { try await EncryptedOfflineQueue.shared.acknowledge(queueId); resolve(nil) } catch { reject("SHARE_QUEUE", "Unable to acknowledge the shared revenue queue", error) } }
  }
  @objc func retrySharedRevenueEvent(_ queueId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    Task { do { try await EncryptedOfflineQueue.shared.retry(queueId); resolve(nil) } catch { reject("SHARE_QUEUE", "Unable to retry the shared revenue queue", error) } }
  }

  private func queueKey() throws -> SymmetricKey {
    if let data = try? read(account: "queue-key") { return SymmetricKey(data: data) }
    let key = SymmetricKey(size: .bits256); try write(key.withUnsafeBytes { Data($0) }, account: "queue-key"); return key
  }
  private func write(_ data: Data, account: String) throws {
    delete(account: account)
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account, kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
    guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else { throw NSError(domain: "DeviceSecurity", code: 1) }
  }
  private func read(account: String) throws -> Data {
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
    var value: CFTypeRef?; guard SecItemCopyMatching(query as CFDictionary, &value) == errSecSuccess, let data = value as? Data else { throw NSError(domain: "DeviceSecurity", code: 2) }; return data
  }
  private func delete(account: String) { SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account] as CFDictionary) }
  private func perform(_ resolve: RCTPromiseResolveBlock, _ reject: RCTPromiseRejectBlock, _ operation: () throws -> Any) { do { resolve(try operation()) } catch { reject("DEVICE_SECURITY", "Device security operation failed", error) } }
}

private extension Data {
  func base64URLEncodedString() -> String { base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }
}
