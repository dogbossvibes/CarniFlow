import Foundation
import CoreFoundation

// Wire contract v1 is owned by 02. Keep keys and fixtures identical across platforms.
enum WatchAction: String, Codable, CaseIterable {
  case startLay = "start_lay", startSearch = "start_search", markObject = "mark_object"
  case pause, resume, endPhase = "end_phase"
}
enum WatchPhase: String, Codable {
  case idle, layPrepared = "lay_prepared", layRecording = "lay_recording", layPaused = "lay_paused"
  case searchPrepared = "search_prepared", searchRecording = "search_recording", searchPaused = "search_paused"
  case finishing, finished
}
struct WatchSnapshot: Codable, Equatable {
  let protocolVersion: Int
  let kind: String
  let contextId: String?
  let revision: Int
  let sequence: Int
  let leaseId: String?
  let expiresAtMs: Double
  let sessionId: String?
  let dogId: String?
  let dogName: String?
  let phase: WatchPhase
  let distanceM: Double?
  let elapsedSeconds: Double?
  let capabilities: [WatchAction]
}
struct WatchCommand: Codable, Equatable {
  let protocolVersion: Int
  let kind: String
  let commandId: String
  let contextId: String
  let revision: Int
  let leaseId: String
  let sessionId: String?
  let dogId: String
  let action: WatchAction
  let confirmed: Bool
}
enum WatchReason: String, Codable {
  case ok, invalidCommand = "invalid_command", unavailable, staleContext = "stale_context"
  case staleRevision = "stale_revision", expired, wrongTarget = "wrong_target", notAllowed = "not_allowed"
  case confirmationRequired = "confirmation_required", busy, failed
}
struct WatchAck: Codable {
  let protocolVersion: Int
  let kind: String
  let commandId: String?
  let status: String
  let reason: WatchReason
  let snapshot: WatchSnapshot
}
enum WatchWireError: Error { case invalid }
enum WatchWireMessage {
  case snapshot(WatchSnapshot), command(WatchCommand), ack(WatchAck), snapshotRequest
}

enum WatchWire {
  static let maxBytes = 8192
  static let snapshotRequestJSON = "{\"protocolVersion\":1,\"kind\":\"snapshot_request\"}"
  private static let snapshotKeys: Set<String> = ["protocolVersion", "kind", "contextId", "revision", "sequence", "leaseId", "expiresAtMs", "sessionId", "dogId", "dogName", "phase", "distanceM", "elapsedSeconds", "capabilities"]
  private static let commandKeys: Set<String> = ["protocolVersion", "kind", "commandId", "contextId", "revision", "leaseId", "sessionId", "dogId", "action", "confirmed"]
  private static let ackKeys: Set<String> = ["protocolVersion", "kind", "commandId", "status", "reason", "snapshot"]

  static func parse(_ json: String) throws -> WatchWireMessage {
    guard let data = json.data(using: .utf8), data.count <= maxBytes,
          let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          integer(object["protocolVersion"]) == 1, let kind = object["kind"] as? String else { throw WatchWireError.invalid }
    switch kind {
    case "snapshot":
      try validateSnapshot(object)
      return .snapshot(try JSONDecoder().decode(WatchSnapshot.self, from: data))
    case "command":
      guard Set(object.keys) == commandKeys, integer(object["revision"]) != nil,
            nonempty(object["contextId"]), nonempty(object["leaseId"]), nonempty(object["dogId"]),
            nullableString(object["sessionId"]), let commandId = object["commandId"] as? String,
            validUUID(commandId), let action = object["action"] as? String,
            WatchAction(rawValue: action) != nil, isBool(object["confirmed"]) else { throw WatchWireError.invalid }
      return .command(try JSONDecoder().decode(WatchCommand.self, from: data))
    case "ack":
      guard Set(object.keys) == ackKeys, nullableUUID(object["commandId"]),
            let status = object["status"] as? String, ["accepted", "rejected"].contains(status),
            let reason = object["reason"] as? String, WatchReason(rawValue: reason) != nil,
            let snapshot = object["snapshot"] as? [String: Any] else { throw WatchWireError.invalid }
      try validateSnapshot(snapshot)
      return .ack(try JSONDecoder().decode(WatchAck.self, from: data))
    case "snapshot_request":
      guard Set(object.keys) == ["protocolVersion", "kind"] else { throw WatchWireError.invalid }
      return .snapshotRequest
    default: throw WatchWireError.invalid
    }
  }
  private static func validateSnapshot(_ object: [String: Any]) throws {
    guard Set(object.keys) == snapshotKeys, integer(object["protocolVersion"]) == 1,
          object["kind"] as? String == "snapshot", integer(object["revision"]) != nil,
          integer(object["sequence"]) != nil, number(object["expiresAtMs"]) != nil,
          ["contextId", "leaseId", "sessionId", "dogId"].allSatisfy({ nullableString(object[$0]) }),
          (object["dogName"] is NSNull || object["dogName"] is String),
          ["distanceM", "elapsedSeconds"].allSatisfy({ object[$0] is NSNull || number(object[$0]) != nil }),
          let phase = object["phase"] as? String, WatchPhase(rawValue: phase) != nil,
          let actions = object["capabilities"] as? [String], actions.allSatisfy({ WatchAction(rawValue: $0) != nil })
    else { throw WatchWireError.invalid }
  }
  private static func isBool(_ value: Any?) -> Bool {
    guard let number = value as? NSNumber else { return false }
    return CFGetTypeID(number) == CFBooleanGetTypeID()
  }
  private static func number(_ value: Any?) -> Double? {
    guard !isBool(value), let value = value as? NSNumber, value.doubleValue.isFinite else { return nil }
    return value.doubleValue
  }
  private static func integer(_ value: Any?) -> Int? {
    guard let value = number(value), value >= 0, value <= 9_007_199_254_740_991,
          value.rounded() == value else { return nil }
    return Int(value)
  }
  private static func nonempty(_ value: Any?) -> Bool {
    guard let value = value as? String else { return false }
    return !value.isEmpty && value.utf16.count <= 160
  }
  private static func nullableString(_ value: Any?) -> Bool { value is NSNull || nonempty(value) }
  private static func validUUID(_ value: String) -> Bool {
    value.range(of: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$", options: .regularExpression) != nil
  }
  private static func nullableUUID(_ value: Any?) -> Bool {
    value is NSNull || (value as? String).map(validUUID) == true
  }
  static func encodeCommand(_ command: WatchCommand) throws -> String {
    // Optional sessionId must be present as JSON null, not omitted by Codable.
    let object: [String: Any] = ["protocolVersion": 1, "kind": "command", "commandId": command.commandId,
      "contextId": command.contextId, "revision": command.revision, "leaseId": command.leaseId,
      "sessionId": command.sessionId as Any? ?? NSNull(), "dogId": command.dogId,
      "action": command.action.rawValue, "confirmed": command.confirmed]
    let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    guard let json = String(data: data, encoding: .utf8) else { throw WatchWireError.invalid }
    _ = try parse(json)
    return json
  }
}
