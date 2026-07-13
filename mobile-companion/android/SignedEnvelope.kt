package kr.co.dreamwish.companion

import android.content.Context
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class DeviceCredentials(val apiBaseUrl: String, val deviceId: String, val deviceSecret: String)

object DeviceCredentialStore {
    private const val ALIAS = "dreamwish-device-secret"
    private const val PREFS = "dreamwish-device"

    fun save(context: Context, value: DeviceCredentials) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val encrypted = cipher.doFinal(value.deviceSecret.toByteArray())
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("apiBaseUrl", value.apiBaseUrl)
            .putString("deviceId", value.deviceId)
            .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString("secret", Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .putLong("sequence", 0)
            .apply()
    }

    fun load(context: Context): DeviceCredentials? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val deviceId = prefs.getString("deviceId", null) ?: return null
        val apiBaseUrl = prefs.getString("apiBaseUrl", null) ?: return null
        val iv = Base64.decode(prefs.getString("iv", ""), Base64.NO_WRAP)
        val encrypted = Base64.decode(prefs.getString("secret", ""), Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
        return DeviceCredentials(apiBaseUrl, deviceId, String(cipher.doFinal(encrypted)))
    }

    fun nextSequence(context: Context): Long {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val next = prefs.getLong("sequence", 0) + 1
        prefs.edit().putLong("sequence", next).apply()
        return next
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance("AES", "AndroidKeyStore").run {
            init(android.security.keystore.KeyGenParameterSpec.Builder(
                ALIAS,
                android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or android.security.keystore.KeyProperties.PURPOSE_DECRYPT
            ).setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
                .build())
            generateKey()
        }
    }
}

object DeviceSyncClient {
    fun upload(context: Context, contacts: JSONArray = JSONArray(), calendarEvents: JSONArray = JSONArray()) {
        val credentials = DeviceCredentialStore.load(context) ?: error("Device is not paired")
        val connection = URL("${credentials.apiBaseUrl}/api/devices/${credentials.deviceId}/sync").openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.setRequestProperty("Authorization", "Device ${credentials.deviceSecret}")
        connection.setRequestProperty("Content-Type", "application/json")
        connection.doOutput = true
        val body = JSONObject()
            .put("sequence", DeviceCredentialStore.nextSequence(context))
            .put("contacts", contacts)
            .put("calendarEvents", calendarEvents)
        connection.outputStream.use { it.write(body.toString().toByteArray()) }
        if (connection.responseCode !in 200..299) error("Device sync failed: ${connection.responseCode}")
        connection.inputStream.close()
    }
}
