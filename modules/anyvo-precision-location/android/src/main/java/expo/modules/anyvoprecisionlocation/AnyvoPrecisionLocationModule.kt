package expo.modules.anyvoprecisionlocation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.GnssMeasurement
import android.location.GnssMeasurementsEvent
import android.location.GnssStatus
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// ANYVO Precision Location — Android.
//
// Phase 1: einfache High-Accuracy-Location über den System-LocationManager.
// Phase 2: zusätzlich GNSS-Status + Raw-GNSS-Measurements (optional, robust).
//
// Hinweis Mindest-API: Expo SDK 54 setzt minSdk 24 → GnssStatus.Callback und
// GnssMeasurementsEvent.Callback (beide API 24) sind immer vorhanden. Nur die
// GnssCapabilities-Prüfung (API 30) wird zusätzlich mit SDK_INT abgesichert.
class AnyvoPrecisionLocationModule : Module() {
  private companion object {
    // Max. 1 Measurement-Batch pro Sekunde an JS (GNSS liefert ~1 Hz).
    const val MEASUREMENT_MIN_INTERVAL_MS = 1000L
  }

  private var locationManager: LocationManager? = null
  private var locationListener: LocationListener? = null

  // Raw-GNSS (Phase 2)
  private var gnssStatusCallback: GnssStatus.Callback? = null
  private var gnssMeasurementsCallback: GnssMeasurementsEvent.Callback? = null
  private var gnssThread: HandlerThread? = null
  private var gnssHandler: Handler? = null
  private var rawGnssActive = false
  private var lastMeasurementEmitMs = 0L

  // Letzter GNSS-Status (für getProviderStatus)
  private var satelliteCount: Int? = null
  private var usedInFixCount: Int? = null
  private var averageCn0DbHz: Double? = null
  private var maxCn0DbHz: Double? = null
  private var lastGnssStatusAt: Long? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("AnyvoPrecisionLocation")

    Events(
      "onPrecisionLocation", "onProviderStatus",
      "onGnssStatus", "onGnssMeasurement", "onHeading", "onTrackingError"
    )

    Function("isRawGnssSupported") {
      computeSupport()
    }

    AsyncFunction("getProviderStatus") { promise: Promise ->
      promise.resolve(buildStatus())
    }

    AsyncFunction("startPrecisionTracking") { options: Map<String, Any?>, promise: Promise ->
      try {
        startUpdates(options)
        promise.resolve(null)
      } catch (e: SecurityException) {
        promise.reject("E_NO_PERMISSION", "Standortberechtigung fehlt", e)
      } catch (e: Exception) {
        emitError("UNKNOWN_NATIVE_ERROR", e.message ?: "Start fehlgeschlagen", true)
        promise.reject("E_START_FAILED", e.message ?: "Start fehlgeschlagen", e)
      }
    }

    AsyncFunction("stopPrecisionTracking") { promise: Promise ->
      stopUpdates()
      promise.resolve(null)
    }

    // iOS-spezifisches Feature (Reduced Accuracy). Auf Android nicht zutreffend
    // → graceful: nicht verfügbar. Vorhanden, damit die TS-Bridge plattform-
    // übergreifend dieselbe Funktion aufrufen kann.
    AsyncFunction("requestTemporaryFullAccuracy") { _: String?, promise: Promise ->
      promise.resolve(
        mapOf(
          "granted" to false,
          "preciseLocationEnabled" to false,
          "error" to "TEMPORARY_FULL_ACCURACY_NOT_AVAILABLE"
        )
      )
    }

    OnDestroy { stopUpdates() }
  }

  // ── Helfer ───────────────────────────────────────────────────────
  private fun manager(): LocationManager {
    val m = locationManager ?: (context.getSystemService(Context.LOCATION_SERVICE) as LocationManager)
    locationManager = m
    return m
  }

  private fun hasPermission(): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
      PackageManager.PERMISSION_GRANTED

  private fun locationPermissionString(): String = if (hasPermission()) "granted" else "denied"

  private fun providerEnabled(provider: String): Boolean =
    try { manager().isProviderEnabled(provider) } catch (e: Exception) { false }

  private fun constellationName(type: Int): String = when (type) {
    GnssStatus.CONSTELLATION_GPS -> "GPS"
    GnssStatus.CONSTELLATION_GLONASS -> "GLONASS"
    GnssStatus.CONSTELLATION_GALILEO -> "GALILEO"
    GnssStatus.CONSTELLATION_BEIDOU -> "BEIDOU"
    GnssStatus.CONSTELLATION_QZSS -> "QZSS"
    GnssStatus.CONSTELLATION_SBAS -> "SBAS"
    else -> "UNKNOWN"
  }

  // Raw-GNSS-Capability (Spec-Shape RawGnssSupportStatus).
  private fun computeSupport(): Map<String, Any?> {
    val api = Build.VERSION.SDK_INT
    val gpsFeature = context.packageManager.hasSystemFeature(PackageManager.FEATURE_LOCATION_GPS)
    val providerOn = providerEnabled(LocationManager.GPS_PROVIDER)
    val permission = hasPermission()

    var supported: Boolean
    var reason: String
    when {
      api < Build.VERSION_CODES.N -> { supported = false; reason = "ANDROID_VERSION_TOO_OLD" }
      !gpsFeature -> { supported = false; reason = "GPS_FEATURE_MISSING" }
      !permission -> { supported = false; reason = "LOCATION_PERMISSION_MISSING" }
      !providerOn -> { supported = false; reason = "LOCATION_PROVIDER_DISABLED" }
      else -> { supported = true; reason = "SUPPORTED" }
    }
    // Ab API 30 lässt sich die Measurement-Fähigkeit direkt abfragen.
    if (supported && api >= Build.VERSION_CODES.R) {
      try {
        if (!manager().gnssCapabilities.hasMeasurements()) {
          supported = false; reason = "GPS_FEATURE_MISSING"
        }
      } catch (e: Exception) { /* unkritisch: Laufzeit-Status entscheidet */ }
    }
    return mapOf(
      "supported" to supported,
      "reason" to reason,
      "androidApiLevel" to api,
      "gpsFeatureAvailable" to gpsFeature,
      "providerEnabled" to providerOn
    )
  }

  private fun buildStatus(): Map<String, Any?> {
    val gpsEnabled = providerEnabled(LocationManager.GPS_PROVIDER)
    val networkEnabled = providerEnabled(LocationManager.NETWORK_PROVIDER)
    val support = computeSupport()
    return mapOf(
      // Phase 1 (Rückwärtskompatibilität)
      "available" to (gpsEnabled && hasPermission()),
      "gpsEnabled" to gpsEnabled,
      "provider" to LocationManager.GPS_PROVIDER,
      "source" to "native",
      // Phase 2
      "platform" to "android",
      "locationPermission" to locationPermissionString(),
      "gpsProviderEnabled" to gpsEnabled,
      "networkProviderEnabled" to networkEnabled,
      "rawGnssSupported" to (support["supported"] as Boolean),
      "rawGnssActive" to rawGnssActive,
      "satelliteCount" to satelliteCount,
      "usedInFixCount" to usedInFixCount,
      "averageCn0DbHz" to averageCn0DbHz,
      "lastGnssStatusAt" to lastGnssStatusAt
    )
  }

  // ── Start/Stop ─────────────────────────────────────────────────
  private fun startUpdates(options: Map<String, Any?>) {
    if (!hasPermission()) {
      emitError("LOCATION_PERMISSION_MISSING", "Standortberechtigung fehlt", false)
      throw SecurityException("ACCESS_FINE_LOCATION not granted")
    }
    val minTime = (options["intervalMs"] as? Number)?.toLong() ?: 1000L
    stopUpdates()   // verhindert doppelte Listener bei Mehrfach-Start

    val l = object : LocationListener {
      override fun onLocationChanged(location: Location) = emitLocation(location)
      override fun onProviderEnabled(provider: String) { emitProviderStatus() }
      override fun onProviderDisabled(provider: String) { emitProviderStatus() }
      @Deprecated("Deprecated in Java")
      override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    }
    locationListener = l
    manager().requestLocationUpdates(LocationManager.GPS_PROVIDER, minTime, 0f, l, Looper.getMainLooper())

    val enableRaw = (options["enableRawGnssAndroid"] as? Boolean) ?: false
    if (enableRaw) startRawGnss()

    emitProviderStatus()
  }

  private fun startRawGnss() {
    val support = computeSupport()
    if (support["supported"] != true) {
      rawGnssActive = false
      emitError("RAW_GNSS_NOT_SUPPORTED", "Raw GNSS nicht verfügbar: ${support["reason"]}", true)
      emitProviderStatus()
      return
    }
    try {
      ensureGnssHandler()
      val mgr = manager()
      val handler = gnssHandler ?: throw IllegalStateException("GNSS-Handler fehlt")

      val statusCb = object : GnssStatus.Callback() {
        override fun onSatelliteStatusChanged(status: GnssStatus) = handleGnssStatus(status)
      }
      gnssStatusCallback = statusCb
      mgr.registerGnssStatusCallback(statusCb, handler)

      val measCb = object : GnssMeasurementsEvent.Callback() {
        override fun onGnssMeasurementsReceived(event: GnssMeasurementsEvent) = handleMeasurements(event)
        override fun onStatusChanged(status: Int) = handleMeasurementStatus(status)
      }
      gnssMeasurementsCallback = measCb
      val ok = mgr.registerGnssMeasurementsCallback(measCb, handler)
      rawGnssActive = ok
      if (!ok) emitError("RAW_GNSS_NOT_SUPPORTED", "registerGnssMeasurementsCallback returned false", true)
    } catch (e: SecurityException) {
      rawGnssActive = false
      emitError("LOCATION_PERMISSION_MISSING", e.message ?: "Permission", false)
    } catch (e: Exception) {
      rawGnssActive = false
      emitError("GNSS_CALLBACK_FAILED", e.message ?: "GNSS callback failed", true)
    }
  }

  private fun ensureGnssHandler() {
    if (gnssThread == null) {
      val t = HandlerThread("anyvo-gnss")
      t.start()
      gnssThread = t
      gnssHandler = Handler(t.looper)
    }
  }

  private fun stopUpdates() {
    locationListener?.let { try { manager().removeUpdates(it) } catch (e: Exception) { /* ignore */ } }
    locationListener = null

    gnssStatusCallback?.let { try { manager().unregisterGnssStatusCallback(it) } catch (e: Exception) { /* ignore */ } }
    gnssStatusCallback = null
    gnssMeasurementsCallback?.let { try { manager().unregisterGnssMeasurementsCallback(it) } catch (e: Exception) { /* ignore */ } }
    gnssMeasurementsCallback = null

    gnssThread?.let { try { it.quitSafely() } catch (e: Exception) { /* ignore */ } }
    gnssThread = null
    gnssHandler = null

    rawGnssActive = false
    lastMeasurementEmitMs = 0L
    satelliteCount = null; usedInFixCount = null
    averageCn0DbHz = null; maxCn0DbHz = null; lastGnssStatusAt = null
  }

  // ── GNSS-Handler ───────────────────────────────────────────────
  private fun handleMeasurementStatus(status: Int) {
    when (status) {
      GnssMeasurementsEvent.Callback.STATUS_READY -> rawGnssActive = true
      GnssMeasurementsEvent.Callback.STATUS_NOT_SUPPORTED -> {
        rawGnssActive = false
        emitError("RAW_GNSS_NOT_SUPPORTED", "GNSS measurements not supported", true)
      }
      GnssMeasurementsEvent.Callback.STATUS_LOCATION_DISABLED -> {
        rawGnssActive = false
        emitError("GPS_PROVIDER_DISABLED", "Location disabled", true)
      }
      else -> {}
    }
    emitProviderStatus()
  }

  private fun handleGnssStatus(status: GnssStatus) {
    val count = status.satelliteCount
    var used = 0
    var cn0Sum = 0.0
    var cn0Count = 0
    var cn0Max = Double.NEGATIVE_INFINITY
    for (i in 0 until count) {
      if (status.usedInFix(i)) used++
      if (status.hasCn0DbHz(i)) {
        val v = status.getCn0DbHz(i).toDouble()
        cn0Sum += v; cn0Count++
        if (v > cn0Max) cn0Max = v
      }
    }
    val avg = if (cn0Count > 0) cn0Sum / cn0Count else null
    val max = if (cn0Count > 0) cn0Max else null
    val now = System.currentTimeMillis()

    satelliteCount = count
    usedInFixCount = used
    averageCn0DbHz = avg
    maxCn0DbHz = max
    lastGnssStatusAt = now

    sendEvent(
      "onGnssStatus",
      mapOf(
        "satelliteCount" to count,
        "usedInFixCount" to used,
        "averageCn0DbHz" to avg,
        "maxCn0DbHz" to max,
        "hasRawMeasurements" to rawGnssActive,
        "timestamp" to now
      )
    )
  }

  // Entscheidung: BATCH-Variante. GnssMeasurementsEvent liefert pro Epoche (~1 Hz)
  // bereits ALLE Satellitenmessungen gebündelt → wir senden EIN Event je Callback
  // statt eines pro Satellit (das wären 20–40×/s). Zusätzlicher Throttle drosselt
  // schnellere Geräte auf max. 1 Batch/Sekunde, damit JS nicht ruckelt.
  private fun handleMeasurements(event: GnssMeasurementsEvent) {
    val now = System.currentTimeMillis()
    if (now - lastMeasurementEmitMs < MEASUREMENT_MIN_INTERVAL_MS) return
    lastMeasurementEmitMs = now

    val list = event.measurements.map { m -> measurementToMap(m, now) }
    sendEvent(
      "onGnssMeasurement",
      mapOf(
        "timestamp" to now,
        "measurements" to list
      )
    )
  }

  private fun measurementToMap(m: GnssMeasurement, now: Long): Map<String, Any?> {
    val carrier: Double? =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && m.hasCarrierFrequencyHz())
        m.carrierFrequencyHz.toDouble() else null
    return mapOf(
      "constellationType" to constellationName(m.constellationType),
      "svid" to m.svid,
      "cn0DbHz" to m.cn0DbHz,
      "carrierFrequencyHz" to carrier,
      "pseudorangeRateMetersPerSecond" to m.pseudorangeRateMetersPerSecond,
      "pseudorangeRateUncertaintyMetersPerSecond" to m.pseudorangeRateUncertaintyMetersPerSecond,
      "accumulatedDeltaRangeMeters" to m.accumulatedDeltaRangeMeters,
      "accumulatedDeltaRangeUncertaintyMeters" to m.accumulatedDeltaRangeUncertaintyMeters,
      "receivedSvTimeNanos" to m.receivedSvTimeNanos,
      "receivedSvTimeUncertaintyNanos" to m.receivedSvTimeUncertaintyNanos,
      "timeOffsetNanos" to m.timeOffsetNanos,
      "state" to m.state,
      "multipathIndicator" to m.multipathIndicator,
      "timestamp" to now
    )
  }

  // ── Event-Emitter ──────────────────────────────────────────────
  private fun emitLocation(location: Location) {
    sendEvent(
      "onPrecisionLocation",
      mapOf(
        "latitude" to location.latitude,
        "longitude" to location.longitude,
        "accuracy" to if (location.hasAccuracy()) location.accuracy.toDouble() else null,
        "altitude" to if (location.hasAltitude()) location.altitude else null,
        "speed" to if (location.hasSpeed()) location.speed.toDouble() else null,
        "bearing" to if (location.hasBearing()) location.bearing.toDouble() else null,
        "timestamp" to location.time,
        "provider" to (location.provider ?: LocationManager.GPS_PROVIDER),
        "source" to "native"
      )
    )
  }

  private fun emitProviderStatus() = sendEvent("onProviderStatus", buildStatus())

  private fun emitError(code: String, message: String, recoverable: Boolean) {
    sendEvent(
      "onTrackingError",
      mapOf(
        "code" to code,
        "message" to message,
        "platform" to "android",
        "recoverable" to recoverable
      )
    )
  }
}
