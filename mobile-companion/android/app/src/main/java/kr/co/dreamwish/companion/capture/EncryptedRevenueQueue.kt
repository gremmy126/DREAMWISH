package kr.co.dreamwish.companion.capture

import android.content.Context
import android.util.Base64
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import kr.co.dreamwish.companion.sync.RevenueSyncWorker
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object EncryptedRevenueQueue {
    private const val PREFS = "dreamwish.native.revenue.queue"
    private const val KEY_ALIAS = "dreamwish-native-revenue-queue"

    @Synchronized fun enqueue(context: Context, event: JSONObject) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val rows = JSONArray(prefs.getString("rows", "[]"))
        rows.put(encrypt(event.toString()))
        while (rows.length() > 500) rows.remove(0)
        prefs.edit().putString("rows", rows.toString()).apply()
        WorkManager.getInstance(context).enqueue(
            OneTimeWorkRequestBuilder<RevenueSyncWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        )
    }

    @Synchronized fun peek(context: Context): JSONObject? {
        val rows = JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("rows", "[]"))
        return if (rows.length() == 0) null else JSONObject(decrypt(rows.getString(0)))
    }

    @Synchronized fun acknowledge(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val rows = JSONArray(prefs.getString("rows", "[]")); if (rows.length() > 0) rows.remove(0)
        prefs.edit().putString("rows", rows.toString()).apply()
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        return Base64.encodeToString(cipher.iv + cipher.doFinal(value.toByteArray()), Base64.NO_WRAP)
    }
    private fun decrypt(value: String): String {
        val bytes = Base64.decode(value, Base64.NO_WRAP); val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        return String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)))
    }
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance("AES", "AndroidKeyStore").apply {
            init(android.security.keystore.KeyGenParameterSpec.Builder(KEY_ALIAS,
                android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or android.security.keystore.KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
}
