package com.anyvo.wear

import expo.modules.anyvowearablecontrol.protocol.WatchState
import expo.modules.anyvowearablecontrol.protocol.Wire
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class WireStateTest {
  private val fixtures: JSONObject get() = JSONObject(javaClass.getResource("/wire-fixtures-v1.json")!!.readText())
  private fun snapshot(change: (JSONObject) -> Unit = {}): Wire.Snapshot =
    fixtures.getJSONObject("snapshot").also(change).let { Wire.snapshot(it.toString()) }
  private fun invalid(block: () -> Any?) { assertTrue("must reject", runCatching(block).isFailure) }

  @Test fun exactSharedPositiveFixtures() {
    assertEquals("mark_object", Wire.command(fixtures.getJSONObject("command").toString()).action)
    assertEquals("lay_recording", snapshot().phase)
    assertTrue(Wire.ack(fixtures.getJSONObject("acceptedAck").toString()).accepted)
    assertFalse(Wire.ack(fixtures.getJSONObject("rejectedAck").toString()).accepted)
    assertTrue(Wire.isRequest(fixtures.getJSONObject("snapshotRequest").toString()))
  }

  @Test fun exactSharedNegativeCommandFixtures() {
    val base = fixtures.getJSONObject("command").toString()
    listOf("null", "[]", "{}", "42", "\"x\"", "{", " ".repeat(8193)).forEach { invalid { Wire.command(it) } }
    listOf("action" to "delete", "revision" to 1.5, "confirmed" to "yes", "commandId" to "not-uuid", "dogId" to "", "peerId" to "spoofed")
      .forEach { (key, value) -> invalid { Wire.command(JSONObject(base).put(key, value).toString()) } }
    invalid { Wire.command(JSONObject(base).put("contextId", "x".repeat(161)).toString()) }
    invalid { Wire.command(JSONObject(base).put("commandId", "44444444-4444-0444-8444-444444444444").toString()) }
    invalid { Wire.command(JSONObject(base).put("revision", 9007199254740992.0).toString()) }
    assertFalse(Wire.isRequest("{\"protocolVersion\":1,\"kind\":\"snapshot_request\",\"action\":\"pause\"}"))
  }

  @Test fun androidLenientJsonExtensionsCannotCrossBridge() {
    listOf("{'protocolVersion':1,'kind':'snapshot_request'}", "{protocolVersion:1,kind:snapshot_request}",
      "{\"protocolVersion\":1,\"kind\":\"snapshot_request\",}",
      "{\"protocolVersion\":1,\"protocolVersion\":1,\"kind\":\"snapshot_request\"}",
      Wire.REQUEST + "false", Wire.REQUEST.replace(":1", ":01"), Wire.REQUEST.replace(":1", ":+1"))
      .forEach { assertFalse(it, Wire.isRequest(it)) }
    assertTrue(Wire.isRequest(" \n" + Wire.REQUEST + "\r\t"))
  }

  @Test fun utf8BoundsAndMalformedBytes() {
    invalid { Wire.decode(byteArrayOf(0xC3.toByte(), 0x28)) }
    invalid { Wire.decode(ByteArray(8193)) }
    assertEquals("Hund 🐕", Wire.decode("Hund 🐕".toByteArray()))
    invalid { snapshot { it.put("dogName", "🐕".repeat(80)).put("unknown", true) } }
  }

  @Test fun invalidSnapshotsAndAckCannotEnableControls() {
    invalid { snapshot { it.put("capabilities", org.json.JSONArray(listOf("pause", "pause"))) } }
    invalid { snapshot { it.put("capabilities", org.json.JSONArray(listOf("delete"))) } }
    invalid { snapshot { it.put("leaseId", JSONObject.NULL) } }
    invalid { snapshot { it.put("revision", -1) } }
    invalid { snapshot { it.put("phase", "autonomous") } }
    invalid { Wire.ack(fixtures.getJSONObject("acceptedAck").put("reason", "failed").toString()) }
    invalid { Wire.ack(fixtures.getJSONObject("rejectedAck").put("status", "accepted").toString()) }
  }

  @Test fun noActionsBeforeCurrentPhoneLeaseOrAfterExpiry() {
    var time = 0L; val wall = 1_800_000_000_000L
    val state = WatchState({ time }, { wall + time })
    assertTrue(state.availableActions().isEmpty())
    invalid { state.begin("start_lay", false) }
    state.receive(snapshot())
    assertTrue("pause" in state.availableActions())
    time = 30_000
    assertFalse(state.usable()); assertTrue(state.availableActions().isEmpty())
    invalid { state.begin("pause", false) }
  }

  @Test fun leaseReplayAndWallClockRollbackDoNotExtendMonotonicDeadline() {
    var time = 0L; var wall = 1_800_000_000_000L
    val state = WatchState({ time }, { wall })
    state.receive(snapshot()); time = 20_000; wall -= 20_000
    state.receive(snapshot { it.put("sequence", 13) })
    time = 30_000; assertFalse(state.usable())
    state.receive(snapshot { it.put("sequence", 14) }); assertFalse(state.usable())
  }

  @Test fun onlyMatchingBusinessAckReportsSuccess() {
    var time = 0L
    val state = WatchState({ time }, { 1_800_000_000_000 + time })
    state.receive(snapshot()); val command = state.begin("mark_object", false)
    assertNull(state.feedback); assertTrue(state.availableActions().isEmpty())
    assertFalse(state.receive(Wire.ack(fixtures.getJSONObject("acceptedAck").toString())))
    val ack = Wire.ack(fixtures.getJSONObject("acceptedAck").put("commandId", command.commandId).toString())
    assertTrue(state.receive(ack)); assertEquals("accepted", state.feedback)
    assertFalse(state.receive(ack))
  }

  @Test fun timeoutNeverSucceedsAndNeedsFreshSnapshotBeforeNewCommand() {
    var time = 0L
    val state = WatchState({ time }, { 1_800_000_000_000 + time })
    state.receive(snapshot()); val command = state.begin("pause", false)
    time = 5_000; state.tick(); assertEquals("unconfirmed", state.feedback)
    assertTrue(state.availableActions().isEmpty())
    assertFalse(state.receive(Wire.ack(fixtures.getJSONObject("acceptedAck").put("commandId", command.commandId).toString())))
    state.receive(snapshot { it.put("sequence", 13) }); assertTrue("pause" in state.availableActions())
  }

  @Test fun explicitEndConfirmationAndCapabilityRequired() {
    val state = WatchState({ 0 }, { 1_800_000_000_000 })
    state.receive(snapshot())
    invalid { state.begin("end_phase", false) }
    invalid { state.begin("start_lay", false) }
    assertTrue(state.begin("end_phase", true).confirmed)
  }

  @Test fun contextSwitchDisconnectAndRestartRemoveAuthority() {
    val state = WatchState({ 0 }, { 1_800_000_000_000 })
    state.receive(snapshot()); val command = state.begin("pause", false)
    state.receive(snapshot { it.put("contextId", "new-context").put("sequence", 1).put("revision", 0) })
    assertNull(state.pending)
    assertFalse(state.receive(snapshot()))
    assertFalse(state.receive(Wire.ack(fixtures.getJSONObject("acceptedAck").put("commandId", command.commandId).toString())))
    state.clear(); assertNull(state.snapshot); assertTrue(state.availableActions().isEmpty())
    assertTrue(WatchState({ 0 }, { 1_800_000_000_000 }).availableActions().isEmpty())
  }

  @Test fun anOldEndDialogNeverTargetsANewDogSessionRevisionOrLease() {
    for ((key, value) in listOf("contextId" to "other-context", "sessionId" to "other-run", "dogId" to "other-dog", "revision" to 5, "leaseId" to "other-lease")) {
      val state = WatchState({ 0 }, { 1_800_000_000_000 })
      val captured = snapshot(); state.receive(captured)
      assertTrue(state.canConfirm(captured))
      state.receive(snapshot { it.put(key, value).put("sequence", 13) })
      assertFalse(key, state.canConfirm(captured))
    }
    var time = 0L; val state = WatchState({ time }, { 1_800_000_000_000 + time })
    val captured = snapshot(); state.receive(captured); time = 30_000
    assertFalse(state.canConfirm(captured))
  }

  @Test fun explicitAuthClearRejectsLateOldSnapshotAndAcceptsNewOwner() {
    val state = WatchState({ 0 }, { 1_800_000_000_000 })
    assertTrue(state.receive(snapshot())); state.clear()
    assertNull(state.snapshot); assertFalse(state.receive(snapshot()))
    assertTrue(state.availableActions().isEmpty())
    assertTrue(state.receive(snapshot { it.put("contextId", "new-owner").put("sequence", 1) }))
    assertTrue("pause" in state.availableActions())
    assertFalse(state.receive(snapshot { it.put("sequence", 99) }))
  }

  @Test fun clearKeepsRetiredHistoryAcrossMultipleOwners() {
    val state = WatchState({ 0 }, { 1_800_000_000_000 })
    state.receive(snapshot())
    state.receive(snapshot { it.put("contextId", "owner-b") })
    state.clear()
    assertFalse(state.receive(snapshot()))
    assertFalse(state.receive(snapshot { it.put("contextId", "owner-b") }))
    assertTrue(state.receive(snapshot { it.put("contextId", "owner-c").put("sequence", 1) }))
  }

  @Test fun localPauseReconnectAcceptsFreshSameContextWithoutReplayingAnOlderRevision() {
    val state = WatchState({ 0 }, { 1_800_000_000_000 })
    state.receive(snapshot()); state.begin("pause", false); state.transportReset()
    assertNull(state.snapshot); assertNull(state.pending); assertTrue(state.availableActions().isEmpty())
    assertFalse(state.receive(snapshot()))
    assertFalse(state.receive(snapshot { it.put("sequence", 11) }))
    assertTrue(state.receive(snapshot { it.put("sequence", 13) }))
    assertTrue("pause" in state.availableActions()); assertNull(state.feedback)
  }

  @Test fun clearDuringLocalPauseStillRetiresLastPhoneContextAndIdleInvalidatesEvenWhenExpired() {
    val state = WatchState({ 0 }, { 1_800_000_000_000 })
    state.receive(snapshot()); state.transportReset(); state.clear()
    assertFalse(state.receive(snapshot()))
    val idle = snapshot { it.put("contextId", JSONObject.NULL).put("leaseId", JSONObject.NULL)
      .put("capabilities", org.json.JSONArray()).put("expiresAtMs", 1_800_000_000_000).put("phase", "idle") }
    assertTrue(state.receive(idle)); assertTrue(state.availableActions().isEmpty())
    assertFalse(state.receive(snapshot()))
  }
}
