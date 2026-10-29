package expo.modules.anyvoprecisionlocation

/** Coordinate-free observations. No input to location filtering or session recovery. */
internal class AndroidDiagnosticCounters {
  private var generation = 0L
  private var startedAtMs: Long? = null
  private var receivedCount = 0L
  private var firstReceivedAtMs: Long? = null
  private var lastReceivedAtMs: Long? = null
  private var lastFixAgeMs: Long? = null
  private var invalidFixTimeCount = 0L
  private var started = false
  private var observing = false
  private var stopReason: String? = null

  @Synchronized fun begin(nowMs: Long): Long {
    generation++
    startedAtMs = nowMs
    receivedCount = 0
    firstReceivedAtMs = null
    lastReceivedAtMs = null
    lastFixAgeMs = null
    invalidFixTimeCount = 0
    started = false
    observing = true
    stopReason = null
    return generation
  }

  @Synchronized fun didStart() { started = true }

  @Synchronized fun didStop(reason: String) {
    started = false
    observing = false
    stopReason = reason
  }

  @Synchronized fun received(listenerGeneration: Long, fixElapsedNanos: Long, receivedElapsedMs: Long) {
    if (!observing || listenerGeneration != generation) return
    receivedCount++
    if (firstReceivedAtMs == null) firstReceivedAtMs = receivedElapsedMs
    lastReceivedAtMs = receivedElapsedMs
    val fixMs = fixElapsedNanos / 1_000_000
    lastFixAgeMs = if (fixElapsedNanos > 0 && fixMs <= receivedElapsedMs) {
      receivedElapsedMs - fixMs
    } else {
      invalidFixTimeCount++
      null
    }
  }

  @Synchronized fun snapshot(nowMs: Long): Map<String, Any?> {
    fun relative(value: Long?): Long? = value?.let { v ->
      startedAtMs?.let { origin -> (v - origin).takeIf { it >= 0 } }
    }
    return mapOf(
      "generation" to generation,
      "nativeListenerStarted" to started,
      "receivedFixCount" to receivedCount,
      "firstReceivedMs" to relative(firstReceivedAtMs),
      "lastReceivedMs" to relative(lastReceivedAtMs),
      "lastFixAgeAtReceiptMs" to lastFixAgeMs,
      "lastCallbackAgeMs" to lastReceivedAtMs?.let { (nowMs - it).takeIf { age -> age >= 0 } },
      "invalidMonotonicFixTimeCount" to invalidFixTimeCount,
      "stopReason" to stopReason
    )
  }
}
