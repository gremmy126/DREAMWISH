package kr.co.dreamwish.companion.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kr.co.dreamwish.companion.capture.EncryptedRevenueQueue

class RevenueSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        return try {
            while (true) {
                val event = EncryptedRevenueQueue.peek(applicationContext) ?: return Result.success()
                SignedSyncClient.uploadRevenue(applicationContext, event)
                EncryptedRevenueQueue.acknowledge(applicationContext)
            }
            @Suppress("UNREACHABLE_CODE") Result.success()
        } catch (error: RevokedDeviceException) {
            Result.failure()
        } catch (error: Throwable) {
            if (runAttemptCount >= 8) Result.failure() else Result.retry()
        }
    }
}

class RevokedDeviceException : RuntimeException()
