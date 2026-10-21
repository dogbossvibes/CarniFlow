import Foundation
import WatchConnectivity

// WCSession authenticates the paired companion. No JSON-provided peer/request identity is used.
final class AnyvoWatchPhoneTransport: NSObject, WCSessionDelegate {
  var onCommand: (([String: Any]) -> Void)?
  var onConnection: ((Bool) -> Void)?
  private var active = false
  private var peerId = UUID().uuidString
  private var stateJSON: String?
  private var ledger = WatchNativeRequests()
  private var replies: [String: ([String: Any]) -> Void] = [:]
  private var session: WCSession? { WCSession.isSupported() ? .default : nil }
  private var uptimeMs: Double { ProcessInfo.processInfo.systemUptime * 1000 }

  func start() {
    DispatchQueue.main.async { [weak self] in
      guard let self, let session = self.session else { return }
      self.active = true
      session.delegate = self
      session.activate()
    }
  }
  func stop() {
    DispatchQueue.main.async { [weak self] in
      self?.active = false
      self?.clear()
    }
  }
  func clear() {
    dispatchPrecondition(condition: .onQueue(.main))
    stateJSON = nil
    peerId = UUID().uuidString
    let callbacks = replies.values
    replies.removeAll()
    ledger.clear()
    for reply in callbacks { reply(["error": "unavailable"]) }
    if let session, session.delegate === self, session.activationState == .activated, session.isPaired, session.isWatchAppInstalled {
      try? session.updateApplicationContext(["cleared": true])
      if session.isReachable { session.sendMessage(["cleared": true], replyHandler: nil, errorHandler: { _ in }) }
    }
  }
  func publish(_ json: String) throws -> Bool {
    dispatchPrecondition(condition: .onQueue(.main))
    guard case .snapshot = try WatchWire.parse(json) else { throw WatchWireError.invalid }
    guard active, let session, session.delegate === self else { return false }
    stateJSON = json
    guard session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return false }
    try session.updateApplicationContext(["json": json])
    if session.isReachable { session.sendMessage(["json": json], replyHandler: nil, errorHandler: { _ in }) }
    return true
  }
  func respond(requestId: String, json: String) throws -> Bool {
    dispatchPrecondition(condition: .onQueue(.main))
    guard active, let reply = replies[requestId],
          try ledger.response(requestId: requestId, json: json, uptimeMs: uptimeMs) else { return false }
    replies.removeValue(forKey: requestId)
    reply(["json": json])
    return true
  }
  private func connectionChanged() {
    guard let session else { return }
    onConnection?(active && session.activationState == .activated && session.isReachable && session.isPaired && session.isWatchAppInstalled)
    if active, session.activationState == .activated, session.isPaired, session.isWatchAppInstalled {
      // Only latest state, never a command. Its own lease still determines freshness on the watch.
      try? session.updateApplicationContext(stateJSON.map { ["json": $0] } ?? ["cleared": true])
    }
  }
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    DispatchQueue.main.async { [weak self] in self?.connectionChanged() }
  }
  func sessionReachabilityDidChange(_ session: WCSession) {
    DispatchQueue.main.async { [weak self] in self?.connectionChanged() }
  }
  func sessionWatchStateDidChange(_ session: WCSession) {
    DispatchQueue.main.async { [weak self] in
      if !session.isPaired || !session.isWatchAppInstalled { self?.clear() }
      self?.connectionChanged()
    }
  }
  func sessionDidBecomeInactive(_ session: WCSession) {
    DispatchQueue.main.async { [weak self] in self?.clear(); self?.onConnection?(false) }
  }
  func sessionDidDeactivate(_ session: WCSession) {
    DispatchQueue.main.async { [weak self] in
      self?.clear()
      if self?.active == true { session.activate() }
    }
  }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
    // No userInfo/file/background command handlers are implemented, intentionally.
    let receivedUptimeMs = ProcessInfo.processInfo.systemUptime * 1000
    let expiresAtMs = Date().timeIntervalSince1970 * 1000 + 5_000
    DispatchQueue.main.async { [weak self] in
      guard let self, self.active, self.uptimeMs < receivedUptimeMs + 5_000, session.activationState == .activated,
            session.isPaired, session.isWatchAppInstalled,
            Set(message.keys) == ["json"], let json = message["json"] as? String else {
        replyHandler(["error": "unavailable"]); return
      }
      do {
        guard let id = try self.ledger.insert(json: json, uptimeMs: receivedUptimeMs) else {
          replyHandler(["error": "busy"]); return
        }
        self.replies[id] = replyHandler
        self.onCommand?(["requestId": id, "peerId": self.peerId, "json": json, "expiresAtMs": expiresAtMs])
        DispatchQueue.main.asyncAfter(deadline: .now() + max(0, (receivedUptimeMs + 5_000 - self.uptimeMs) / 1000)) { [weak self] in
          guard let self, let reply = self.replies.removeValue(forKey: id) else { return }
          self.ledger.remove(id)
          reply(["error": "unconfirmed"])
        }
      } catch { replyHandler(["error": "invalid_command"]) }
    }
  }
}
