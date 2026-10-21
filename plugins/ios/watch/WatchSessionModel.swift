import Foundation
import SwiftUI
import WatchConnectivity
import WatchKit

@MainActor
final class WatchSessionModel: NSObject, ObservableObject, WCSessionDelegate {
  @Published private(set) var state = WatchCommandState()
  @Published private(set) var connected = false
  @Published private(set) var statusKey = "Open ANYVO on your iPhone."
  @Published private(set) var tick = 0
  private var foreground = false
  private var refreshing = false
  private var refreshToken: UUID?
  private var lastRefreshUptime: Double = -.infinity
  private var timer: Timer?
  private var session: WCSession? { WCSession.isSupported() ? .default : nil }
  private var uptimeMs: Double { ProcessInfo.processInfo.systemUptime * 1000 }
  private var wallTimeMs: Double { Date().timeIntervalSince1970 * 1000 }

  override init() {
    super.init()
    guard let session else { return }
    session.delegate = self
    session.activate()
  }
  func setForeground(_ value: Bool) {
    foreground = value
    timer?.invalidate()
    timer = nil
    if value {
      refresh()
      timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
        Task { @MainActor in self?.poll() }
      }
    } else {
      refreshToken = nil
      refreshing = false
      if state.pending != nil {
        state.transportFailed()
        statusKey = "Confirmation pending. Check your iPhone."
      }
    }
  }
  private func poll() {
    tick &+= 1 // Refresh expiry-sensitive buttons even when distance has not changed.
    if state.expirePending(uptimeMs: uptimeMs) { statusKey = "Confirmation pending. Check your iPhone." }
    if connected, foreground, uptimeMs - lastRefreshUptime >= 10_000 { refresh() }
  }
  var snapshotIsFresh: Bool { state.isFresh(uptimeMs: uptimeMs) }
  func canSend(_ action: WatchAction) -> Bool {
    foreground && state.canSend(action, connected: connected, uptimeMs: uptimeMs)
  }
  func refresh() {
    updateConnection()
    guard foreground, connected, !refreshing, state.pending == nil, let session else { return }
    refreshing = true
    lastRefreshUptime = uptimeMs
    let token = UUID()
    refreshToken = token
    session.sendMessage(["json": WatchWire.snapshotRequestJSON], replyHandler: { [weak self] reply in
      Task { @MainActor in
        guard let self, self.refreshToken == token else { return }
        self.refreshing = false
        self.refreshToken = nil
        guard let json = reply["json"] as? String,
              let message = try? WatchWire.parse(json), case .snapshot(let snapshot) = message else {
          self.statusKey = "Open ANYVO on your iPhone."
          self.state.transportFailed()
          return
        }
        self.apply(snapshot)
      }
    }, errorHandler: { [weak self] _ in
      Task { @MainActor in
        guard let self, self.refreshToken == token else { return }
        self.refreshing = false
        self.refreshToken = nil
        self.state.transportFailed()
        self.updateConnection()
        self.statusKey = "iPhone unavailable. Open ANYVO."
      }
    })
    Task { @MainActor [weak self] in
      try? await Task.sleep(nanoseconds: 5_000_000_000)
      guard let self, self.refreshToken == token else { return }
      self.refreshToken = nil
      self.refreshing = false
      self.state.transportFailed()
      self.statusKey = "iPhone unavailable. Open ANYVO."
    }
  }
  func send(_ action: WatchAction, confirmed: Bool = false, confirmation: WatchSnapshot? = nil) {
    updateConnection()
    guard foreground, let session,
          let command = state.begin(action, confirmed: confirmed, connected: connected, uptimeMs: uptimeMs, confirmation: confirmation),
          let json = try? WatchWire.encodeCommand(command) else { return }
    statusKey = "Waiting for iPhone confirmation…"
    session.sendMessage(["json": json], replyHandler: { [weak self] reply in
      Task { @MainActor in
        guard let self, self.state.pending?.commandId == command.commandId else { return }
        guard let json = reply["json"] as? String, let message = try? WatchWire.parse(json),
              case .ack(let ack) = message,
              let accepted = self.state.complete(ack, wallTimeMs: self.wallTimeMs, uptimeMs: self.uptimeMs) else {
          self.state.transportFailed()
          self.statusKey = "Confirmation pending. Check your iPhone."
          return
        }
        self.statusKey = accepted ? "Confirmed by iPhone." : "Not confirmed. Refresh from iPhone."
        if accepted { WKInterfaceDevice.current().play(.success) }
      }
    }, errorHandler: { [weak self] _ in
      Task { @MainActor in
        guard let self, self.state.pending?.commandId == command.commandId else { return }
        self.state.transportFailed()
        self.statusKey = "Confirmation pending. Check your iPhone."
      }
    })
  }
  private func apply(_ snapshot: WatchSnapshot) {
    let previous = state.snapshot?.contextId
    if state.receiveSnapshot(snapshot, wallTimeMs: wallTimeMs, uptimeMs: uptimeMs) {
      if state.pending != nil && previous != snapshot.contextId {
        state.transportFailed()
        statusKey = "Session changed. Check your iPhone."
      } else if state.pending == nil {
        statusKey = snapshot.capabilities.isEmpty ? "Prepare a session on your iPhone." : "iPhone session"
      }
    }
  }
  private func updateConnection() {
    let reachable = session.map { $0.activationState == .activated && $0.isReachable && $0.isCompanionAppInstalled } ?? false
    if connected && !reachable {
      state.transportFailed()
      refreshToken = nil
      refreshing = false
    }
    connected = reachable
    if !connected { statusKey = "iPhone unavailable. Open ANYVO." }
  }
  private func receiveState(_ payload: [String: Any]) {
    if payload["cleared"] as? Bool == true {
      state.clear()
      statusKey = "Open ANYVO on your iPhone."
    } else if let json = payload["json"] as? String,
              let message = try? WatchWire.parse(json), case .snapshot(let snapshot) = message {
      apply(snapshot)
    }
  }
  nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    Task { @MainActor [weak self] in
      self?.updateConnection()
      self?.receiveState(session.receivedApplicationContext)
      self?.refresh()
    }
  }
  nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
    Task { @MainActor [weak self] in self?.updateConnection(); self?.refresh() }
  }
  nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    Task { @MainActor [weak self] in self?.receiveState(applicationContext) }
  }
  nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    Task { @MainActor [weak self] in self?.receiveState(message) }
  }
}
