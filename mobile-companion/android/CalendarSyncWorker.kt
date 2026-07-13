package kr.co.dreamwish.companion

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CalendarContract
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId

class CalendarSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        if (ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.READ_CALENDAR) != PackageManager.PERMISSION_GRANTED) return Result.failure()
        val events = JSONArray()
        applicationContext.contentResolver.query(
            CalendarContract.Events.CONTENT_URI,
            arrayOf(CalendarContract.Events._ID, CalendarContract.Events.TITLE, CalendarContract.Events.DTSTART, CalendarContract.Events.DTEND, CalendarContract.Events.CALENDAR_DISPLAY_NAME),
            "${CalendarContract.Events.DTSTART} >= ?",
            arrayOf((System.currentTimeMillis() - 30L * 86400000L).toString()),
            "${CalendarContract.Events.DTSTART} ASC"
        )?.use { cursor ->
            while (cursor.moveToNext() && events.length() < 500) {
                events.put(JSONObject()
                    .put("externalId", cursor.getString(0))
                    .put("title", cursor.getString(1).orEmpty())
                    .put("startsAt", Instant.ofEpochMilli(cursor.getLong(2)).toString())
                    .put("endsAt", Instant.ofEpochMilli(cursor.getLong(3).takeIf { it > 0 } ?: cursor.getLong(2)).toString())
                    .put("timezone", ZoneId.systemDefault().id)
                    .put("sourceCalendar", cursor.getString(4).orEmpty()))
            }
        }
        return runCatching { DeviceSyncClient.upload(applicationContext, calendarEvents = events) }
            .fold({ Result.success() }, { Result.retry() })
    }
}
