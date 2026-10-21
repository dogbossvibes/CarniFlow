package expo.modules.anyvowearablecontrol.transport

import android.content.Context
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

/** Data Layer authenticates matching package/signature; only one nearby capable peer is eligible. */
class NearbyEndpoint(context: Context, private val capability: String,
  private val message: (String, String, ByteArray) -> Unit, private val changed: () -> Unit
) {
  private val context = context.applicationContext
  private val messages by lazy { Wearable.getMessageClient(context) }
  private val capabilities by lazy { Wearable.getCapabilityClient(context) }
  @Volatile private var started = false
  private var generation = 0L
  private val messageListener = MessageClient.OnMessageReceivedListener { event ->
    if (started && event.data.size <= 8192) message(event.sourceNodeId, event.path, event.data.copyOf())
  }
  private val capabilityListener = CapabilityClient.OnCapabilityChangedListener { if (started) changed() }

  fun isAvailable() = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS

  suspend fun start(): Boolean {
    if (!isAvailable()) return false
    val version = ++generation
    return runCatching {
      withContext(Dispatchers.IO) {
        Tasks.await(messages.addListener(messageListener), 4, TimeUnit.SECONDS)
        Tasks.await(capabilities.addListener(capabilityListener, capability), 4, TimeUnit.SECONDS)
      }
      if (version != generation) { stop(); return false }
      started = true
      true
    }.getOrElse { stop(); false }
  }

  suspend fun peer(): String? = if (!started || !isAvailable()) null else runCatching {
    withContext(Dispatchers.IO) {
      Tasks.await(capabilities.getCapability(capability, CapabilityClient.FILTER_REACHABLE), 4, TimeUnit.SECONDS)
        .nodes.filter { it.isNearby }.singleOrNull()?.id
    }
  }.getOrNull()

  suspend fun send(peer: String, path: String, bytes: ByteArray, allowed: () -> Boolean = { true }): Boolean {
    val version = generation
    if (this.peer() != peer || !started || version != generation || !allowed()) return false
    return runCatching {
      withContext(Dispatchers.IO) { Tasks.await(messages.sendMessage(peer, path, bytes), 4, TimeUnit.SECONDS) }
      true // Transport delivery only. This is never a successful recorder ACK.
    }.getOrDefault(false)
  }

  fun stop() {
    generation++
    started = false
    if (isAvailable()) {
      messages.removeListener(messageListener)
      capabilities.removeListener(capabilityListener, capability)
    }
  }
}
