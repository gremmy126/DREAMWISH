package kr.co.dreamwish.companion.sync

import android.content.Context
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import java.security.Signature
import kr.co.dreamwish.companion.security.DeviceSequence

object SignedSyncClient {
    @Synchronized fun uploadRevenue(context: Context, event: JSONObject) {
        val prefs = context.getSharedPreferences("dreamwish.secure.device", Context.MODE_PRIVATE)
        val bindingCiphertext = prefs.getString("binding", null) ?: throw RevokedDeviceException()
        // The React Native security module owns binding decryption. Native background sync asks the host
        // app to materialize a non-secret routing mirror after pairing; the private key remains in Keystore.
        val routing = context.getSharedPreferences("dreamwish.device.routing", Context.MODE_PRIVATE)
        val baseUrl = routing.getString("apiBaseUrl", null) ?: throw RevokedDeviceException()
        val deviceId = routing.getString("deviceId", null) ?: throw RevokedDeviceException()
        val alias = routing.getString("keyAlias", null) ?: throw RevokedDeviceException()
        val sequence = DeviceSequence.next(context)
        val payload = JSONObject().put("apiVersion", 1).put("type", "device.sync")
            .put("contacts", JSONArray()).put("calendarEvents", JSONArray()).put("revenueSignals", JSONArray().put(event))
        val envelope = JSONObject().put("apiVersion", 1).put("deviceId", deviceId)
            .put("eventId", "android-${java.util.UUID.randomUUID()}").put("sequence", sequence)
            .put("sentAt", java.time.Instant.now().toString()).put("payload", payload)
        val canonical = CanonicalJson.stringify(envelope)
        val key = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.getKey(alias, null) as java.security.PrivateKey
        val signed = Signature.getInstance("SHA256withECDSA").apply { initSign(key); update(canonical.toByteArray()) }.sign()
        envelope.put("signature", Base64.encodeToString(signed, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING))
        val connection = URL("$baseUrl/api/devices/${java.net.URLEncoder.encode(deviceId, "UTF-8")}/sync").openConnection() as HttpURLConnection
        connection.requestMethod = "POST"; connection.setRequestProperty("Content-Type", "application/json"); connection.doOutput = true
        connection.outputStream.use { it.write(envelope.toString().toByteArray()) }
        val body = (if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream).bufferedReader().use { it.readText() }
        if (connection.responseCode == 403 || body.contains("DEVICE_REVOKED")) throw RevokedDeviceException()
        if (connection.responseCode !in 200..299 && !body.contains("DEVICE_EVENT_DUPLICATE")) error("sync rejected")
        require(bindingCiphertext.isNotBlank())
    }
}

object CanonicalJson {
    fun stringify(value: Any?): String = when (value) {
        is JSONObject -> value.keys().asSequence().filter { it != "signature" }.sorted().joinToString(prefix = "{", postfix = "}") { key -> JSONObject.quote(key) + ":" + stringify(value.get(key)) }
        is JSONArray -> (0 until value.length()).joinToString(prefix = "[", postfix = "]") { stringify(value.get(it)) }
        is String -> JSONObject.quote(value)
        JSONObject.NULL, null -> "null"
        else -> value.toString()
    }
}
