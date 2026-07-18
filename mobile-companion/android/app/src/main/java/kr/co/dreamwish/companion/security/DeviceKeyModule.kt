package kr.co.dreamwish.companion.security

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableArray
import android.content.Intent
import android.provider.Settings
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class DeviceKeyModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = "DreamwishDeviceSecurity"
    private val prefs get() = context.getSharedPreferences("dreamwish.secure.device", 0)

    @ReactMethod fun generateDeviceKey(alias: String, promise: Promise) = run(promise) {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (!store.containsAlias(alias)) {
            val builder = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
                .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setUserAuthenticationRequired(false)
            if (Build.VERSION.SDK_INT >= 28) builder.setUnlockedDeviceRequired(true)
            if (Build.VERSION.SDK_INT >= 28) runCatching { builder.setIsStrongBoxBacked(true) }
            runCatching { KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore").apply { initialize(builder.build()); generateKeyPair() } }
                .getOrElse {
                    val fallback = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
                        .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1")).setDigests(KeyProperties.DIGEST_SHA256)
                        .setUserAuthenticationRequired(false).build()
                    KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore").apply { initialize(fallback); generateKeyPair() }
                }
        }
        val publicKey = store.getCertificate(alias).publicKey.encoded
        Arguments.createMap().apply { putString("keyAlias", alias); putString("publicKeySpki", Base64.encodeToString(publicKey, Base64.NO_WRAP)) }
    }

    @ReactMethod fun signWithDeviceKey(alias: String, message: String, promise: Promise) = run(promise) {
        val key = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.getKey(alias, null) ?: error("Device key not found")
        val signature = Signature.getInstance("SHA256withECDSA").apply { initSign(key as java.security.PrivateKey); update(message.toByteArray(Charsets.UTF_8)) }.sign()
        Base64.encodeToString(signature, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }

    @ReactMethod fun saveDeviceBinding(binding: ReadableMap, promise: Promise) = run(promise) {
        val value = org.json.JSONObject().put("apiBaseUrl", binding.getString("apiBaseUrl")).put("deviceId", binding.getString("deviceId"))
            .put("keyAlias", binding.getString("keyAlias")).put("platform", binding.getString("platform")).toString()
        prefs.edit().putString("binding", encrypt(value)).apply()
        context.getSharedPreferences("dreamwish.device.routing", 0).edit()
            .putString("apiBaseUrl", binding.getString("apiBaseUrl"))
            .putString("deviceId", binding.getString("deviceId"))
            .putString("keyAlias", binding.getString("keyAlias"))
            .putLong("sequence", 0).apply(); null
    }
    @ReactMethod fun loadDeviceBinding(promise: Promise) = run(promise) {
        val value = prefs.getString("binding", null) ?: return@run null
        val json = org.json.JSONObject(decrypt(value)); Arguments.createMap().apply {
            putString("apiBaseUrl", json.getString("apiBaseUrl")); putString("deviceId", json.getString("deviceId")); putString("keyAlias", json.getString("keyAlias")); putString("platform", json.getString("platform"))
        }
    }
    @ReactMethod fun deleteDeviceBinding(promise: Promise) = run(promise) {
        prefs.getString("binding", null)?.let { org.json.JSONObject(decrypt(it)).optString("keyAlias") }?.takeIf { it.isNotBlank() }?.let {
            KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(it) }
        }
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        listOf("dreamwish-queue-aes", "dreamwish-native-revenue-queue").forEach { if (store.containsAlias(it)) store.deleteEntry(it) }
        prefs.edit().clear().apply()
        context.getSharedPreferences("dreamwish.device.routing", 0).edit().clear().apply()
        context.getSharedPreferences("dreamwish.native.revenue.queue", 0).edit().clear().apply(); null
    }
    @ReactMethod fun nextSequence(promise: Promise) = run(promise) { DeviceSequence.next(context).toDouble() }
    @ReactMethod fun getAllowedNotificationPackages(promise: Promise) = run(promise) {
        Arguments.fromList(context.getSharedPreferences("dreamwish.capture.allowlist", 0)
            .getStringSet("allowedPackages", emptySet()).orEmpty().sorted())
    }
    @ReactMethod fun setAllowedNotificationPackages(packages: ReadableArray, promise: Promise) = run(promise) {
        val safe = (0 until packages.size()).mapNotNull { packages.getString(it)?.trim() }
            .filter { it.matches(Regex("^[A-Za-z0-9._]+$")) }.take(50).toSet()
        context.getSharedPreferences("dreamwish.capture.allowlist", 0).edit().putStringSet("allowedPackages", safe).commit()
    }
    @ReactMethod fun openNotificationAccessSettings(promise: Promise) = run(promise) {
        context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); null
    }
    @ReactMethod fun encryptQueuePayload(value: String, promise: Promise) = run(promise) { encrypt(value) }
    @ReactMethod fun decryptQueuePayload(value: String, promise: Promise) = run(promise) { decrypt(value) }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, queueKey()) }
        return Base64.encodeToString(cipher.iv + cipher.doFinal(value.toByteArray()), Base64.NO_WRAP)
    }
    private fun decrypt(value: String): String {
        val bytes = Base64.decode(value, Base64.NO_WRAP); val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, queueKey(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        return String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)))
    }
    private fun queueKey(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("dreamwish-queue-aes", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("dreamwish-queue-aes", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    private fun run(promise: Promise, block: () -> Any?) { try { promise.resolve(block()) } catch (error: Throwable) { promise.reject("DEVICE_SECURITY", "Device security operation failed", error) } }
}
