import ExpoModulesCore
import CoreMotion

// ANYVO Motion — Expo-Modul-Schicht über AnyvoMotionManager.
//
// Core Motion ist ausschliesslich ein Zusatzsignal zur GPS-Fährtenaufzeichnung
// (Plausibilisierung/Outlier-Erkennung/Stillstand/Start-Acquisition) — niemals
// Ersatz für Core Location. Motion Permission (NSMotionUsageDescription) gilt
// nur für Pedometer/Activity; bei denied/restricted/unavailable degradiert die
// Manager-Klasse graziös (keine Exceptions), die JS-Seite fällt dann auf
// fusionMode = 'gps_only' zurück (kein Blocker für die Fährte).
public class AnyvoMotionModule: Module {
  private lazy var motionManagerImpl = AnyvoMotionManager()

  public func definition() -> ModuleDefinition {
    Name("AnyvoMotion")

    Events("onMotionSample", "onMotionError")

    OnCreate {
      self.motionManagerImpl.onSample = { [weak self] payload in
        self?.sendEvent("onMotionSample", payload)
      }
      self.motionManagerImpl.onError = { [weak self] code, message in
        self?.sendEvent("onMotionError", ["code": code, "message": message])
      }
    }

    Function("isAvailable") { () -> Bool in
      return CMMotionManager().isDeviceMotionAvailable
    }

    AsyncFunction("getStatus") { () -> [String: Any] in
      return self.motionManagerImpl.buildStatus()
    }

    AsyncFunction("startMotionUpdates") { (options: [String: Any]) in
      let emitIntervalMs = options["emitIntervalMs"] as? Int ?? 250
      self.motionManagerImpl.start(emitIntervalMs: emitIntervalMs)
    }

    AsyncFunction("stopMotionUpdates") {
      self.motionManagerImpl.stop()
    }

    OnDestroy {
      self.motionManagerImpl.stop()
    }
  }
}
