package com.anyvo.wear.transporttest

import android.app.Activity
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import expo.modules.anyvowearablecontrol.protocol.Wire
import expo.modules.anyvowearablecontrol.transport.NearbyEndpoint
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** DEBUG ONLY: synthetic interactive transport fixture. Never a recorder or production companion. */
class TransportTestActivity : Activity() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private var endpoint: NearbyEndpoint? = null
  private lateinit var label: TextView
  private var contextId = UUID.randomUUID().toString()
  private var lease = UUID.randomUUID().toString()
  private var expiry = 0L
  private var sequence = 0L
  private var revision = 0L
  private var count = 0
  private var phase = "lay_recording"
  private var silent = false
  private val results = linkedMapOf<String, Pair<String, String>>()

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    label = TextView(this).apply { textSize = 18f }
    val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(28, 50, 28, 28); addView(label) }
    fun button(title: String, action: () -> Unit) { layout.addView(Button(this).apply { text = title; setOnClickListener { action() } }) }
    button("Neue synthetische Sitzung") { contextId = UUID.randomUUID().toString(); revision = 0; phase = "lay_recording"; results.clear(); expiry = 0; render(); scope.launch { publish() } }
    button("Antworten stumm / aktiv") { silent = !silent; render() }
    setContentView(layout); render()
  }
  override fun onStart() {
    super.onStart()
    scope.launch {
      val transport = NearbyEndpoint(this@TransportTestActivity, Wire.WATCH_CAPABILITY,
        { peer, path, bytes -> val deadline = System.currentTimeMillis() + 5_000; scope.launch { receive(peer, path, bytes, deadline) } },
        { scope.launch { publish() } })
      endpoint = transport
      transport.start(); publish()
    }
  }
  override fun onStop() { endpoint?.stop(); endpoint = null; super.onStop() }
  override fun onDestroy() { scope.cancel(); super.onDestroy() }
  private fun render() { label.text = "ANYVO Transporttest\nSynthetischer Hund – KEINE Aufnahme\nPhase: $phase\nAusgeführte Testaktionen: $count\nAntworten: ${if (silent) "stumm" else "aktiv"}" }
  private fun snapshot(): String {
    if (System.currentTimeMillis() + 10_000 >= expiry) { lease = UUID.randomUUID().toString(); expiry = System.currentTimeMillis() + 30_000 }
    val actions = when (phase) {
      "lay_recording" -> listOf("mark_object", "pause", "end_phase")
      "lay_paused" -> listOf("resume", "end_phase")
      else -> emptyList()
    }
    return JSONObject().put("protocolVersion", 1).put("kind", "snapshot").put("contextId", contextId)
      .put("revision", revision).put("sequence", ++sequence).put("leaseId", lease).put("expiresAtMs", expiry)
      .put("sessionId", "synthetic-run").put("dogId", "synthetic-dog").put("dogName", "Testhund")
      .put("phase", phase).put("distanceM", 42.5).put("elapsedSeconds", 61).put("capabilities", JSONArray(actions)).toString()
  }
  private suspend fun publish() { val peer = endpoint?.peer() ?: return; if (!silent) endpoint?.send(peer, Wire.SNAPSHOT_PATH, snapshot().toByteArray()) }
  private suspend fun receive(peer: String, path: String, bytes: ByteArray, deadline: Long) {
    if (path != Wire.COMMAND_PATH || endpoint?.peer() != peer || silent || System.currentTimeMillis() >= deadline) return
    val json = runCatching { Wire.decode(bytes) }.getOrNull() ?: return
    if (Wire.isRequest(json)) { endpoint?.send(peer, Wire.SNAPSHOT_PATH, snapshot().toByteArray()); return }
    val command = runCatching { Wire.command(json) }.getOrNull() ?: return
    val duplicate = results[command.commandId]
    if (duplicate != null) { if (duplicate.first == command.json) endpoint?.send(peer, Wire.ACK_PATH, duplicate.second.toByteArray()); return }
    val allowed = Wire.snapshot(snapshot()).capabilities
    val reason = when {
      command.contextId != contextId -> "stale_context"
      command.revision != revision -> "stale_revision"
      command.leaseId != lease || System.currentTimeMillis() >= expiry -> "expired"
      command.sessionId != "synthetic-run" || command.dogId != "synthetic-dog" -> "wrong_target"
      command.action !in allowed -> "not_allowed"
      command.action == "end_phase" && !command.confirmed -> "confirmation_required"
      else -> "ok"
    }
    if (reason == "ok") {
      count++
      when (command.action) { "pause" -> { phase = "lay_paused"; revision++ }; "resume" -> { phase = "lay_recording"; revision++ }; "end_phase" -> { phase = "finished"; revision++ } }
      render()
    }
    val ack = JSONObject().put("protocolVersion", 1).put("kind", "ack").put("commandId", command.commandId)
      .put("status", if (reason == "ok") "accepted" else "rejected").put("reason", reason).put("snapshot", JSONObject(snapshot())).toString()
    results[command.commandId] = command.json to ack
    while (results.size > 128) results.remove(results.keys.first())
    endpoint?.send(peer, Wire.ACK_PATH, ack.toByteArray())
  }
}
