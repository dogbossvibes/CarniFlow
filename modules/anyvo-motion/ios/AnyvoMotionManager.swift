import Foundation
import CoreMotion

// ANYVO Motion — iOS Core-Motion-Manager.
//
// Aggregiert CMDeviceMotion (userAcceleration/rotationRate/attitude),
// CMPedometer (Schritte/Kadenz) und optional CMMotionActivityManager
// (Bewegungszustand: stationary/walking/running/automotive/unknown + Confidence)
// zu einem gedrosselten, aggregierten Sample für die Fusion-Engine auf der
// JS-Seite. KEIN Ersatz für GPS, KEIN Dead-Reckoning per doppelter
// Beschleunigungsintegration (IMU-Drift wäre nach Sekunden bereits unbrauchbar).
// Läuft ausschliesslich während einer aktiven Fährte — start()/stop() werden
// explizit vom Expo-Modul gesteuert, kein Hintergrundbetrieb sonst.
//
// Interne Sample-Rate ~20 Hz (deviceMotionUpdateInterval) — an JS gehen nur
// aggregierte Werte je Emit-Fenster (Default 250 ms = 4 Hz), keine 100-Hz-
// Rohdatenflut über die Bridge (Akku/CPU, Punkt 3 des Auftrags).
final class AnyvoMotionManager {
  private let motionManager = CMMotionManager()
  private let pedometer = CMPedometer()
  private var activityManager: CMMotionActivityManager?

  // Emit-Closures (vom Module gesetzt) — dasselbe Muster wie
  // AnyvoPrecisionLocationManager.
  var onSample: (([String: Any]) -> Void)?
  var onError: ((String, String) -> Void)?

  private var running = false
  private var emitIntervalS: Double = 0.25

  // Aggregations-Fenster seit dem letzten Emit.
  private var windowAccelSamples: [Double] = []
  private var windowRotationSamples: [Double] = []
  private var firstYawInWindow: Double?
  private var lastYaw: Double?

  private var lastEmittedStepTotal = 0
  private var currentStepTotal = 0
  private var currentCadence: Double?
  private var lastActivity: CMMotionActivity?
  private var pedometerAuthDenied = false

  private var emitTimer: Timer?

  // MARK: - Start / Stop

  func start(emitIntervalMs: Int) {
    guard !running else { return }
    running = true
    emitIntervalS = max(0.1, Double(emitIntervalMs) / 1000.0)
    resetWindow()

    startDeviceMotion()
    startPedometer()
    startActivity()

    DispatchQueue.main.async { [weak self] in
      guard let self = self, self.running else { return }
      let timer = Timer(timeInterval: self.emitIntervalS, repeats: true) { [weak self] _ in
        self?.emitAggregatedSample()
      }
      RunLoop.main.add(timer, forMode: .common)
      self.emitTimer = timer
    }
  }

  func stop() {
    guard running else { return }
    running = false
    motionManager.stopDeviceMotionUpdates()
    pedometer.stopUpdates()
    activityManager?.stopActivityUpdates()
    activityManager = nil
    DispatchQueue.main.async { [weak self] in
      self?.emitTimer?.invalidate()
      self?.emitTimer = nil
    }
    resetWindow()
    lastEmittedStepTotal = 0
    currentStepTotal = 0
    currentCadence = nil
    lastActivity = nil
    pedometerAuthDenied = false
  }

  // MARK: - Device Motion (Beschleunigung/Rotation/Attitude)

  private func startDeviceMotion() {
    guard motionManager.isDeviceMotionAvailable else {
      onError?("MOTION_DEVICE_MOTION_UNAVAILABLE", "Bewegungssensoren auf diesem Gerät nicht verfügbar.")
      return
    }
    motionManager.deviceMotionUpdateInterval = 1.0 / 20.0
    motionManager.startDeviceMotionUpdates(to: OperationQueue.current ?? OperationQueue.main) { [weak self] motion, _ in
      guard let self = self, let motion = motion else { return }
      let a = motion.userAcceleration
      let r = motion.rotationRate
      let accelMag = (a.x * a.x + a.y * a.y + a.z * a.z).squareRoot()
      let rotMag = (r.x * r.x + r.y * r.y + r.z * r.z).squareRoot()
      self.windowAccelSamples.append(accelMag)
      self.windowRotationSamples.append(rotMag)
      let yawDeg = motion.attitude.yaw * 180.0 / Double.pi
      if self.firstYawInWindow == nil { self.firstYawInWindow = yawDeg }
      self.lastYaw = yawDeg
    }
  }

  // MARK: - Pedometer (Schritte/Kadenz)

  private func startPedometer() {
    guard CMPedometer.isStepCountingAvailable() else { return }
    pedometer.startUpdates(from: Date()) { [weak self] data, error in
      guard let self = self else { return }
      if error != nil {
        // Berechtigung verweigert/eingeschränkt oder anderer Pedometer-Fehler —
        // Schrittdaten bleiben dann einfach leer. Kein Crash, GPS läuft unberührt weiter.
        self.pedometerAuthDenied = true
        return
      }
      guard let data = data else { return }
      self.currentStepTotal = data.numberOfSteps.intValue
      if let cadence = data.currentCadence {
        self.currentCadence = cadence.doubleValue * 60.0   // Schritte/s → Schritte/min
      }
    }
  }

  // MARK: - Motion Activity (Bewegungszustand)

  private func startActivity() {
    guard CMMotionActivityManager.isActivityAvailable() else { return }
    let manager = CMMotionActivityManager()
    activityManager = manager
    manager.startActivityUpdates(to: OperationQueue.main) { [weak self] activity in
      guard let self = self, let activity = activity else { return }
      self.lastActivity = activity
    }
  }

  // MARK: - Aggregation / Emit

  private func resetWindow() {
    windowAccelSamples = []
    windowRotationSamples = []
    firstYawInWindow = nil
    lastYaw = nil
  }

  private func emitAggregatedSample() {
    guard running else { return }
    let now = Date().timeIntervalSince1970 * 1000

    let accelMag = windowAccelSamples.isEmpty ? 0 : windowAccelSamples.reduce(0, +) / Double(windowAccelSamples.count)
    let rotMag = windowRotationSamples.isEmpty ? 0 : windowRotationSamples.reduce(0, +) / Double(windowRotationSamples.count)
    var headingDelta = 0.0
    if let first = firstYawInWindow, let last = lastYaw {
      var d = last - first
      // Kürzeste Winkeldifferenz (Wrap um ±180°) — kein Sprung bei -179°→+179°.
      while d > 180 { d -= 360 }
      while d < -180 { d += 360 }
      headingDelta = d
    }

    let stepDelta = max(0, currentStepTotal - lastEmittedStepTotal)
    lastEmittedStepTotal = currentStepTotal

    let (state, activityConfidence) = movementState(accelMag: accelMag)

    // Grober, konservativer Confidence-Grundwert je nach verfügbaren Signalen —
    // die eigentliche, gewichtete Fusion-Bewertung passiert auf JS-Seite
    // (trackFusionEngine.ts). Hier nur: "wie viele Sensor-Quellen liefern gerade
    // überhaupt Daten".
    var confidence = 0.6
    if !pedometerAuthDenied && CMPedometer.isStepCountingAvailable() { confidence += 0.2 }
    if lastActivity != nil { confidence += 0.2 }
    confidence = min(1.0, confidence)

    onSample?([
      "timestamp": now,
      "accelerationMagnitude": accelMag,
      "rotationMagnitude": rotMag,
      "headingDelta": headingDelta,
      "stepDelta": stepDelta,
      "cadence": currentCadence ?? NSNull(),
      "movementState": state,
      "motionConfidence": confidence,
      "activityConfidence": activityConfidence,
    ])

    resetWindow()
  }

  // Fallback-Heuristik, falls CMMotionActivityManager nicht verfügbar/verweigert:
  // grobe Klassifikation allein aus der gemittelten Beschleunigungsmagnitude.
  // Nur ein Zusatzsignal — niemals harte Wahrheit (siehe Fusion-Engine JS-seitig).
  private func movementState(accelMag: Double) -> (String, String) {
    if let activity = lastActivity {
      let conf: String
      switch activity.confidence {
      case .low: conf = "low"
      case .medium: conf = "medium"
      case .high: conf = "high"
      @unknown default: conf = "low"
      }
      if activity.stationary { return ("stationary", conf) }
      if activity.running { return ("running", conf) }
      if activity.walking { return ("walking", conf) }
      if activity.automotive { return ("automotive", conf) }
      return ("unknown", conf)
    }
    // Ohne Activity-Manager: grobe Schwellen (empirisch konservativ, kein
    // Ersatz für echte Klassifikation — deshalb activityConfidence "low").
    if accelMag < 0.03 { return ("stationary", "low") }
    if accelMag < 0.25 { return ("walking", "low") }
    return ("running", "low")
  }

  func buildStatus() -> [String: Any] {
    return [
      "deviceMotionAvailable": motionManager.isDeviceMotionAvailable,
      "stepCountingAvailable": CMPedometer.isStepCountingAvailable(),
      "activityAvailable": CMMotionActivityManager.isActivityAvailable(),
      "pedometerAuthorized": !pedometerAuthDenied,
      "running": running,
    ]
  }
}
