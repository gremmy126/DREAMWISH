package kr.co.dreamwish.companion

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.ContactsContract
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject

class ContactSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        if (ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) return Result.failure()
        val contacts = JSONArray()
        applicationContext.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(ContactsContract.CommonDataKinds.Phone.CONTACT_ID, ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER),
            null, null, null
        )?.use { cursor ->
            while (cursor.moveToNext() && contacts.length() < 500) {
                contacts.put(JSONObject()
                    .put("externalId", cursor.getString(0))
                    .put("name", cursor.getString(1).orEmpty())
                    .put("phone", cursor.getString(2).orEmpty())
                    .put("email", "")
                    .put("companyName", "")
                    .put("position", ""))
            }
        }
        return runCatching { DeviceSyncClient.upload(applicationContext, contacts = contacts) }
            .fold({ Result.success() }, { Result.retry() })
    }
}
