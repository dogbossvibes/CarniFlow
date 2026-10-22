package expo.modules.anyvogreetingaudio

import java.util.concurrent.atomic.AtomicBoolean

internal class GreetingRequest(val token: String, val deadlineMs: Long) {
  val cancelled = AtomicBoolean(false)
  val claimed = AtomicBoolean(false)
}

// All controller methods run on the Android main looper. The cancellation flag
// can additionally be set directly by the JS bridge before queued play executes.
internal class GreetingPlaybackController(private val host: Host) {
  interface Host {
    fun now(): Long
    fun allowed(): Boolean
    fun arm(request: GreetingRequest)
    fun prepare(request: GreetingRequest, ready: () -> Unit, done: () -> Unit)
    fun play(request: GreetingRequest)
    fun release(request: GreetingRequest)
    fun schedule(task: Runnable, delayMs: Long)
    fun unschedule(task: Runnable)
  }
  private var active: GreetingRequest? = null
  private var started = false
  private val watchdog = Runnable { checkNow() }

  private fun permitted(request: GreetingRequest): Boolean = try {
    !request.cancelled.get() && host.now() < request.deadlineMs && host.allowed()
  } catch (_: Exception) { false }

  fun start(request: GreetingRequest): Boolean {
    if (request.cancelled.get() || host.now() >= request.deadlineMs) {
      request.cancelled.set(true)
      host.release(request)
      return false
    }
    stop()
    active = request
    started = false
    return try {
      host.arm(request)
      if (!permitted(request)) { stop(request); return false }
      host.prepare(request, {
        if (active === request && !started) {
          if (permitted(request)) {
            started = true
            try { host.play(request) } catch (_: Exception) { stop(request) }
          } else stop(request)
        }
      }, { stop(request) })
      if (active === request) schedule(request)
      active === request
    } catch (_: Exception) { stop(request); false }
  }

  fun checkNow() {
    val request = active ?: return
    host.unschedule(watchdog)
    if (!permitted(request)) stop(request) else schedule(request)
  }

  fun stop(request: GreetingRequest? = null) {
    if (request != null && active !== request) return
    val previous = active ?: return
    active = null
    started = false
    previous.cancelled.set(true)
    host.unschedule(watchdog)
    try { host.release(previous) } catch (_: Exception) { /* Decorative audio only. */ }
  }

  private fun schedule(request: GreetingRequest) {
    host.schedule(watchdog, minOf(25L, (request.deadlineMs - host.now()).coerceAtLeast(1)))
  }
}
