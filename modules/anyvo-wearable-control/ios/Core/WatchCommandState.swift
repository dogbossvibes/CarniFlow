import Foundation

// Watch display/command state only. It never authorizes a phone mutation or stores a recording.
struct WatchCommandState {
  private(set) var snapshot: WatchSnapshot?
  private(set) var pending: WatchCommand?
  private var validUntilUptimeMs: Double = 0
  private var pendingUntilUptimeMs: Double = 0
  private var retiredContexts: [String] = []

  mutating func receiveSnapshot(_ value: WatchSnapshot, wallTimeMs: Double, uptimeMs: Double) -> Bool {
    if let context = value.contextId, retiredContexts.contains(context) { return false }
    if let old = snapshot, old.contextId == value.contextId, (value.sequence <= old.sequence || value.revision < old.revision) { return false }
    if let oldContext = snapshot?.contextId, oldContext != value.contextId {
      retiredContexts.append(oldContext)
      retiredContexts = Array(retiredContexts.suffix(32))
    }
    snapshot = value
    validUntilUptimeMs = uptimeMs + min(30_000, max(0, value.expiresAtMs - wallTimeMs))
    return true
  }

  func isFresh(uptimeMs: Double) -> Bool { snapshot != nil && uptimeMs < validUntilUptimeMs }

  func canSend(_ action: WatchAction, connected: Bool, uptimeMs: Double) -> Bool {
    guard connected, pending == nil, uptimeMs < validUntilUptimeMs, let value = snapshot,
          value.contextId != nil, value.leaseId != nil, value.dogId != nil else { return false }
    return value.capabilities.contains(action)
  }

  mutating func begin(_ action: WatchAction, confirmed: Bool, connected: Bool, uptimeMs: Double, confirmation: WatchSnapshot? = nil) -> WatchCommand? {
    guard canSend(action, connected: connected, uptimeMs: uptimeMs),
          action != .endPhase || confirmed, let value = snapshot,
          let context = value.contextId, let lease = value.leaseId, let dog = value.dogId else { return nil }
    if action == .endPhase {
      guard let confirmation, confirmation.contextId == value.contextId,
            confirmation.revision == value.revision, confirmation.leaseId == value.leaseId,
            confirmation.sessionId == value.sessionId, confirmation.dogId == value.dogId,
            confirmation.phase == value.phase else { return nil }
    }
    let command = WatchCommand(protocolVersion: 1, kind: "command", commandId: UUID().uuidString,
      contextId: context, revision: value.revision, leaseId: lease, sessionId: value.sessionId,
      dogId: dog, action: action, confirmed: confirmed)
    pending = command
    pendingUntilUptimeMs = uptimeMs + 5_000
    return command
  }

  // A transport reply is insufficient; only the matching phone ACK can confirm success.
  mutating func complete(_ ack: WatchAck, wallTimeMs: Double, uptimeMs: Double) -> Bool? {
    guard let command = pending, ack.commandId == command.commandId,
          uptimeMs < pendingUntilUptimeMs else { return nil }
    pending = nil
    // A session/account change while a command was in flight never shows success for another target.
    guard snapshot?.contextId == command.contextId else { return false }
    _ = receiveSnapshot(ack.snapshot, wallTimeMs: wallTimeMs, uptimeMs: uptimeMs)
    return ack.status == "accepted" && ack.reason == .ok
  }

  mutating func expirePending(uptimeMs: Double) -> Bool {
    guard pending != nil, uptimeMs >= pendingUntilUptimeMs else { return false }
    pending = nil
    validUntilUptimeMs = 0 // explicit read-only refresh before another action
    return true
  }
  mutating func transportFailed() {
    pending = nil
    validUntilUptimeMs = 0
  }
  mutating func clear() {
    if let context = snapshot?.contextId { retiredContexts.append(context) }
    retiredContexts = Array(retiredContexts.suffix(32))
    snapshot = nil
    pending = nil
    validUntilUptimeMs = 0
  }
}

// Transient native request correlation. IDs are generated here, never trusted from the peer JSON.
struct WatchNativeRequests {
  struct Request {
    let json: String
    let expiresUptimeMs: Double
    let commandId: String?
  }
  private(set) var requests: [String: Request] = [:]
  static let maxPending = 8
  mutating func insert(json: String, uptimeMs: Double) throws -> String? {
    let wire = try WatchWire.parse(json)
    let commandId: String?
    switch wire {
    case .command(let command): commandId = command.commandId
    case .snapshotRequest: commandId = nil
    default: throw WatchWireError.invalid
    }
    guard requests.count < Self.maxPending else { return nil }
    let id = UUID().uuidString
    requests[id] = Request(json: json, expiresUptimeMs: uptimeMs + 5_000, commandId: commandId)
    return id
  }
  mutating func response(requestId: String, json: String, uptimeMs: Double) throws -> Bool {
    guard let request = requests[requestId], uptimeMs < request.expiresUptimeMs else { return false }
    switch try WatchWire.parse(json) {
    case .ack(let ack):
      guard request.commandId != nil, request.commandId == ack.commandId else { return false }
    case .snapshot:
      guard request.commandId == nil else { return false }
    default: return false
    }
    requests.removeValue(forKey: requestId)
    return true
  }
  mutating func remove(_ requestId: String) { requests.removeValue(forKey: requestId) }
  mutating func clear() { requests.removeAll() }
}
