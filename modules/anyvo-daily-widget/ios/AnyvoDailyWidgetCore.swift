import Foundation

// Shared by the app module and WidgetKit extension. No credentials, networking,
// Health calculations, recording logic or customer free-text fields.
struct AnyvoWidgetDog: Codable, Equatable {
  let id: String
  let name: String // Only used by the on-phone configuration picker.
}
struct AnyvoWidgetItem: Codable, Equatable {
  enum Kind: String, Codable { case appointment, reminder }
  enum Status: String, Codable { case confirmed, pending }
  let id: String
  let kind: Kind
  let dogIds: [String]
  let startAtMs: Double
  let endAtMs: Double?
  let status: Status
  let carPlayEligible: Bool
}
struct AnyvoWidgetSnapshot: Codable, Equatable {
  let schemaVersion: Int
  let generatedAtMs: Double
  let freshUntilMs: Double
  let expiresAtMs: Double
  let timeZone: String
  let dogs: [AnyvoWidgetDog]
  let items: [AnyvoWidgetItem]
  let truncated: Bool

  func validate(nowMs: Double) throws {
    guard schemaVersion == 1, generatedAtMs.isFinite, generatedAtMs > 0,
          freshUntilMs.isFinite, expiresAtMs.isFinite,
          generatedAtMs <= nowMs + 60_000, expiresAtMs > nowMs,
          freshUntilMs > generatedAtMs, freshUntilMs <= generatedAtMs + 900_000,
          expiresAtMs > freshUntilMs, expiresAtMs <= generatedAtMs + 21_600_000,
          TimeZone(identifier: timeZone) != nil, dogs.count <= 128, items.count <= 256
    else { throw AnyvoWidgetStoreError.invalidSnapshot }
    let dogIds = Set(dogs.map(\.id))
    guard dogIds.count == dogs.count, Set(items.map(\.id)).count == items.count,
          dogs.allSatisfy({ !$0.id.isEmpty && $0.id.count <= 128 && $0.name.count <= 60 }),
          items.allSatisfy({ item in
            !item.id.isEmpty && item.id.count <= 128 && item.startAtMs.isFinite && item.startAtMs > 0
              && (item.endAtMs == nil || (item.endAtMs!.isFinite && item.endAtMs! > item.startAtMs))
              && item.dogIds.count <= 128 && Set(item.dogIds).count == item.dogIds.count
              && item.dogIds.allSatisfy(dogIds.contains)
              && (!item.carPlayEligible || (item.kind == .appointment && item.status == .confirmed))
          }) else { throw AnyvoWidgetStoreError.invalidSnapshot }
  }
}

enum AnyvoWidgetAvailability: String, Codable { case ready, offline, error }
struct AnyvoWidgetEnvelope: Codable {
  let ownerKey: String?
  let token: String
  var sequence: Int
  var availability: AnyvoWidgetAvailability
  var snapshot: AnyvoWidgetSnapshot?
}
enum AnyvoWidgetStoreError: Error { case invalidSnapshot, unavailable }

final class AnyvoDailyWidgetStore: @unchecked Sendable {
  static let fileName = "anyvo-daily-widget-v1.json"
  static let maximumBytes = 16 * 1024 * 1024 // Covers all 128×256 bounded dog references, including Unicode.
  private let file: URL
  private let lock = NSLock()
  private let now: () -> Double
  private var liveToken: String? // Writer authority is invalidated before identity disk I/O.

  init(directory: URL, now: @escaping () -> Double = { Date().timeIntervalSince1970 * 1000 }) {
    file = directory.appendingPathComponent(Self.fileName)
    self.now = now
  }

  private func readUnlocked() -> AnyvoWidgetEnvelope? {
    guard let data = try? Data(contentsOf: file), data.count <= Self.maximumBytes else { return nil }
    return try? JSONDecoder().decode(AnyvoWidgetEnvelope.self, from: data)
  }
  func read() -> AnyvoWidgetEnvelope? {
    lock.lock(); defer { lock.unlock() }
    return readUnlocked()
  }
  private func write(_ envelope: AnyvoWidgetEnvelope) throws {
    let data = try JSONEncoder().encode(envelope) // Reencode typed whitelist, discard unknown JSON.
    guard data.count <= Self.maximumBytes else { throw AnyvoWidgetStoreError.invalidSnapshot }
    try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
    #if os(iOS)
    // Needed while iPhone is locked in CarPlay; this file has no secret or free text.
    try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    #else
    try data.write(to: file, options: .atomic)
    #endif
    var resource = URLResourceValues(); resource.isExcludedFromBackup = true
    var url = file; try url.setResourceValues(resource)
  }

  func beginSession(ownerKey: String?) throws -> String {
    lock.lock(); defer { lock.unlock() }
    let old = readUnlocked()
    let token = UUID().uuidString
    liveToken = token
    let snapshot = ownerKey != nil && old?.ownerKey == ownerKey ? old?.snapshot : nil
    let envelope = AnyvoWidgetEnvelope(ownerKey: ownerKey, token: token, sequence: 0,
      availability: old?.ownerKey == ownerKey ? (old?.availability ?? .ready) : .ready,
      snapshot: snapshot)
    do { try write(envelope) } catch {
      // On a failed identity change, remove this derived cache, never source data.
      try? FileManager.default.removeItem(at: file)
      throw error
    }
    return token
  }

  func updateSnapshot(token: String, sequence: Int, json: String) throws -> Bool {
    lock.lock(); defer { lock.unlock() }
    guard liveToken == token, var envelope = readUnlocked(), envelope.ownerKey != nil,
          envelope.token == token, sequence > envelope.sequence, sequence > 0
    else { return false }
    guard let data = json.data(using: .utf8), data.count <= Self.maximumBytes else { throw AnyvoWidgetStoreError.invalidSnapshot }
    let snapshot = try JSONDecoder().decode(AnyvoWidgetSnapshot.self, from: data)
    try snapshot.validate(nowMs: now())
    envelope.sequence = sequence; envelope.snapshot = snapshot; envelope.availability = .ready
    try write(envelope)
    return true
  }
  func updateAvailability(token: String, sequence: Int, state: AnyvoWidgetAvailability) throws -> Bool {
    lock.lock(); defer { lock.unlock() }
    guard liveToken == token, var envelope = readUnlocked(), envelope.ownerKey != nil,
          envelope.token == token, sequence > envelope.sequence, sequence > 0, state != .ready
    else { return false }
    envelope.sequence = sequence; envelope.availability = state
    try write(envelope)
    return true
  }
}

enum AnyvoWidgetDisplayState: String {
  case ready, noSnapshot, signedOut, offline, error, stale, expired, selectionUnavailable
}
struct AnyvoWidgetProjection {
  let state: AnyvoWidgetDisplayState
  let snapshot: AnyvoWidgetSnapshot?
  let appointment: AnyvoWidgetItem?
  let reminders: [AnyvoWidgetItem]
  let pendingRequests: Int
}

func anyvoWidgetProjection(_ envelope: AnyvoWidgetEnvelope?, at date: Date,
                           dogId: String?, carPlay: Bool, timeZone: TimeZone = .current) -> AnyvoWidgetProjection {
  let empty: (AnyvoWidgetDisplayState) -> AnyvoWidgetProjection = {
    AnyvoWidgetProjection(state: $0, snapshot: nil, appointment: nil, reminders: [], pendingRequests: 0)
  }
  guard let envelope else { return empty(.noSnapshot) }
  guard envelope.ownerKey != nil else { return empty(.signedOut) }
  guard let snapshot = envelope.snapshot else {
    return empty(envelope.availability == .offline ? .offline : envelope.availability == .error ? .error : .noSnapshot)
  }
  let nowMs = date.timeIntervalSince1970 * 1000
  guard snapshot.schemaVersion == 1, nowMs >= snapshot.generatedAtMs - 60_000 else { return empty(.noSnapshot) }
  guard snapshot.expiresAtMs > nowMs else { return empty(.expired) }
  guard (try? snapshot.validate(nowMs: nowMs)) != nil else { return empty(.noSnapshot) }
  if let dogId, !snapshot.dogs.contains(where: { $0.id == dogId }) { return empty(.selectionUnavailable) }
  var calendar = Calendar(identifier: .gregorian); calendar.timeZone = timeZone
  let items = snapshot.items.filter { dogId == nil || $0.dogIds.contains(dogId!) }
  let candidates = items.filter {
    $0.kind == .appointment && (!carPlay || $0.carPlayEligible)
      && ($0.startAtMs >= nowMs || ($0.endAtMs != nil && $0.endAtMs! > nowMs))
  }.sorted { $0.startAtMs == $1.startAtMs ? $0.id < $1.id : $0.startAtMs < $1.startAtMs }
  let appointment = candidates.first(where: { $0.status == .confirmed }) ?? candidates.first
  let pendingRequests = candidates.filter { $0.status == .pending }.count
  let reminders = carPlay ? [] : items.filter {
    $0.kind == .reminder && calendar.isDate(Date(timeIntervalSince1970: $0.startAtMs / 1000), inSameDayAs: date)
  }.sorted { $0.startAtMs == $1.startAtMs ? $0.id < $1.id : $0.startAtMs < $1.startAtMs }
  let state: AnyvoWidgetDisplayState = snapshot.freshUntilMs <= nowMs || TimeZone(identifier: snapshot.timeZone) != timeZone
    ? .stale : envelope.availability == .offline ? .offline : envelope.availability == .error ? .error : .ready
  return AnyvoWidgetProjection(state: state, snapshot: snapshot, appointment: appointment, reminders: reminders, pendingRequests: pendingRequests)
}
