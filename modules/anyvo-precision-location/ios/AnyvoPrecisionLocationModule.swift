import ExpoModulesCore
import CoreLocation

// ANYVO Precision Location — iOS (Phase 3).
//
// Dünne Expo-Modul-Schicht über AnyvoPrecisionLocationManager. iOS bietet keine
// öffentliche Raw-GNSS-API → isRawGnssSupported().supported = false. Stattdessen:
// maximale Core-Location-Präzision, Heading/Kompass, Precise-Location-Status und
// Temporary-Full-Accuracy.
public class AnyvoPrecisionLocationModule: Module {
  private lazy var locationManager = AnyvoPrecisionLocationManager()

  public func definition() -> ModuleDefinition {
    Name("AnyvoPrecisionLocation")

    Events(
      "onPrecisionLocation", "onProviderStatus",
      "onGnssStatus", "onGnssMeasurement", "onHeading", "onTrackingError"
    )

    OnCreate {
      self.locationManager.onLocation = { [weak self] payload in
        self?.sendEvent("onPrecisionLocation", payload)
      }
      self.locationManager.onHeading = { [weak self] payload in
        self?.sendEvent("onHeading", payload)
      }
      self.locationManager.onStatus = { [weak self] payload in
        self?.sendEvent("onProviderStatus", payload)
      }
      self.locationManager.onError = { [weak self] code, message, recoverable in
        self?.sendEvent("onTrackingError", [
          "code": code, "message": message, "platform": "ios", "recoverable": recoverable
        ])
      }
    }

    Function("isRawGnssSupported") { () -> [String: Any] in
      // iOS hat keine öffentliche Raw-GNSS-API.
      return [
        "supported": false,
        "reason": "RAW_GNSS_IOS_UNAVAILABLE",
        "androidApiLevel": 0,
        "gpsFeatureAvailable": false,
        "providerEnabled": CLLocationManager.locationServicesEnabled()
      ]
    }

    AsyncFunction("getProviderStatus") { () -> [String: Any] in
      return self.locationManager.buildStatus()
    }

    AsyncFunction("startPrecisionTracking") { (options: [String: Any]) in
      let mode = options["mode"] as? String ?? "tracking_dog_sport"
      let enableHeading = options["enableHeading"] as? Bool ?? false
      let allowBackground = options["allowBackground"] as? Bool ?? false
      // Root-Cause-Fix (Build 42): `intervalMs` wurde hier bisher nie gelesen —
      // JS erwartet per Vertrag (PrecisionTrackingOptions, Default 1000) eine
      // Drosselung des Emits, die native Seite lieferte bislang jeden
      // CLLocationManager-Fix ungedrosselt durch. Numeric-Typing defensiv (JS
      // liefert i. d. R. eine Zahl, aber NSNumber-Brücken variieren je nach Pfad).
      let intervalMs = (options["intervalMs"] as? NSNumber)?.doubleValue
        ?? (options["intervalMs"] as? Double)
        ?? 1000
      self.locationManager.start(mode: mode, enableHeading: enableHeading, allowBackground: allowBackground, intervalMs: intervalMs)
    }

    AsyncFunction("stopPrecisionTracking") {
      self.locationManager.stop()
    }

    AsyncFunction("requestTemporaryFullAccuracy") { (purposeKey: String?, promise: Promise) in
      let key = purposeKey ?? "TrackingDogSportPrecision"
      self.locationManager.requestTemporaryFullAccuracy(purposeKey: key) { result in
        promise.resolve(result)
      }
    }

    OnDestroy {
      self.locationManager.stop()
    }
  }
}
