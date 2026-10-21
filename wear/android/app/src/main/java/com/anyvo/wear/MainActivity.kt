package com.anyvo.wear

import android.os.Bundle
import android.os.SystemClock
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.Text
import expo.modules.anyvowearablecontrol.protocol.WatchState
import expo.modules.anyvowearablecontrol.protocol.Wire
import expo.modules.anyvowearablecontrol.transport.NearbyEndpoint
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
  private val state = WatchState(SystemClock::elapsedRealtime, System::currentTimeMillis)
  private var endpoint: NearbyEndpoint? = null
  private var job: Job? = null
  private var generation = 0L
  private var peerId: String? = null
  private var repaint by mutableIntStateOf(0)
  private var connected by mutableStateOf(false)
  private var confirmation by mutableStateOf<Wire.Snapshot?>(null)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent {
      repaint
      MaterialTheme(colorScheme = MaterialTheme.colorScheme.copy(
        primary = colorResource(R.color.anyvo_control_primary),
        onPrimary = colorResource(R.color.anyvo_on_primary)
      )) {
        val scroll = rememberScrollState()
        val rotaryScope = rememberCoroutineScope()
        val focus = remember { FocusRequester() }
        LaunchedEffect(Unit) { focus.requestFocus() }
        BackHandler(enabled = confirmation != null) { confirmation = null }
        Column(Modifier.fillMaxSize().background(colorResource(R.color.anyvo_background)).verticalScroll(scroll)
          .onRotaryScrollEvent { rotaryScope.launch { scroll.scrollBy(it.verticalScrollPixels) }; true }
          .focusRequester(focus).focusable()
          .padding(horizontal = 28.dp, vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally,
          verticalArrangement = Arrangement.spacedBy(6.dp)) {
          Image(painterResource(R.drawable.anyvo_icon), "ANYVO", Modifier.size(28.dp))
          val snapshot = state.snapshot
          Text(if (!connected) getString(R.string.connect_phone) else snapshot?.dogName ?: getString(R.string.prepare_phone),
            textAlign = TextAlign.Center, style = MaterialTheme.typography.titleSmall)
          Text(if (!connected || snapshot == null) getString(R.string.open_phone)
            else if (snapshot.capabilities.isEmpty()) phaseLabel(snapshot.phase)
            else if (!state.usable()) getString(R.string.expired)
            else phaseLabel(snapshot.phase), textAlign = TextAlign.Center, style = MaterialTheme.typography.bodySmall)
          if (snapshot != null && state.usable()) {
            val metrics = listOfNotNull(snapshot.distanceM?.let { "${it.toInt()} m" }, snapshot.elapsedSeconds?.let {
              val seconds = it.toLong(); "${seconds / 60}:${(seconds % 60).toString().padStart(2, '0')} min"
            }).joinToString(" · ")
            if (metrics.isNotEmpty()) Text(metrics, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodySmall)
          }
          val confirm = confirmation
          if (confirm != null) {
            Text(getString(R.string.confirm_end), textAlign = TextAlign.Center)
            Button(onClick = {
              confirmation = null
              if (state.canConfirm(confirm)) command("end_phase", true)
            }, enabled = state.canConfirm(confirm), modifier = Modifier.fillMaxWidth()) { Text(getString(R.string.end_yes)) }
            Button(onClick = { confirmation = null }, modifier = Modifier.fillMaxWidth()) { Text(getString(R.string.cancel)) }
          } else {
            Wire.actions.filter { it in state.availableActions() }.forEach { action ->
              Button(onClick = { if (action == "end_phase") confirmation = state.snapshot else command(action, false) },
                modifier = Modifier.fillMaxWidth()) { Text(actionLabel(action)) }
            }
          }
          if (state.pending != null) Text(getString(R.string.wait_phone), textAlign = TextAlign.Center)
          state.feedback?.let { Text(feedbackLabel(it), textAlign = TextAlign.Center, style = MaterialTheme.typography.bodySmall) }
          Button(onClick = { lifecycleScope.launch { refresh() } }, modifier = Modifier.fillMaxWidth()) { Text(getString(R.string.refresh)) }
          Spacer(Modifier.height(12.dp))
        }
      }
    }
  }

  override fun onResume() {
    super.onResume()
    val version = ++generation
    job = lifecycleScope.launch {
      val transport = NearbyEndpoint(this@MainActivity, Wire.PHONE_CAPABILITY,
        { peer, path, bytes -> lifecycleScope.launch { receive(version, peer, path, bytes) } },
        { lifecycleScope.launch { refresh() } })
      endpoint = transport
      if (transport.start() && generation == version) {
        var ticks = 0
        while (generation == version) {
          if (ticks++ % 10 == 0) refresh()
          state.tick(); repaint++
          delay(1_000)
        }
      }
    }
  }

  override fun onPause() {
    generation++; job?.cancel(); endpoint?.stop(); endpoint = null
    connected = false; peerId = null; state.transportReset(); confirmation = null; repaint++
    super.onPause()
  }

  private suspend fun refresh() {
    val version = generation
    val peer = endpoint?.peer()
    if (generation != version) return
    if (peer != peerId) { state.transportReset(); confirmation = null; peerId = peer }
    connected = peer != null
    if (peer != null) endpoint?.send(peer, Wire.COMMAND_PATH, Wire.REQUEST.toByteArray()) { generation == version }
    repaint++
  }

  private fun command(action: String, confirmed: Boolean) {
    val peer = peerId ?: return
    val command = runCatching { state.begin(action, confirmed) }.getOrNull() ?: return
    val version = generation
    repaint++
    lifecycleScope.launch {
      val sent = endpoint?.send(peer, Wire.COMMAND_PATH, command.json.toByteArray()) {
        generation == version && peerId == peer && state.pending?.commandId == command.commandId && state.usable()
      } == true
      if (!sent && generation == version) { state.sendFailed(); repaint++ }
    }
  }

  private suspend fun receive(version: Long, peer: String, path: String, bytes: ByteArray) {
    if (version != generation || bytes.size > Wire.MAX_BYTES) return
    val target = endpoint?.peer()
    if (version != generation || peer != target || peer != peerId) return
    when (path) {
      Wire.CLEAR_PATH -> { state.clear(); confirmation = null }
      Wire.SNAPSHOT_PATH -> runCatching { state.receive(Wire.snapshot(Wire.decode(bytes))) }
      Wire.ACK_PATH -> runCatching { state.receive(Wire.ack(Wire.decode(bytes))) }
    }
    val confirm = confirmation
    if (confirm != null && !state.canConfirm(confirm)) confirmation = null
    repaint++
  }

  private fun actionLabel(action: String) = when (action) {
    "start_lay" -> getString(R.string.start_lay); "start_search" -> getString(R.string.start_search); "mark_object" -> getString(R.string.mark_object)
    "pause" -> getString(R.string.pause); "resume" -> getString(R.string.resume); "end_phase" -> getString(R.string.end_phase); else -> ""
  }
  private fun phaseLabel(phase: String) = when (phase) {
    "lay_prepared" -> getString(R.string.lay_prepared); "search_prepared" -> getString(R.string.search_prepared)
    "lay_recording" -> getString(R.string.lay_recording); "search_recording" -> getString(R.string.search_recording)
    "lay_paused", "search_paused" -> getString(R.string.paused); "finishing" -> getString(R.string.finishing)
    "finished" -> getString(R.string.finished); else -> getString(R.string.prepare_phone)
  }
  private fun feedbackLabel(reason: String) = when (reason) {
    "accepted" -> getString(R.string.accepted)
    "unconfirmed" -> getString(R.string.unconfirmed)
    "busy" -> getString(R.string.busy)
    else -> getString(R.string.rejected)
  }
}
