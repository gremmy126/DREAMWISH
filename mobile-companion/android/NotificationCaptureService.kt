package kr.co.dreamwish.revenue

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class NotificationCaptureService : NotificationListenerService() {
    private val allowedPackages: Set<String>
        get() = AllowedBankApps.load(applicationContext)

    override fun onNotificationPosted(notification: StatusBarNotification) {
        if (notification.packageName !in allowedPackages) return
        val extras = notification.notification.extras
        val title = extras.getCharSequence("android.title")?.toString().orEmpty()
        val text = extras.getCharSequence("android.text")?.toString().orEmpty()
        if (text.isBlank()) return

        RevenueBridge.enqueueLocally(
            RevenueSignal(
                eventId = "${notification.packageName}:${notification.id}:${notification.postTime}",
                sourceApp = notification.packageName,
                capturedAtEpochMillis = notification.postTime,
                title = title,
                text = text
            )
        )
    }
}

data class RevenueSignal(
    val eventId: String,
    val sourceApp: String,
    val capturedAtEpochMillis: Long,
    val title: String,
    val text: String
)

object AllowedBankApps {
    fun load(context: android.content.Context): Set<String> =
        context.getSharedPreferences("revenue_capture", MODE_PRIVATE)
            .getStringSet("allowed_packages", emptySet())
            ?.toSet()
            .orEmpty()

    private const val MODE_PRIVATE = android.content.Context.MODE_PRIVATE
}

object RevenueBridge {
    fun enqueueLocally(signal: RevenueSignal) {
        // The host app encrypts, signs, and uploads after the user pairs this device.
    }
}
