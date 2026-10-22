package expo.modules.anyvogreetingaudio

import org.junit.Assert.*
import org.junit.Test

class GreetingPlaybackControllerTest {
  private class FakeHost : GreetingPlaybackController.Host {
    var time = 0L
    var audible = true
    var armFailure = false
    var prepareFailure = false
    var playFailure = false
    val calls = mutableListOf<String>()
    val callbacks = mutableMapOf<String, () -> Unit>()
    val completions = mutableMapOf<String, () -> Unit>()
    val tasks = mutableSetOf<Runnable>()
    override fun now() = time
    override fun allowed(): Boolean { calls.add("policy"); return audible }
    override fun arm(request: GreetingRequest) { calls.add("arm:${request.token}"); if (armFailure) error("receiver failed") }
    override fun prepare(request: GreetingRequest, ready: () -> Unit, done: () -> Unit) {
      calls.add("prepare:${request.token}")
      if (prepareFailure) error("prepare failed")
      callbacks[request.token] = ready; completions[request.token] = done
    }
    override fun play(request: GreetingRequest) { calls.add("play:${request.token}"); if (playFailure) error("play failed") }
    override fun release(request: GreetingRequest) { calls.add("release:${request.token}") }
    override fun schedule(task: Runnable, delayMs: Long) { assertTrue(delayMs in 1L..25L); tasks.add(task) }
    override fun unschedule(task: Runnable) { tasks.remove(task) }
    fun advance(to: Long) { time = to; tasks.toList().forEach { it.run() } }
  }
  @Test fun mutedSnapshotNeverPreparesOrPlaysAndMonitoringIsArmedBeforeRead() {
    val h = FakeHost(); h.audible = false; val c = GreetingPlaybackController(h)
    assertFalse(c.start(GreetingRequest("a", 2040)))
    assertEquals(listOf("arm:a", "policy", "release:a"), h.calls)
    assertTrue(h.tasks.isEmpty())
  }
  @Test fun receiverRegistrationFailureNeverPreparesOrReadsAudibleSnapshot() {
    val h = FakeHost(); h.armFailure = true; val c = GreetingPlaybackController(h)
    assertFalse(c.start(GreetingRequest("a", 2040)))
    assertEquals(listOf("arm:a", "release:a"), h.calls)
  }
  @Test fun rechecksPolicyAfterAsyncPrepareBeforeActualStart() {
    val h = FakeHost(); val c = GreetingPlaybackController(h)
    assertTrue(c.start(GreetingRequest("a", 2040))); h.audible = false
    h.callbacks.getValue("a")()
    assertFalse(h.calls.contains("play:a")); assertTrue(h.tasks.isEmpty())
    assertEquals("release:a", h.calls.last())
  }
  @Test fun cancellationBeforeQueuedNativeStartNeverPrepares() {
    val h = FakeHost(); val c = GreetingPlaybackController(h)
    val request = GreetingRequest("a", 2040); request.cancelled.set(true)
    assertFalse(c.start(request)); assertFalse(h.calls.contains("prepare:a"))
  }
  @Test fun nativeMuteCheckStopsPlayingWithoutAnyJavascriptAndNeverReplays() {
    val h = FakeHost(); val c = GreetingPlaybackController(h)
    c.start(GreetingRequest("a", 2040)); h.callbacks.getValue("a")()
    h.audible = false; c.checkNow(); h.audible = true; c.checkNow(); h.callbacks.getValue("a")()
    assertEquals(1, h.calls.count { it == "play:a" }); assertEquals(1, h.calls.count { it == "release:a" })
  }
  @Test fun nativeWatchdogStopsAtDeadlineWhileJavascriptWouldBeStalled() {
    val h = FakeHost(); val c = GreetingPlaybackController(h)
    c.start(GreetingRequest("a", 2040)); h.callbacks.getValue("a")()
    h.advance(2040); assertEquals("release:a", h.calls.last()); assertTrue(h.tasks.isEmpty())
  }
  @Test fun latePrepareAfterDeadlineNeverStarts() {
    val h = FakeHost(); val c = GreetingPlaybackController(h)
    c.start(GreetingRequest("a", 2040)); h.time = 2040; h.callbacks.getValue("a")()
    assertFalse(h.calls.contains("play:a")); assertEquals("release:a", h.calls.last())
  }
  @Test fun lateOldCallbacksAndOldTokenStopsCannotTouchReplacement() {
    val h = FakeHost(); val c = GreetingPlaybackController(h)
    val a = GreetingRequest("a", 2040); val b = GreetingRequest("b", 2040)
    c.start(a); c.start(b); h.callbacks.getValue("a")(); h.completions.getValue("a")(); c.stop(a)
    h.callbacks.getValue("b")(); assertFalse(h.calls.contains("play:a")); assertTrue(h.calls.contains("play:b"))
    assertFalse(b.cancelled.get())
  }
  @Test fun lifecycleOrAccountStopInvalidatesDelayedPreparedCallback() {
    val h = FakeHost(); val c = GreetingPlaybackController(h)
    c.start(GreetingRequest("a", 2040)); c.stop(); h.callbacks.getValue("a")()
    assertFalse(h.calls.contains("play:a")); assertTrue(h.tasks.isEmpty())
  }
  @Test fun prepareAndStartFailuresReleaseOnlyOwnedPlayer() {
    val h = FakeHost(); val c = GreetingPlaybackController(h); h.prepareFailure = true
    assertFalse(c.start(GreetingRequest("a", 2040))); assertEquals("release:a", h.calls.last())
    h.prepareFailure = false; h.playFailure = true
    c.start(GreetingRequest("b", 2040)); h.callbacks.getValue("b")()
    assertEquals("release:b", h.calls.last()); assertTrue(h.tasks.isEmpty())
  }
  @Test fun duplicatePreparedCallbackCannotReplay() {
    val h = FakeHost(); val c = GreetingPlaybackController(h)
    c.start(GreetingRequest("a", 2040)); repeat(2) { h.callbacks.getValue("a")() }
    assertEquals(1, h.calls.count { it == "play:a" })
    h.completions.getValue("a")(); assertTrue(h.tasks.isEmpty())
  }
  @Test fun nativePollingDetectsPolicyChangeWithoutReceiverCallback() {
    val h = FakeHost(); val c = GreetingPlaybackController(h)
    c.start(GreetingRequest("a", 2040)); h.callbacks.getValue("a")()
    h.audible = false; h.advance(25)
    assertEquals("release:a", h.calls.last())
  }
  @Test fun cancelledOrExpiredQueuedStartCannotInterruptNewerSession() {
    val h = FakeHost(); val c = GreetingPlaybackController(h)
    val b = GreetingRequest("b", 2040); c.start(b); h.callbacks.getValue("b")()
    val a = GreetingRequest("a", 2040); a.cancelled.set(true)
    assertFalse(c.start(a)); assertFalse(c.start(GreetingRequest("expired", 0)))
    assertFalse(b.cancelled.get()); assertFalse(h.calls.contains("release:b"))
  }
}
