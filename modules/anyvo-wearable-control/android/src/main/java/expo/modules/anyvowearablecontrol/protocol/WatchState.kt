package expo.modules.anyvowearablecontrol.protocol

/** All timeouts use monotonic time. Nothing here can start or save a recording. */
class WatchState(private val now: () -> Long, private val wall: () -> Long) {
  var snapshot: Wire.Snapshot? = null; private set
  var pending: Wire.Command? = null; private set
  var feedback: String? = null; private set
  private var validUntil = 0L
  private var pendingUntil = 0L
  private var lastAckId: String? = null
  private var needsRefresh = false
  private val retiredContexts = linkedSetOf<String>()
  private data class Watermark(val contextId: String?, val revision: Long, val sequence: Long,
    val leaseId: String?, val deadline: Long)
  private var watermark: Watermark? = null

  fun usable(): Boolean = snapshot != null && now() < validUntil
  fun availableActions(): Set<String> = if (usable() && pending == null && !needsRefresh) snapshot!!.capabilities else emptySet()
  fun canConfirm(captured: Wire.Snapshot): Boolean {
    val current = snapshot ?: return false
    return "end_phase" in availableActions() && current.contextId == captured.contextId &&
      current.revision == captured.revision && current.leaseId == captured.leaseId &&
      current.sessionId == captured.sessionId && current.dogId == captured.dogId
  }

  fun receive(value: Wire.Snapshot): Boolean {
    val old = watermark
    if (value.contextId != null && value.contextId in retiredContexts) return false
    if (old?.contextId == value.contextId && old != null &&
      (value.sequence <= old.sequence || value.revision < old.revision)) return false
    if (old != null && old.contextId != value.contextId) {
      retire(old.contextId)
      pending = null
      feedback = null
    }
    val sameLease = old != null && old.contextId == value.contextId && old.leaseId == value.leaseId
    snapshot = value
    // Remote time can shorten display validity, never extend phone's 30-second lease.
    val deadline = now() + (value.expiresAtMs - wall()).toLong().coerceIn(0, 30_000)
    validUntil = if (sameLease) minOf(old!!.deadline, deadline) else deadline
    watermark = Watermark(value.contextId, value.revision, value.sequence, value.leaseId, validUntil)
    needsRefresh = false
    return true
  }

  fun begin(action: String, confirmed: Boolean): Wire.Command {
    tick()
    require(action in availableActions())
    return Wire.makeCommand(snapshot!!, action, confirmed).also {
      pending = it; pendingUntil = now() + 5_000; feedback = null; lastAckId = null
    }
  }

  fun receive(ack: Wire.Ack): Boolean {
    tick()
    val command = pending ?: return false
    if (ack.commandId != command.commandId || ack.commandId == lastAckId) return false
    // A different context can follow phase completion, but must not override a newer phone context.
    if (snapshot?.contextId != command.contextId) return false
    lastAckId = ack.commandId
    pending = null
    receive(ack.snapshot)
    feedback = if (ack.accepted) "accepted" else ack.reason
    return true
  }

  fun tick() {
    if (pending != null && now() >= pendingUntil) { pending = null; feedback = "unconfirmed"; needsRefresh = true }
  }
  fun sendFailed() { pending = null; feedback = "unconfirmed"; needsRefresh = true }
  /** Explicit phone/auth invalidation. Delayed data must never restore this context. */
  fun clear() {
    retire(watermark?.contextId)
    watermark = null
    transportReset()
  }
  /** Local visibility/connection loss is not a logout. Fresh same-context refresh stays possible. */
  fun transportReset() {
    snapshot = null; pending = null; validUntil = 0; feedback = null; lastAckId = null
    needsRefresh = false
  }
  private fun retire(contextId: String?) {
    contextId?.let { retiredContexts.add(it) }
    while (retiredContexts.size > 32) retiredContexts.remove(retiredContexts.first())
  }
}
