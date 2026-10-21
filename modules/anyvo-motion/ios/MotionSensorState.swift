import Foundation

/// Queue-confined sensor state. No CoreMotion/Expo dependency: the exact code
/// used by the bridge can be exercised with deterministic clocks and callbacks.
struct MotionSensorState {
  static let qualityVersion = 3
  static let maxMotionAgeS = 2.0
  static let maxPedometerAgeS = 2.0
  static let maxActivityAgeS = 6.0

  private(set) var generation: UInt64 = 0
  private(set) var running = false
  private(set) var runID = ""
  private(set) var discardedWindowCount = 0
  private var startedAt = 0.0
  private var lastMotionAt: Double?
  private var firstWindowAt: Double?
  private var lastWindowAt: Double?
  private var count = 0
  private var accelSum = 0.0
  private var rotationSum = 0.0
  private var firstYaw: Double?
  private var lastYaw: Double?
  private struct StepBatch { let count: Int; let startAt: Double; let endAt: Double }
  private(set) var totalSteps = 0
  private(set) var publishedStepCount = 0
  private(set) var discardedStepCount = 0
  private var pendingSteps: [StepBatch] = []
  var pendingStepCount: Int { pendingSteps.reduce(0) { $0 + $1.count } }
  private var pedometerAt: Double?
  private var pedometerIntervalS: Double?
  private var cadence: Double?
  private var pedometerInvalidated = false
  private var activityAt: Double?
  private var activityState = "unknown"
  private var activityConfidence = "low"

  mutating func start(at now: Double) -> UInt64 {
    if running { return generation }
    generation &+= 1
    running = true
    runID = UUID().uuidString
    startedAt = now
    discardedWindowCount = 0
    resetSensors()
    return generation
  }

  mutating func stop() {
    generation &+= 1 // queued timer and sensor callbacks no longer own this run
    running = false
    resetSensors()
  }

  func accepts(_ token: UInt64) -> Bool { running && generation == token }

  private mutating func resetWindow() {
    firstWindowAt = nil; lastWindowAt = nil; count = 0
    accelSum = 0; rotationSum = 0; firstYaw = nil; lastYaw = nil
  }

  private mutating func resetSensors() {
    resetWindow()
    lastMotionAt = nil; totalSteps = 0; pendingSteps = []
    publishedStepCount = 0; discardedStepCount = 0
    pedometerAt = nil; pedometerIntervalS = nil; cadence = nil
    pedometerInvalidated = false
    activityAt = nil; activityState = "unknown"; activityConfidence = "low"
  }

  private func validTime(_ at: Double, receivedAt: Double) -> Bool {
    at.isFinite && receivedAt.isFinite && at >= startedAt && at <= receivedAt
  }

  mutating func recordMotion(token: UInt64, at: Double, receivedAt: Double,
                             acceleration: Double, rotation: Double, yawDegrees: Double) {
    guard accepts(token), validTime(at, receivedAt: receivedAt),
      receivedAt - at <= Self.maxMotionAgeS,
      acceleration.isFinite, acceleration >= 0, rotation.isFinite, rotation >= 0,
      yawDegrees.isFinite, lastMotionAt.map({ at > $0 }) ?? true else { return }
    // After a timer/queue stall do not average an unbounded interval into a
    // supposedly fresh 250 ms sample. The missing interval remains unknown.
    if let first = firstWindowAt, at - first > Self.maxMotionAgeS {
      resetWindow(); discardedWindowCount += 1
    }
    lastMotionAt = at
    firstWindowAt = firstWindowAt ?? at
    lastWindowAt = at
    firstYaw = firstYaw ?? yawDegrees
    lastYaw = yawDegrees
    accelSum += acceleration; rotationSum += rotation; count += 1
  }

  mutating func recordPedometer(token: UInt64, total: Int, endAt: Double,
                                receivedAt: Double, cadencePerMinute: Double?) {
    guard accepts(token), validTime(endAt, receivedAt: receivedAt), total >= totalSteps,
      pedometerAt.map({ endAt > $0 }) ?? true else { return }
    expirePendingSteps(at: receivedAt)
    let startAt = pedometerAt ?? startedAt
    pedometerIntervalS = endAt - startAt
    let delta = total - totalSteps
    totalSteps = total
    pedometerAt = endAt
    pedometerInvalidated = false
    // Delayed cumulative data advances the baseline, but cannot be promoted
    // into fresh steps by the next timer tick or a later callback.
    if receivedAt - endAt <= Self.maxPedometerAgeS {
      if delta > 0 { pendingSteps.append(StepBatch(count: delta, startAt: startAt, endAt: endAt)) }
      cadence = cadencePerMinute.flatMap { $0.isFinite && $0 >= 0 ? $0 : nil }
    } else {
      discardedStepCount += delta; cadence = nil
    }
  }

  mutating func invalidatePedometer(token: UInt64) {
    guard accepts(token) else { return }
    discardedStepCount += pendingStepCount; pendingSteps = []
    // Keep the last accepted cumulative end time as the source baseline.
    // Clearing it could accept an older callback or invent post-error coverage.
    cadence = nil; pedometerIntervalS = nil
    pedometerInvalidated = true
  }

  private mutating func expirePendingSteps(at now: Double) {
    for batch in pendingSteps where now - batch.endAt > Self.maxPedometerAgeS {
      discardedStepCount += batch.count
    }
    pendingSteps.removeAll { now - $0.endAt > Self.maxPedometerAgeS }
  }

  mutating func recordActivity(token: UInt64, receivedAt: Double, state: String, confidence: String) {
    guard accepts(token), validTime(receivedAt, receivedAt: receivedAt) else { return }
    activityAt = receivedAt
    activityState = state
    activityConfidence = confidence
  }

  /// `timestamp` is the last actual device-motion measurement mapped to Unix
  /// time, not the time of dispatch to JS. No sample is emitted for empty or
  /// stale windows, even when a timer/activity/pedometer remains active.
  mutating func emit(token: UInt64, now: Double, unixMs: Double) -> [String: Any]? {
    guard accepts(token), now.isFinite, unixMs.isFinite else { return nil }
    expirePendingSteps(at: now)
    defer { resetWindow() }
    guard let first = firstWindowAt, let last = lastWindowAt, count > 0,
      now >= last, now - last <= Self.maxMotionAgeS,
      now - first <= Self.maxMotionAgeS else {
      discardedWindowCount += 1
      return nil
    }
    let accel = accelSum / Double(count)
    let rotation = rotationSum / Double(count)
    var yaw = (lastYaw ?? 0) - (firstYaw ?? 0)
    yaw = yaw.truncatingRemainder(dividingBy: 360)
    if yaw > 180 { yaw -= 360 }
    if yaw < -180 { yaw += 360 }
    let stepAge = pedometerInvalidated ? nil : pedometerAt.map { max(0, now - $0) }
    let activityAge = activityAt.map { max(0, now - $0) }
    let freshSteps = !pedometerInvalidated && (stepAge.map { $0 <= Self.maxPedometerAgeS } ?? false)
    // A cumulative delta covers its source interval, not this motion window.
    // Keep it across empty ticks, but never attach it to older motion or let a
    // newer zero-step callback refresh an expired batch. Each batch emits once.
    let delivered = pendingSteps.filter { $0.endAt <= last }
    let stepDelta = delivered.reduce(0) { $0 + $1.count }
    pendingSteps.removeAll { $0.endAt <= last }
    publishedStepCount += stepDelta
    let freshActivity = activityAge.map { $0 <= Self.maxActivityAgeS } ?? false
    let fallbackState = accel < 0.03 ? "stationary" : (accel < 0.25 ? "walking" : "running")
    let confidence = min(1.0, 0.6 + (freshSteps ? 0.2 : 0) + (freshActivity ? 0.2 : 0))
    var payload: [String: Any] = [:]
    payload["timestamp"] = unixMs - (now - last) * 1000
    payload["accelerationMagnitude"] = accel
    payload["rotationMagnitude"] = rotation
    payload["headingDelta"] = yaw
    payload["stepDelta"] = stepDelta
    payload["cadence"] = NSNull()
    if freshSteps, let cadence { payload["cadence"] = cadence }
    payload["movementState"] = freshActivity ? activityState : fallbackState
    payload["motionConfidence"] = confidence
    payload["activityConfidence"] = freshActivity ? activityConfidence : "low"
    payload["activityAgeMs"] = NSNull()
    if let activityAge { payload["activityAgeMs"] = activityAge * 1000 }
    payload["qualityVersion"] = Self.qualityVersion
    payload["runId"] = runID
    payload["windowStartTimestamp"] = unixMs - (now - first) * 1000
    payload["windowEndTimestamp"] = unixMs - (now - last) * 1000
    payload["emittedAtTimestamp"] = unixMs
    payload["deviceMotionSampleCount"] = count
    payload["deviceMotionAgeMs"] = (now - last) * 1000
    payload["pedometerAgeMs"] = NSNull()
    if let stepAge { payload["pedometerAgeMs"] = stepAge * 1000 }
    payload["pedometerIntervalMs"] = NSNull()
    if let pedometerIntervalS { payload["pedometerIntervalMs"] = pedometerIntervalS * 1000 }
    payload["discardedWindowCount"] = discardedWindowCount
    payload["pedometerCumulativeSteps"] = totalSteps
    payload["pedometerPublishedStepCount"] = publishedStepCount
    payload["pedometerPendingStepCount"] = pendingStepCount
    payload["pedometerDiscardedStepCount"] = discardedStepCount
    payload["pedometerStepWindowStartTimestamp"] = NSNull()
    payload["pedometerStepWindowEndTimestamp"] = NSNull()
    if let firstStep = delivered.first, let lastStep = delivered.last {
      payload["pedometerStepWindowStartTimestamp"] = unixMs - (now - firstStep.startAt) * 1000
      payload["pedometerStepWindowEndTimestamp"] = unixMs - (now - lastStep.endAt) * 1000
    }
    return payload
  }
}
