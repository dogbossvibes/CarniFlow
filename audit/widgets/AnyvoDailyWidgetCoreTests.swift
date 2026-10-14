import Foundation

@main
enum DailyWidgetCoreTests {
  static func main() throws {
    let formatter = ISO8601DateFormatter()
    let now = formatter.date(from: "2026-10-14T10:00:00Z")!
    let nowMs = now.timeIntervalSince1970 * 1000
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("anyvo-widget-tests-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = AnyvoDailyWidgetStore(directory: directory, now: { nowMs })
    var passed = 0
    func check(_ value: Bool, _ name: String) throws {
      guard value else { throw NSError(domain: "DailyWidgetCoreTests", code: 1, userInfo: [NSLocalizedDescriptionKey: name]) }
      passed += 1
    }
    func item(_ id: String, _ kind: AnyvoWidgetItem.Kind, _ start: Double,
              _ status: AnyvoWidgetItem.Status = .confirmed, eligible: Bool = false) -> AnyvoWidgetItem {
      AnyvoWidgetItem(id: id, kind: kind, dogIds: ["dog-a"], startAtMs: start,
        endAtMs: nil, status: status, carPlayEligible: eligible)
    }
    let snapshot = AnyvoWidgetSnapshot(schemaVersion: 1, generatedAtMs: nowMs, freshUntilMs: nowMs + 900_000,
      expiresAtMs: nowMs + 21_600_000, timeZone: "UTC", dogs: [AnyvoWidgetDog(id: "dog-a", name: "Rex")],
      items: [item("reminder", .reminder, nowMs - 1_000), item("pending", .appointment, nowMs + 10_000, .pending),
              item("health", .appointment, nowMs + 20_000), item("appointment", .appointment, nowMs + 30_000, eligible: true)],
      truncated: false)
    let encoded = try JSONEncoder().encode(snapshot)
    let json = String(data: encoded, encoding: .utf8)!
    let a = try store.beginSession(ownerKey: "hash-a")
    try check(try store.updateSnapshot(token: a, sequence: 1, json: json), "initial write")
    try check(!(try store.updateSnapshot(token: a, sequence: 1, json: json)), "duplicate sequence rejected")
    try check(!(try store.updateSnapshot(token: a, sequence: 0, json: json)), "old sequence rejected")
    try check(try store.updateAvailability(token: a, sequence: 2, state: .offline), "offline recorded")
    try check(store.read()?.snapshot?.generatedAtMs == nowMs, "offline does not renew data freshness")
    let renewed = try store.beginSession(ownerKey: "hash-a")
    try check(a != renewed && store.read()?.snapshot == snapshot, "same owner retains cache with new token")
    try check(!(try store.updateSnapshot(token: a, sequence: 99, json: json)), "old token rejected after same-owner restart")
    let b = try store.beginSession(ownerKey: "hash-b")
    try check(store.read()?.snapshot == nil, "account switch clears derived data")
    try check(!(try store.updateSnapshot(token: renewed, sequence: 99, json: json)), "late previous-account write rejected")
    let again = try store.beginSession(ownerKey: "hash-a")
    try check(again != a && store.read()?.snapshot == nil, "A B A does not restore old account snapshot")
    try check(!(try store.updateAvailability(token: b, sequence: 100, state: .error)), "old error cannot change new owner")
    var unknown = try JSONSerialization.jsonObject(with: encoded) as! [String: Any]
    unknown["accessToken"] = "SECRET-NEVER-PERSIST"
    unknown["notes"] = "SECRET-NEVER-PERSIST"
    let unknownJSON = String(data: try JSONSerialization.data(withJSONObject: unknown), encoding: .utf8)!
    try check(try store.updateSnapshot(token: again, sequence: 1, json: unknownJSON), "typed unknown-key projection")
    let persisted = try String(contentsOf: directory.appendingPathComponent(AnyvoDailyWidgetStore.fileName), encoding: .utf8)
    try check(!persisted.contains("SECRET-NEVER-PERSIST") && !persisted.contains("accessToken"), "unknown secrets excluded from disk")
    unknown["schemaVersion"] = 2
    do {
      _ = try store.updateSnapshot(token: again, sequence: 2, json: String(data: try JSONSerialization.data(withJSONObject: unknown), encoding: .utf8)!)
      try check(false, "unknown schema must reject")
    } catch AnyvoWidgetStoreError.invalidSnapshot { passed += 1 }
    unknown["schemaVersion"] = 1; unknown["expiresAtMs"] = nowMs + 21_600_001
    do {
      _ = try store.updateSnapshot(token: again, sequence: 2, json: String(data: try JSONSerialization.data(withJSONObject: unknown), encoding: .utf8)!)
      try check(false, "TTL extension must reject")
    } catch AnyvoWidgetStoreError.invalidSnapshot { passed += 1 }
    let utc = TimeZone(identifier: "UTC")!
    let phone = anyvoWidgetProjection(store.read(), at: now, dogId: nil, carPlay: false, timeZone: utc)
    try check(phone.appointment?.id == "health" && phone.pendingRequests == 1 && phone.reminders.count == 1 && phone.state == .ready, "confirmed main appointment wins; requests remain separate; UTC aliases match")
    let car = anyvoWidgetProjection(store.read(), at: now, dogId: nil, carPlay: true, timeZone: utc)
    try check(car.appointment?.id == "appointment" && car.reminders.isEmpty, "car omits health, requests, reminders")
    try check(anyvoWidgetProjection(store.read(), at: now, dogId: "deleted", carPlay: false, timeZone: utc).state == .selectionUnavailable, "deleted dog never falls back to other dogs")
    try check(anyvoWidgetProjection(store.read(), at: now.addingTimeInterval(901), dogId: nil, carPlay: false, timeZone: utc).state == .stale, "freshness expired")
    try check(anyvoWidgetProjection(store.read(), at: now.addingTimeInterval(21_601), dogId: nil, carPlay: false, timeZone: utc).state == .expired, "expired snapshot hides all data")
    try check(anyvoWidgetProjection(store.read(), at: now, dogId: nil, carPlay: false, timeZone: TimeZone(identifier: "Europe/Zurich")!).state == .stale, "timezone change requires refresh")
    let midnightBase = formatter.date(from: "2026-10-14T21:50:00Z")!
    let midnightMs = midnightBase.timeIntervalSince1970 * 1000
    let localSnapshot = AnyvoWidgetSnapshot(schemaVersion: 1, generatedAtMs: midnightMs, freshUntilMs: midnightMs + 900_000,
      expiresAtMs: midnightMs + 21_600_000, timeZone: "Europe/Zurich", dogs: snapshot.dogs,
      items: [item("before-midnight", .reminder, midnightMs + 300_000)], truncated: false)
    let localEnvelope = AnyvoWidgetEnvelope(ownerKey: "a", token: "t", sequence: 1, availability: .ready, snapshot: localSnapshot)
    try check(anyvoWidgetProjection(localEnvelope, at: midnightBase.addingTimeInterval(1_200), dogId: nil, carPlay: false,
      timeZone: TimeZone(identifier: "Europe/Zurich")!).reminders.isEmpty, "local midnight removes yesterday reminders")
    _ = try store.beginSession(ownerKey: nil)
    try check(store.read()?.snapshot == nil && anyvoWidgetProjection(store.read(), at: now, dogId: nil, carPlay: false).state == .signedOut, "logout clears disk/render state")
    try check(!(try store.updateSnapshot(token: again, sequence: 500, json: json)), "old write after logout rejected")
    let bigToken = try store.beginSession(ownerKey: "big-owner")
    let bigDogs = (0..<128).map { AnyvoWidgetDog(id: String(repeating: "x", count: 125) + String(format: "%03d", $0), name: "") }
    let bigItems = (0..<256).map { AnyvoWidgetItem(id: "big-\($0)", kind: .appointment,
      dogIds: bigDogs.map(\.id), startAtMs: nowMs + Double($0 + 1) * 1_000, endAtMs: nil, status: .confirmed, carPlayEligible: true) }
    let bigSnapshot = AnyvoWidgetSnapshot(schemaVersion: 1, generatedAtMs: nowMs, freshUntilMs: nowMs + 900_000,
      expiresAtMs: nowMs + 21_600_000, timeZone: "UTC", dogs: bigDogs, items: bigItems, truncated: false)
    let bigJSON = String(data: try JSONEncoder().encode(bigSnapshot), encoding: .utf8)!
    try check(try store.updateSnapshot(token: bigToken, sequence: 1, json: bigJSON), "entire declared dog/item bounds fit native payload limit")
    // Inject an impossible disk boundary without touching any source/customer data.
    let failingRoot = directory.appendingPathComponent("failure-boundary")
    let failingStore = AnyvoDailyWidgetStore(directory: failingRoot, now: { nowMs })
    let oldFailedToken = try failingStore.beginSession(ownerKey: "old")
    try FileManager.default.removeItem(at: failingRoot)
    try Data("not-a-directory".utf8).write(to: failingRoot)
    var identityFailed = false
    do { _ = try failingStore.beginSession(ownerKey: "new") } catch { identityFailed = true }
    try check(identityFailed, "identity I/O failure must throw")
    // Restore an old valid file deliberately to prove in-memory invalidation also
    // protects against a failed clear followed by a delayed storage recovery.
    try FileManager.default.removeItem(at: failingRoot)
    try FileManager.default.createDirectory(at: failingRoot, withIntermediateDirectories: true)
    let staleEnvelope = AnyvoWidgetEnvelope(ownerKey: "old", token: oldFailedToken, sequence: 0, availability: .ready, snapshot: nil)
    try JSONEncoder().encode(staleEnvelope).write(to: failingRoot.appendingPathComponent(AnyvoDailyWidgetStore.fileName))
    try check(!(try failingStore.updateSnapshot(token: oldFailedToken, sequence: 1, json: json)), "failed identity I/O never restores old writer authority")
    print("PASS \(passed) native Foundation assertions; no WidgetKit/Simulator/device claims")
  }
}
