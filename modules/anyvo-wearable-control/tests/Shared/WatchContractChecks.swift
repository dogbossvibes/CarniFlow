import Foundation
#if SWIFT_PACKAGE
@testable import WatchSessionCore
#endif

final class WatchContractChecks {
  let fixtureURL: URL
  init(fixtureURL: URL) { self.fixtureURL = fixtureURL }
  private var fixtures: [String: Any] {
    let url = fixtureURL
    return try! JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
  }
  private func json(_ value: Any) throws -> String {
    String(data: try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), encoding: .utf8)!
  }
  private func snapshot(_ changes: [String: Any] = [:]) throws -> WatchSnapshot {
    var value = fixtures["snapshot"] as! [String: Any]
    value.merge(changes) { _, new in new }
    guard case .snapshot(let snapshot) = try WatchWire.parse(json(value)) else { fatalError() }
    return snapshot
  }
  private func ack(for command: WatchCommand, changes: [String: Any] = [:]) throws -> WatchAck {
    var value = fixtures["acceptedAck"] as! [String: Any]
    value["commandId"] = command.commandId
    value.merge(changes) { _, new in new }
    guard case .ack(let ack) = try WatchWire.parse(json(value)) else { fatalError() }
    return ack
  }
  func testAllSharedPositiveFixturesDecode() throws {
    for key in ["snapshot", "command", "acceptedAck", "rejectedAck", "snapshotRequest"] {
      try expectNoThrow(try WatchWire.parse(json(fixtures[key]!)), key)
    }
  }
  func testUnknownKeysAndKindsRejected() throws {
    for key in ["snapshot", "command", "acceptedAck", "snapshotRequest"] {
      var value = fixtures[key] as! [String: Any]
      value["unexpected"] = true
      try expectThrows(try WatchWire.parse(json(value)), key)
      value.removeValue(forKey: "unexpected")
      value["protocolVersion"] = 2
      try expectThrows(try WatchWire.parse(json(value)), key)
    }
  }
  func testMissingKeysTypesBooleansAndInvalidBindingsRejected() throws {
    var value = fixtures["command"] as! [String: Any]
    for key in value.keys {
      var missing = value; missing.removeValue(forKey: key)
      try expectThrows(try WatchWire.parse(json(missing)), key)
    }
    for (key, bad) in [("revision", true as Any), ("revision", -1), ("revision", 1.2),
                       ("commandId", "not-a-uuid"), ("commandId", "00000000-0000-0000-0000-000000000000"),
                       ("contextId", ""), ("dogId", String(repeating: "x", count: 161)), ("confirmed", 1),
                       ("action", "save"), ("dogId", NSNull()), ("protocolVersion", true)] {
      var invalid = value; invalid[key] = bad
      try expectThrows(try WatchWire.parse(json(invalid)), key)
    }
    value["sessionId"] = NSNull()
    try expectNoThrow(try WatchWire.parse(json(value))) // Prepared session has no recorder ID yet.
  }
  func testOversizeAndNestedSnapshotDriftRejected() throws {
    var value = fixtures["acceptedAck"] as! [String: Any]
    var nested = value["snapshot"] as! [String: Any]
    nested["token"] = "forbidden"
    value["snapshot"] = nested
    try expectThrows(try WatchWire.parse(json(value)))
    var state = fixtures["snapshot"] as! [String: Any]
    state["dogName"] = String(repeating: "🐕", count: 8192)
    try expectThrows(try WatchWire.parse(json(state)))
    for (key, bad) in [("sequence", true as Any), ("revision", -1), ("phase", "unknown"),
                       ("distanceM", "42"), ("capabilities", ["save"]), ("expiresAtMs", false)] {
      var invalid = fixtures["snapshot"] as! [String: Any]; invalid[key] = bad
      try expectThrows(try WatchWire.parse(json(invalid)), key)
    }
  }
  func testDisconnectedExpiredOrUnpreparedWatchCannotIssueCommand() throws {
    var state = WatchCommandState()
    try expectNil(state.begin(.pause, confirmed: false, connected: true, uptimeMs: 0))
    try expectTrue(state.receiveSnapshot(try snapshot(), wallTimeMs: 1_800_000_000_000, uptimeMs: 100))
    try expectFalse(state.canSend(.pause, connected: false, uptimeMs: 100))
    try expectFalse(state.canSend(.startSearch, connected: true, uptimeMs: 100))
    try expectFalse(state.canSend(.pause, connected: true, uptimeMs: 30_100))
    try expectNil(state.begin(.endPhase, confirmed: false, connected: true, uptimeMs: 100))
    try expectNotNil(state.begin(.endPhase, confirmed: true, connected: true, uptimeMs: 100, confirmation: state.snapshot))
  }
  func testEndConfirmationCannotMoveToAnotherDogSessionOrControlState() throws {
    let original = try snapshot()
    for change: [String: Any] in [["contextId": "another-context"], ["dogId": "another-dog"],
      ["sessionId": "another-session"], ["revision": 5], ["leaseId": "renewed-lease"], ["phase": "lay_paused"]] {
      var state = WatchCommandState()
      _ = state.receiveSnapshot(original, wallTimeMs: 1_800_000_000_000, uptimeMs: 0)
      var updates = change; updates["sequence"] = 13
      _ = state.receiveSnapshot(try snapshot(updates), wallTimeMs: 1_800_000_000_001, uptimeMs: 1)
      try expectNil(state.begin(.endPhase, confirmed: true, connected: true, uptimeMs: 2, confirmation: original))
    }
    var same = WatchCommandState()
    _ = same.receiveSnapshot(original, wallTimeMs: 1_800_000_000_000, uptimeMs: 0)
    try expectNil(same.begin(.endPhase, confirmed: true, connected: true, uptimeMs: 1))
    _ = same.receiveSnapshot(try snapshot(["sequence": 13, "distanceM": 50]), wallTimeMs: 1_800_000_000_001, uptimeMs: 1)
    try expectNotNil(same.begin(.endPhase, confirmed: true, connected: true, uptimeMs: 2, confirmation: original))
  }
  func testOnlyMatchingAcceptedAckConfirmsAndNoImplicitRetry() throws {
    var state = WatchCommandState()
    _ = state.receiveSnapshot(try snapshot(), wallTimeMs: 1_800_000_000_000, uptimeMs: 0)
    let command = try requireValue(state.begin(.markObject, confirmed: false, connected: true, uptimeMs: 0))
    try expectNil(state.begin(.pause, confirmed: false, connected: true, uptimeMs: 1))
    try expectNil(state.complete(try ack(for: command, changes: ["commandId": UUID().uuidString]), wallTimeMs: 1_800_000_000_001, uptimeMs: 1))
    try expectEqual(state.complete(try ack(for: command), wallTimeMs: 1_800_000_000_002, uptimeMs: 2), true)
    try expectNil(state.pending)
    try expectNil(state.complete(try ack(for: command), wallTimeMs: 1_800_000_000_003, uptimeMs: 3))
  }
  func testTimeoutAndTransportFailureNeverConfirmSuccess() throws {
    var state = WatchCommandState()
    _ = state.receiveSnapshot(try snapshot(), wallTimeMs: 1_800_000_000_000, uptimeMs: 0)
    let command = try requireValue(state.begin(.pause, confirmed: false, connected: true, uptimeMs: 0))
    try expectFalse(state.expirePending(uptimeMs: 4999))
    try expectTrue(state.expirePending(uptimeMs: 5000))
    try expectNil(state.complete(try ack(for: command), wallTimeMs: 1_800_000_005_001, uptimeMs: 5001))
    try expectFalse(state.canSend(.pause, connected: true, uptimeMs: 5001))
    _ = state.receiveSnapshot(try snapshot(["sequence": 13]), wallTimeMs: 1_800_000_005_001, uptimeMs: 5001)
    try expectTrue(state.canSend(.pause, connected: true, uptimeMs: 5001))
    state.transportFailed()
    try expectFalse(state.canSend(.pause, connected: true, uptimeMs: 5002))
  }
  func testContextRotationAndOutOfOrderStateDoNotAuthorizeOldTarget() throws {
    var state = WatchCommandState()
    let old = try snapshot()
    _ = state.receiveSnapshot(old, wallTimeMs: 1_800_000_000_000, uptimeMs: 0)
    let command = try requireValue(state.begin(.pause, confirmed: false, connected: true, uptimeMs: 0))
    try expectFalse(state.receiveSnapshot(try snapshot(["sequence": 11]), wallTimeMs: 1_800_000_000_001, uptimeMs: 1))
    try expectTrue(state.receiveSnapshot(try snapshot(["contextId": "other-context", "sequence": 1]), wallTimeMs: 1_800_000_000_002, uptimeMs: 2))
    try expectFalse(state.receiveSnapshot(old, wallTimeMs: 1_800_000_000_003, uptimeMs: 3))
    try expectEqual(state.complete(try ack(for: command), wallTimeMs: 1_800_000_000_004, uptimeMs: 4), false)
    state.clear()
    try expectNil(state.snapshot)
    try expectFalse(state.receiveSnapshot(old, wallTimeMs: 1_800_000_000_005, uptimeMs: 5))
  }
  func testExpiredIdleSnapshotImmediatelyClearsPreviousActiveCapabilities() throws {
    var state = WatchCommandState()
    let active = try snapshot()
    _ = state.receiveSnapshot(active, wallTimeMs: 1_800_000_000_000, uptimeMs: 0)
    let idle = try snapshot(["contextId": NSNull(), "leaseId": NSNull(), "sessionId": NSNull(),
      "dogId": NSNull(), "dogName": NSNull(), "phase": "idle", "capabilities": [],
      "expiresAtMs": 1_800_000_000_001, "sequence": 13])
    try expectTrue(state.receiveSnapshot(idle, wallTimeMs: 1_800_000_000_001, uptimeMs: 1))
    try expectNil(state.snapshot?.contextId)
    try expectEqual(state.snapshot?.phase, .idle)
    for action in WatchAction.allCases { try expectFalse(state.canSend(action, connected: true, uptimeMs: 2)) }
    try expectFalse(state.receiveSnapshot(active, wallTimeMs: 1_800_000_000_002, uptimeMs: 2))
    try expectEqual(state.snapshot?.phase, .idle)
  }
  func testWatchFreshnessUsesMonotonicBoundNotWallClockExtension() throws {
    var state = WatchCommandState()
    _ = state.receiveSnapshot(try snapshot(["expiresAtMs": 1_900_000_000_000]), wallTimeMs: 1_800_000_000_000, uptimeMs: 0)
    try expectTrue(state.canSend(.pause, connected: true, uptimeMs: 29_999))
    try expectFalse(state.canSend(.pause, connected: true, uptimeMs: 30_000))
  }
  func testPreparedCommandEncodesExplicitNullAndBoundSnapshotFields() throws {
    var state = WatchCommandState()
    _ = state.receiveSnapshot(try snapshot(["sessionId": NSNull(), "phase": "lay_prepared", "capabilities": ["start_lay"]]), wallTimeMs: 1_800_000_000_000, uptimeMs: 0)
    let command = try requireValue(state.begin(.startLay, confirmed: false, connected: true, uptimeMs: 0))
    let encoded = try WatchWire.encodeCommand(command)
    let object = try JSONSerialization.jsonObject(with: Data(encoded.utf8)) as! [String: Any]
    try expectTrue(object["sessionId"] is NSNull)
    try expectEqual(command.contextId, state.snapshot?.contextId)
    try expectEqual(command.dogId, state.snapshot?.dogId)
    try expectEqual(command.revision, state.snapshot?.revision)
    try expectNoThrow(try WatchWire.parse(encoded))
  }
  func testNativeCorrelationUsesOwnIDsBoundsAndMatchingReplyKind() throws {
    var ledger = WatchNativeRequests()
    let commandJSON = try json(fixtures["command"]!)
    let id = try requireValue(ledger.insert(json: commandJSON, uptimeMs: 0))
    try expectNotEqual(id, (fixtures["command"] as! [String: Any])["commandId"] as? String)
    try expectFalse(try ledger.response(requestId: id, json: json(fixtures["snapshot"]!), uptimeMs: 1))
    try expectFalse(try ledger.response(requestId: "remote-id", json: json(fixtures["acceptedAck"]!), uptimeMs: 1))
    try expectTrue(try ledger.response(requestId: id, json: json(fixtures["acceptedAck"]!), uptimeMs: 1))
    try expectFalse(try ledger.response(requestId: id, json: json(fixtures["acceptedAck"]!), uptimeMs: 2))
    let readId = try requireValue(ledger.insert(json: WatchWire.snapshotRequestJSON, uptimeMs: 2))
    try expectFalse(try ledger.response(requestId: readId, json: json(fixtures["acceptedAck"]!), uptimeMs: 3))
    try expectTrue(try ledger.response(requestId: readId, json: json(fixtures["snapshot"]!), uptimeMs: 3))
    let stale = try requireValue(ledger.insert(json: commandJSON, uptimeMs: 4))
    try expectFalse(try ledger.response(requestId: stale, json: json(fixtures["acceptedAck"]!), uptimeMs: 5004))
    ledger.clear()
    for _ in 0..<WatchNativeRequests.maxPending { try expectNotNil(try ledger.insert(json: commandJSON, uptimeMs: 10)) }
    try expectNil(try ledger.insert(json: commandJSON, uptimeMs: 10))
    try expectThrows(try ledger.insert(json: json(fixtures["snapshot"]!), uptimeMs: 10))
    ledger.clear(); try expectEqual(ledger.requests.count, 0)
  }

  func runAll() throws {
    try testAllSharedPositiveFixturesDecode()
    print("PASS testAllSharedPositiveFixturesDecode")
    try testUnknownKeysAndKindsRejected()
    print("PASS testUnknownKeysAndKindsRejected")
    try testMissingKeysTypesBooleansAndInvalidBindingsRejected()
    print("PASS testMissingKeysTypesBooleansAndInvalidBindingsRejected")
    try testOversizeAndNestedSnapshotDriftRejected()
    print("PASS testOversizeAndNestedSnapshotDriftRejected")
    try testDisconnectedExpiredOrUnpreparedWatchCannotIssueCommand()
    print("PASS testDisconnectedExpiredOrUnpreparedWatchCannotIssueCommand")
    try testEndConfirmationCannotMoveToAnotherDogSessionOrControlState()
    print("PASS testEndConfirmationCannotMoveToAnotherDogSessionOrControlState")
    try testOnlyMatchingAcceptedAckConfirmsAndNoImplicitRetry()
    print("PASS testOnlyMatchingAcceptedAckConfirmsAndNoImplicitRetry")
    try testTimeoutAndTransportFailureNeverConfirmSuccess()
    print("PASS testTimeoutAndTransportFailureNeverConfirmSuccess")
    try testContextRotationAndOutOfOrderStateDoNotAuthorizeOldTarget()
    print("PASS testContextRotationAndOutOfOrderStateDoNotAuthorizeOldTarget")
    try testExpiredIdleSnapshotImmediatelyClearsPreviousActiveCapabilities()
    print("PASS testExpiredIdleSnapshotImmediatelyClearsPreviousActiveCapabilities")
    try testWatchFreshnessUsesMonotonicBoundNotWallClockExtension()
    print("PASS testWatchFreshnessUsesMonotonicBoundNotWallClockExtension")
    try testPreparedCommandEncodesExplicitNullAndBoundSnapshotFields()
    print("PASS testPreparedCommandEncodesExplicitNullAndBoundSnapshotFields")
    try testNativeCorrelationUsesOwnIDsBoundsAndMatchingReplyKind()
    print("PASS testNativeCorrelationUsesOwnIDsBoundsAndMatchingReplyKind")
  }
}
