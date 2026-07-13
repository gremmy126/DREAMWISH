import SwiftUI

struct PairingView: View {
    let challengeId: String
    let apiBaseURL: URL
    @State private var code = ""
    @State private var status = "웹에 표시된 6자리 코드를 입력하세요."
    @State private var isConnecting = false

    var body: some View {
        Form {
            Section("설정 → DREAMWISH 연결 → 웹 코드 입력") {
                TextField("페어링 코드 6자리", text: $code)
                    .keyboardType(.numberPad)
                    .onChange(of: code) { _, value in
                        code = String(value.filter(\.isNumber).prefix(6))
                    }
                Button(isConnecting ? "연결 중…" : "연결") { Task { await pair() } }
                    .disabled(code.count != 6 || isConnecting)
                Text(status).font(.footnote)
            }
        }
        .navigationTitle("DREAMWISH 연결")
    }

    @MainActor
    private func pair() async {
        guard code.count == 6 else { status = "숫자 6자리를 입력해주세요."; return }
        isConnecting = true
        defer { isConnecting = false }
        do {
            var request = URLRequest(url: apiBaseURL.appending(path: "/api/devices/pair"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "challengeId": challengeId, "code": code, "platform": "ios", "name": UIDevice.current.name
            ])
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
                throw PairingError.rejected(message ?? "연결에 실패했습니다.")
            }
            let result = try JSONDecoder().decode(PairingResponse.self, from: data)
            try DeviceCredentialStore.save(.init(apiBaseURL: apiBaseURL, deviceId: result.device.id, deviceSecret: result.deviceSecret))
            status = "연결되었습니다. 웹에서 기기를 확인해주세요."
        } catch {
            status = error.localizedDescription
        }
    }
}

private struct PairingResponse: Decodable { let device: DeviceSummary; let deviceSecret: String }
private struct DeviceSummary: Decodable { let id: String }
private enum PairingError: LocalizedError {
    case rejected(String)
    var errorDescription: String? { if case let .rejected(message) = self { return message }; return nil }
}
