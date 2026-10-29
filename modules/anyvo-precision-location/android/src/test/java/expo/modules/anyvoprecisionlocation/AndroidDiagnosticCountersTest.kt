package expo.modules.anyvoprecisionlocation

import org.junit.Assert.*
import org.junit.Test

class AndroidDiagnosticCountersTest {
  @Test fun delayedFixIsDistinctFromDelayedCallbackAndRestartResetsObservation() {
    val state = AndroidDiagnosticCounters()
    state.begin(1000)
    state.didStart()
    state.received(1, 1_500_000_000, 31_500)
    val snapshot = state.snapshot(33_000)
    assertEquals(30_000L, snapshot["lastFixAgeAtReceiptMs"])
    assertEquals(1_500L, snapshot["lastCallbackAgeMs"])
    assertEquals(30_500L, snapshot["lastReceivedMs"])
    state.didStop("listener_stopped")
    assertEquals(false, state.snapshot(34_000)["nativeListenerStarted"])
    state.begin(35_000)
    val next = state.snapshot(35_000)
    assertEquals(2L, next["generation"])
    assertEquals(0L, next["receivedFixCount"])
    assertNull(next["lastFixAgeAtReceiptMs"])
    assertNull(next["stopReason"])
  }

  @Test fun invalidMonotonicTimeIsUnknownRatherThanAZeroAgeFix() {
    val state = AndroidDiagnosticCounters()
    state.begin(100)
    state.received(1, 0, 100)
    state.received(1, 201_000_000, 200)
    assertNull(state.snapshot(200)["lastFixAgeAtReceiptMs"])
    assertEquals(2L, state.snapshot(200)["invalidMonotonicFixTimeCount"])
    state.received(1, 200_000_000, 200)
    assertEquals(0L, state.snapshot(200)["lastFixAgeAtReceiptMs"])
    assertNull(state.snapshot(199)["lastCallbackAgeMs"])
  }

  @Test fun concurrentCallbacksCannotLoseCountsOrInventLocationData() {
    val state = AndroidDiagnosticCounters()
    state.begin(100)
    val workers = List(8) { Thread { repeat(1000) { state.received(1, 100_000_000, 200) } } }
    workers.forEach { it.start() }
    workers.forEach { it.join() }
    val snapshot = state.snapshot(200)
    assertEquals(8000L, snapshot["receivedFixCount"])
    assertTrue(snapshot.keys.none { it.contains("latitude") || it.contains("longitude") || it.contains("deviceId") })
  }

  @Test fun queuedCallbacksFromStoppedOrPreviousListenersDoNotContaminateNewCounters() {
    val state = AndroidDiagnosticCounters()
    val first = state.begin(100)
    state.didStart()
    state.didStop("listener_stopped")
    state.received(first, 100_000_000, 200)
    assertEquals(0L, state.snapshot(200)["receivedFixCount"])
    val second = state.begin(300)
    state.received(first, 100_000_000, 400)
    state.received(second, 350_000_000, 400)
    assertEquals(1L, state.snapshot(400)["receivedFixCount"])
    assertEquals(50L, state.snapshot(400)["lastFixAgeAtReceiptMs"])
  }
}
