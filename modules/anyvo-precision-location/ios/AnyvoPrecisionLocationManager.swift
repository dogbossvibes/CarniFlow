import Foundation
import CoreLocation

// ANYVO Precision Location — iOS Core-Location-Manager (Phase 3).
//
// Kapselt CLLocationManager inkl. Modus-Tuning, Heading/Kompass, Precise-
// Location-Erkennung, Temporary-Full-Accuracy und optionalem Background.
// Die Emit-Closures werden vom Expo-Modul gesetzt → sauberes sendEvent.
final class AnyvoPrecisionLocationManager: NSObject, CLLocationManagerDelegate {
  private let manager = CLLocationManager()

  // Emit-Closures (vom Module gesetzt)
  var onLocation: (([String: Any]) -> Void)?
  var onHeading:  (([String: Any]) -> Void)?
  var onStatus:   (([String: Any]) -> Void)?
  var onError:    ((String, String, Bool) -> Void)?

  private var lastLocationAt: Double?
  private var lastHeadingAt: Double?
  private var lastHeadingWarnAt: Double = 0
  private var headingEnabled = false
  private var backgroundAllowed = false
  private var running = false

  override init() {
    super.init()
    manager.delegate = self
  }

  // MARK: - Start / Stop

  func start(mode: String, enableHeading: Bool, allowBackground: Bool) {
    configure(mode: mode)
    headingEnabled = enableHeading
    backgroundAllowed = allowBackground

    // Background nur auf ausdrücklichen Wunsch — sonst keine unnötige
    // Hintergrund-Aktivierung (und keine Always-Berechtigung erzwingen).
    if allowBackground {
      manager.allowsBackgroundLocationUpdates = true
      manager.showsBackgroundLocationIndicator = true
    } else {
      manager.allowsBackgroundLocationUpdates = false
    }

    // Berechtigung erst im Tracking-Modus anfordern (nicht beim App-Start),
    // und nur „When In Use" — Always wird nicht erzwungen.
    manager.requestWhenInUseAuthorization()
    manager.startUpdatingLocation()

    if enableHeading {
      if CLLocationManager.headingAvailable() {
        manager.headingFilter = 2 // Grad: ruhige, aber reaktionsschnelle Updates
        manager.startUpdatingHeading()
      } else {
        onError?("IOS_HEADING_UNAVAILABLE", "Kompass auf diesem Gerät nicht verfügbar.", true)
      }
    }

    running = true
    emitStatus()
  }

  func stop() {
    manager.stopUpdatingLocation()
    manager.stopUpdatingHeading()
    manager.allowsBackgroundLocationUpdates = false
    running = false
    headingEnabled = false
    lastHeadingWarnAt = 0
  }

  // MARK: - Modus-Konfiguration

  private func configure(mode: String) {
    switch mode {
    case "walking":
      // Spazier-Modus: hohe (nicht maximale) Genauigkeit spart Akku; ein
      // distanceFilter von ~2 m unterdrückt Stand-Jitter beim Gehen.
      manager.desiredAccuracy = kCLLocationAccuracyBest
      manager.distanceFilter = 2
      manager.activityType = .fitness
      // Beim Spazieren darf iOS bei Stillstand kurz pausieren (Akku) — die
      // Spur ist hier weniger lückenkritisch als beim Fährtenlegen.
      manager.pausesLocationUpdatesAutomatically = true

    case "debug":
      manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
      manager.distanceFilter = kCLDistanceFilterNone
      manager.activityType = .otherNavigation
      manager.pausesLocationUpdatesAutomatically = false

    default: // "tracking_dog_sport"
      // BestForNavigation: höchste Präzision (iOS nutzt zusätzliche Sensor-
      // fusion). Ideal für genaues, langsames Fährtenlegen.
      manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
      // distanceFilter = None: JEDE Bewegung melden — beim langsamen Legen
      // sind selbst kleine Schritte relevant, nichts soll wegfallen.
      manager.distanceFilter = kCLDistanceFilterNone
      manager.activityType = .fitness
      // pausesLocationUpdatesAutomatically = false: iOS darf eine aktive
      // Fährtenaufnahme NICHT automatisch pausieren — sonst entstehen Lücken
      // in der Spur, wenn der Hundeführer kurz stehen bleibt.
      manager.pausesLocationUpdatesAutomatically = false
    }
  }

  // MARK: - Temporary Full Accuracy

  func requestTemporaryFullAccuracy(purposeKey: String, completion: @escaping ([String: Any]) -> Void) {
    if #available(iOS 14.0, *) {
      manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: purposeKey) { [weak self] error in
        let precise = self?.isPrecise() ?? false
        var result: [String: Any] = ["granted": precise, "preciseLocationEnabled": precise]
        if let error = error {
          result["error"] = error.localizedDescription
        } else {
          result["error"] = NSNull()
        }
        completion(result)
        self?.emitStatus()
      }
    } else {
      // Vor iOS 14 gibt es kein Reduced-Accuracy-Konzept → graceful.
      completion([
        "granted": false,
        "preciseLocationEnabled": false,
        "error": "TEMPORARY_FULL_ACCURACY_NOT_AVAILABLE"
      ])
    }
  }

  // MARK: - Status

  func buildStatus() -> [String: Any] {
    let enabled = CLLocationManager.locationServicesEnabled()
    let authStr = authStatusString()
    let authorized = authStr == "authorizedAlways" || authStr == "authorizedWhenInUse"
    let precise = isPrecise()
    return [
      // Phase 3 (iOS)
      "platform": "ios",
      "authorizationStatus": authStr,
      "accuracyAuthorization": accuracyAuthString(),
      "preciseLocationEnabled": precise,
      "locationServicesEnabled": enabled,
      "headingAvailable": CLLocationManager.headingAvailable(),
      "backgroundAllowed": backgroundAllowed,
      "rawGnssAvailable": false,
      "rawGnssSupported": false,
      "lastLocationAt": lastLocationAt ?? NSNull(),
      "lastHeadingAt": lastHeadingAt ?? NSNull(),
      // Phase 1/2-Kompatibilität
      "available": authorized && enabled,
      "gpsEnabled": enabled,
      "provider": "ios_core_location",
      "source": "native",
      "locationPermission": authorized ? "granted" : (authStr == "notDetermined" ? "unknown" : "denied"),
      "gpsProviderEnabled": enabled,
      "networkProviderEnabled": false,
      "rawGnssActive": false,
      "satelliteCount": NSNull(),
      "usedInFixCount": NSNull(),
      "averageCn0DbHz": NSNull(),
      "lastGnssStatusAt": NSNull()
    ]
  }

  private func emitStatus() { onStatus?(buildStatus()) }

  private func isPrecise() -> Bool {
    if #available(iOS 14.0, *) {
      return manager.accuracyAuthorization == .fullAccuracy
    }
    return true // vor iOS 14: kein Reduced-Accuracy-Konzept
  }

  private func authStatusString() -> String {
    let s: CLAuthorizationStatus
    if #available(iOS 14.0, *) { s = manager.authorizationStatus } else { s = CLLocationManager.authorizationStatus() }
    switch s {
    case .notDetermined: return "notDetermined"
    case .restricted: return "restricted"
    case .denied: return "denied"
    case .authorizedAlways: return "authorizedAlways"
    case .authorizedWhenInUse: return "authorizedWhenInUse"
    @unknown default: return "unknown"
    }
  }

  private func accuracyAuthString() -> String {
    if #available(iOS 14.0, *) {
      switch manager.accuracyAuthorization {
      case .fullAccuracy: return "fullAccuracy"
      case .reducedAccuracy: return "reducedAccuracy"
      @unknown default: return "unknown"
      }
    }
    return "fullAccuracy"
  }

  private func qualityString(_ accuracy: Double) -> String {
    if accuracy < 0 { return "bad" }
    if accuracy <= 8 { return "excellent" }
    if accuracy <= 15 { return "good" }
    if accuracy <= 25 { return "poor" }
    return "bad"
  }

  // MARK: - CLLocationManagerDelegate

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let loc = locations.last else { return }
    let now = loc.timestamp.timeIntervalSince1970 * 1000
    lastLocationAt = now

    let hAcc = loc.horizontalAccuracy
    let accuracy: Any = hAcc >= 0 ? hAcc : NSNull()
    let quality = qualityString(hAcc)

    var isMocked = false
    if #available(iOS 15.0, *) {
      isMocked = loc.sourceInformation?.isSimulatedBySoftware ?? false
    }

    let heading: Any = loc.course >= 0 ? loc.course : NSNull()

    onLocation?([
      "latitude": loc.coordinate.latitude,
      "longitude": loc.coordinate.longitude,
      "altitude": loc.verticalAccuracy >= 0 ? loc.altitude : NSNull(),
      "accuracy": accuracy,
      "altitudeAccuracy": loc.verticalAccuracy >= 0 ? loc.verticalAccuracy : NSNull(),
      "speed": loc.speed >= 0 ? loc.speed : NSNull(),
      "speedAccuracy": loc.speedAccuracy >= 0 ? loc.speedAccuracy : NSNull(),
      "heading": heading,
      "bearing": heading, // Kompatibilität mit Phase 1/2 (Android nutzt bearing)
      "headingAccuracy": loc.courseAccuracy >= 0 ? loc.courseAccuracy : NSNull(),
      "timestamp": now,
      "provider": "ios_core_location",
      "source": "native",
      "quality": quality,
      "rawGnssAvailable": false,
      "isMocked": isMocked
    ])
  }

  func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
    let now = newHeading.timestamp.timeIntervalSince1970 * 1000
    lastHeadingAt = now

    let acc = newHeading.headingAccuracy
    let trueH = newHeading.trueHeading

    onHeading?([
      "trueHeading": trueH >= 0 ? trueH : NSNull(),       // < 0 = ungültig → null
      "magneticHeading": newHeading.magneticHeading,
      "headingAccuracy": acc >= 0 ? acc : NSNull(),        // < 0 = ungültig → null
      "x": newHeading.x,
      "y": newHeading.y,
      "z": newHeading.z,
      "timestamp": now,
      "platform": "ios"
    ])

    // Unzuverlässiger Kompass (ungültig oder grobe Genauigkeit) → Warnung,
    // aber gedrosselt (max. alle 5 s), damit keine Event-Flut entsteht.
    if (acc < 0 || acc > 20), now - lastHeadingWarnAt > 5000 {
      lastHeadingWarnAt = now
      onError?("IOS_HEADING_UNRELIABLE", "Kompass ungenau – bitte das Gerät in einer 8 bewegen.", true)
    }
  }

  // Keine System-Kalibrierungs-UI automatisch zeigen (stört die Aufnahme).
  func locationManagerShouldDisplayHeadingCalibration(_ manager: CLLocationManager) -> Bool {
    return false
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    emitStatus()
    let authStr = authStatusString()
    if authStr == "denied" || authStr == "restricted" {
      onError?("IOS_LOCATION_PERMISSION_DENIED", "Standortberechtigung verweigert.", false)
    }
    if #available(iOS 14.0, *), manager.accuracyAuthorization == .reducedAccuracy {
      onError?(
        "IOS_REDUCED_ACCURACY",
        "Präziser Standort ist deaktiviert. Für genaue Fährtenaufnahme bitte Präziser Standort aktivieren.",
        true
      )
    }
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    if let clErr = error as? CLError, clErr.code == .denied {
      if !CLLocationManager.locationServicesEnabled() {
        onError?("IOS_LOCATION_SERVICES_DISABLED", "Standortdienste sind ausgeschaltet.", true)
      } else {
        onError?("IOS_LOCATION_PERMISSION_DENIED", "Standortberechtigung verweigert.", false)
      }
      return
    }
    onError?("UNKNOWN_NATIVE_ERROR", error.localizedDescription, true)
  }
}
