package expo.modules.anyvowearablecontrol

import android.os.SystemClock
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.anyvowearablecontrol.protocol.Wire
import expo.modules.anyvowearablecontrol.transport.NearbyEndpoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.util.UUID

/** Interactive bridge only. TS remains the sole owner of account, lease and recorder validation. */
class AnyvoWearableControlModule : Module() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private var endpoint: NearbyEndpoint? = null
  @Volatile private var epoch = 0L
  private var active = false
  private var starting = false
  private var observing = false
  private var lifecycle = 0L
  private var peerId: String? = null
  private data class Request(val peer: String, val commandId: String?, val at: Long, val epoch: Long)
  private val requests = linkedMapOf<String, Request>()

  override fun definition() = ModuleDefinition {
    Name("AnyvoWearableControl")
    Events("onCommand", "onConnection")
    Function("isAvailable") {
      appContext.reactContext?.let { com.google.android.gms.common.GoogleApiAvailability.getInstance()
        .isGooglePlayServicesAvailable(it) == com.google.android.gms.common.ConnectionResult.SUCCESS } ?: false
    }
    OnStartObserving { scope.launch { observing = true; start() } }
    OnStopObserving { scope.launch { stop() } }
    AsyncFunction("publishSnapshot") { json: String, promise: Promise ->
      scope.launch {
        val generation = epoch
        val snapshot = runCatching { Wire.snapshot(json) }.getOrNull()
        val target = endpoint?.peer()
        val ok = snapshot != null && active && generation == epoch && target != null &&
          endpoint?.send(target, Wire.SNAPSHOT_PATH, json.toByteArray(Charsets.UTF_8)) { active && epoch == generation } == true
        promise.resolve(ok)
      }
    }
    AsyncFunction("respond") { requestId: String, json: String, promise: Promise ->
      scope.launch {
        val request = requests.remove(requestId)
        val path = runCatching {
          if (request?.commandId == null) { Wire.snapshot(json); Wire.SNAPSHOT_PATH }
          else { require(Wire.ack(json).commandId == request.commandId); Wire.ACK_PATH }
        }.getOrNull()
        val ok = request != null && request.epoch == epoch && active && path != null &&
          SystemClock.elapsedRealtime() - request.at < 5_000 &&
          endpoint?.send(request.peer, path, json.toByteArray(Charsets.UTF_8)) {
            active && request.epoch == epoch && SystemClock.elapsedRealtime() - request.at < 5_000
          } == true
        promise.resolve(ok)
      }
    }
    AsyncFunction("clear") { promise: Promise ->
      scope.launch {
        invalidate()
        val generation = epoch
        val target = endpoint?.peer()
        if (generation == epoch && target != null) endpoint?.send(target, Wire.CLEAR_PATH, byteArrayOf()) { generation == epoch }
        promise.resolve(null)
      }
    }
    OnDestroy { scope.launch { stop(); scope.cancel() } }
  }

  private suspend fun start() {
    if (active || starting) return
    val context = appContext.reactContext ?: return
    starting = true
    val version = lifecycle
    val transport = NearbyEndpoint(context, Wire.WATCH_CAPABILITY,
      { peer, path, bytes ->
        val arrival = SystemClock.elapsedRealtime()
        val deadline = System.currentTimeMillis() + 5_000
        val versionAtArrival = epoch
        scope.launch { incoming(peer, path, bytes, arrival, deadline, versionAtArrival) }
      },
      { scope.launch { connection() } })
    endpoint = transport
    try {
      val ready = transport.start()
      if (version == lifecycle && observing && endpoint === transport) {
        active = ready
        if (active) connection()
      } else transport.stop()
    } finally {
      starting = false
      if (observing && version != lifecycle && !active) start()
    }
  }

  private fun invalidate() { epoch++; requests.clear() }

  private suspend fun connection() {
    val target = endpoint?.peer()
    if (target != peerId) { invalidate(); peerId = target }
    sendEvent("onConnection", mapOf("connected" to (target != null)))
  }

  private suspend fun incoming(peer: String, path: String, bytes: ByteArray, arrival: Long, deadline: Long, versionAtArrival: Long) {
    if (!active || epoch != versionAtArrival || path != Wire.COMMAND_PATH || bytes.size > Wire.MAX_BYTES) return
    val generation = epoch
    val target = endpoint?.peer()
    if (!active || generation != epoch || target != peer || SystemClock.elapsedRealtime() - arrival >= 5_000) return
    if (peerId != target) { invalidate(); peerId = target }
    val json = runCatching { Wire.decode(bytes) }.getOrNull() ?: return
    val commandId = if (Wire.isRequest(json)) null else runCatching { Wire.command(json).commandId }.getOrNull() ?: return
    val now = SystemClock.elapsedRealtime()
    requests.entries.removeAll { now - it.value.at >= 5_000 }
    if (requests.size >= 128) return
    val id = UUID.randomUUID().toString()
    requests[id] = Request(peer, commandId, arrival, epoch)
    sendEvent("onCommand", mapOf("requestId" to id, "peerId" to peer, "json" to json,
      "expiresAtMs" to deadline.toDouble()))
  }

  private fun stop() {
    lifecycle++; observing = false
    invalidate(); active = false; peerId = null
    endpoint?.stop(); endpoint = null
  }
}
