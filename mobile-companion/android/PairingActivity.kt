package kr.co.dreamwish.companion

import android.app.Activity
import android.os.Bundle
import android.text.InputFilter
import android.text.InputType
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class PairingActivity : Activity() {
    private lateinit var codeInput: EditText
    private lateinit var statusText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = "DREAMWISH 연결"
        codeInput = EditText(this).apply {
            hint = "페어링 코드 6자리"
            inputType = InputType.TYPE_CLASS_NUMBER
            filters = arrayOf(InputFilter.LengthFilter(6))
        }
        statusText = TextView(this)
        val connectButton = Button(this).apply {
            text = "연결"
            setOnClickListener { pairDevice() }
        }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val padding = (24 * resources.displayMetrics.density).toInt()
            setPadding(padding, padding, padding, padding)
            addView(TextView(context).apply { text = "설정 → DREAMWISH 연결 → 웹 코드 입력" })
            addView(codeInput, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            addView(connectButton, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            addView(statusText)
        })
    }

    private fun pairDevice() {
        val code = codeInput.text.toString().trim()
        if (!Regex("\\d{6}").matches(code)) {
            statusText.text = "숫자 6자리를 입력해주세요."
            return
        }
        val challengeId = intent.getStringExtra("challengeId").orEmpty()
        val apiBaseUrl = intent.getStringExtra("apiBaseUrl").orEmpty().trimEnd('/')
        if (challengeId.isBlank() || !apiBaseUrl.startsWith("https://")) {
            statusText.text = "웹 페어링 정보를 다시 열어주세요."
            return
        }
        statusText.text = "연결 중…"
        Thread {
            runCatching {
                val connection = URL("$apiBaseUrl/api/devices/pair").openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true
                connection.outputStream.use { output ->
                    output.write(JSONObject()
                        .put("challengeId", challengeId)
                        .put("code", code)
                        .put("platform", "android")
                        .put("name", android.os.Build.MODEL)
                        .toString().toByteArray())
                }
                val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
                val response = stream.bufferedReader().use { it.readText() }
                if (connection.responseCode !in 200..299) error(JSONObject(response).optString("error", "연결에 실패했습니다."))
                val json = JSONObject(response)
                DeviceCredentialStore.save(
                    this,
                    DeviceCredentials(
                        apiBaseUrl = apiBaseUrl,
                        deviceId = json.getJSONObject("device").getString("id"),
                        deviceSecret = json.getString("deviceSecret")
                    )
                )
            }.onSuccess {
                runOnUiThread { statusText.text = "연결되었습니다. 웹에서 기기를 확인해주세요." }
            }.onFailure { error ->
                runOnUiThread { statusText.text = error.message ?: "연결에 실패했습니다." }
            }
        }.start()
    }
}
