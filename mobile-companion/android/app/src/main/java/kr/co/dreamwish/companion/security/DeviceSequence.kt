package kr.co.dreamwish.companion.security

import android.content.Context

object DeviceSequence {
    @Synchronized fun next(context: Context): Long {
        val preferences = context.getSharedPreferences("dreamwish.device.routing", Context.MODE_PRIVATE)
        val next = preferences.getLong("sequence", 0) + 1
        check(preferences.edit().putLong("sequence", next).commit()) { "Unable to persist device sequence" }
        return next
    }
}
