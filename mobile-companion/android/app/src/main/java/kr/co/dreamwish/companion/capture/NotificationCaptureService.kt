package kr.co.dreamwish.companion.capture

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject

class NotificationCaptureService : NotificationListenerService() {
    private val allowedPackages: Set<String> get() = AllowedPackages.load(this)

    override fun onNotificationPosted(notification: StatusBarNotification) {
        if (notification.packageName !in allowedPackages) return
        val extras = notification.notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        val normalized = redact("$title $text".trim()).take(4_000)
        if (normalized.isBlank()) return
        EncryptedRevenueQueue.enqueue(this, JSONObject()
            .put("eventId", "${notification.packageName}:${notification.key}:${notification.postTime}")
            .put("sourceApp", notification.packageName)
            .put("capturedAt", java.time.Instant.ofEpochMilli(notification.postTime).toString())
            .put("rawText", normalized))
    }

    private fun redact(value: String) = value.replace(Regex("(?<!\\d)(\\d{2,6})[- ]?(\\d{2,6})[- ]?(\\d{4,8})(?!\\d)"), "***-***-$3")
}

object AllowedPackages {
    fun load(context: Context): Set<String> = context.getSharedPreferences("dreamwish.capture.allowlist", Context.MODE_PRIVATE)
        .getStringSet("allowedPackages", emptySet())?.filter { it.matches(Regex("^[A-Za-z0-9._]+$")) }?.toSet().orEmpty()
}
