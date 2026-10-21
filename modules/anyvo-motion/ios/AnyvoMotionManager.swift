import Foundation
import CoreMotion

// All sensor, timer and lifecycle state belongs to one serial queue. Native
// callbacks carry their start generation; stop/start cannot revive an old run.
final class AnyvoMotionManager {
  private let motionManager = CMMotionManager()
  private let pedometer = CMPedometer()
  private var activityManager: CMMotionActivityManager?
  private let queue = DispatchQueue(label: "app.anyvo.motion", qos: .utility)
  private let queueKey = DispatchSpecificKey<UInt8>()
  private lazy var sensorQueue: OperationQueue = {
    let operations = OperationQueue()
    operations.name = "app.anyvo.motion.callbacks"
    operations.maxConcurrentOperationCount = 1
    operations.underlyingQueue = queue
    return operations
  }()
  private var state = MotionSensorState()
  private var timer: DispatchSourceTimer?
  var onSample: (([String: Any]) -> Void)?
  var onError: ((String, String) -> Void)?

  init() { queue.setSpecific(key: queueKey, value: 1) }

  private func serialized<T>(_ body: () -> T) -> T {
    if DispatchQueue.getSpecific(key: queueKey) != nil { return body() }
    return queue.sync(execute: body)
  }

  @discardableResult
  func start(emitIntervalMs: Int) -> Bool {
    serialized {
      if state.running { return true }
      guard motionManager.isDeviceMotionAvailable else {
        onError?("MOTION_DEVICE_MOTION_UNAVAILABLE", "Bewegungssensoren auf diesem Gerät nicht verfügbar.")
        return false
      }
      let token = state.start(at: ProcessInfo.processInfo.systemUptime)
      startDeviceMotion(token: token)
      startPedometer(token: token)
      startActivity(token: token)
      // Match the existing 100 ms minimum; cap malformed/custom intervals to
      // the evidence freshness horizon. Default remains 250 ms.
      let interval = min(2.0, max(0.1, Double(emitIntervalMs) / 1000))
      let newTimer = DispatchSource.makeTimerSource(queue: queue)
      newTimer.schedule(deadline: .now() + interval, repeating: interval)
      newTimer.setEventHandler { [weak self] in
        guard let self = self else { return }
        if let payload = self.state.emit(token: token,
          now: ProcessInfo.processInfo.systemUptime,
          unixMs: Date().timeIntervalSince1970 * 1000) {
          self.onSample?(payload)
        }
      }
      timer = newTimer
      newTimer.resume()
      return true
    }
  }

  func stop() {
    serialized {
      state.stop()
      timer?.cancel(); timer = nil
      motionManager.stopDeviceMotionUpdates()
      pedometer.stopUpdates()
      activityManager?.stopActivityUpdates(); activityManager = nil
    }
  }

  private func startDeviceMotion(token: UInt64) {
    motionManager.deviceMotionUpdateInterval = 1.0 / 20.0
    motionManager.startDeviceMotionUpdates(to: sensorQueue) { [weak self] motion, error in
      guard let self = self else { return }
      self.queue.async { [weak self] in
        guard let self = self, self.state.accepts(token) else { return }
        guard let motion = motion, error == nil else { return }
        let a = motion.userAcceleration, r = motion.rotationRate
        self.state.recordMotion(token: token, at: motion.timestamp,
          receivedAt: ProcessInfo.processInfo.systemUptime,
          acceleration: (a.x * a.x + a.y * a.y + a.z * a.z).squareRoot(),
          rotation: (r.x * r.x + r.y * r.y + r.z * r.z).squareRoot(),
          yawDegrees: motion.attitude.yaw * 180 / Double.pi)
      }
    }
  }

  private func startPedometer(token: UInt64) {
    guard CMPedometer.isStepCountingAvailable() else { return }
    pedometer.startUpdates(from: Date()) { [weak self] data, error in
      guard let self = self else { return }
      self.queue.async { [weak self] in
        guard let self = self, self.state.accepts(token) else { return }
        guard error == nil else { self.state.invalidatePedometer(token: token); return }
        guard let data = data else { return }
        let now = ProcessInfo.processInfo.systemUptime
        let age = Date().timeIntervalSince(data.endDate)
        guard age >= 0 else { return }
        self.state.recordPedometer(token: token, total: data.numberOfSteps.intValue,
          endAt: now - age, receivedAt: now,
          cadencePerMinute: data.currentCadence.map { $0.doubleValue * 60 })
      }
    }
  }

  private func startActivity(token: UInt64) {
    guard CMMotionActivityManager.isActivityAvailable() else { return }
    let manager = CMMotionActivityManager()
    activityManager = manager
    manager.startActivityUpdates(to: sensorQueue) { [weak self] activity in
      guard let self = self else { return }
      self.queue.async { [weak self] in
        guard let self = self, self.state.accepts(token), let activity = activity else { return }
        let confidence: String
        switch activity.confidence {
        case .low: confidence = "low"
        case .medium: confidence = "medium"
        case .high: confidence = "high"
        @unknown default: confidence = "low"
        }
        let movement = activity.stationary ? "stationary" : activity.running ? "running"
          : activity.walking ? "walking" : activity.automotive ? "automotive" : "unknown"
        // Classification callbacks are event-driven. Keep the established 6 s
        // receipt-age policy; it is distinct from the device-motion sample age.
        self.state.recordActivity(token: token, receivedAt: ProcessInfo.processInfo.systemUptime,
          state: movement, confidence: confidence)
      }
    }
  }

  func buildStatus() -> [String: Any] {
    serialized {
      [
        "deviceMotionAvailable": motionManager.isDeviceMotionAvailable,
        "stepCountingAvailable": CMPedometer.isStepCountingAvailable(),
        "activityAvailable": CMMotionActivityManager.isActivityAvailable(),
        "pedometerAuthorized": CMPedometer.authorizationStatus() == .authorized,
        "running": state.running, "qualityVersion": MotionSensorState.qualityVersion,
        "runId": state.running ? state.runID as Any : NSNull(),
        "discardedWindowCount": state.discardedWindowCount,
        "pedometerCumulativeSteps": state.totalSteps,
        "pedometerPublishedStepCount": state.publishedStepCount,
        "pedometerPendingStepCount": state.pendingStepCount,
        "pedometerDiscardedStepCount": state.discardedStepCount,
      ]
    }
  }
}
