package expo.modules.anyvoprecisionlocation

import android.Manifest
import android.app.ActivityManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import androidx.core.content.ContextCompat

/** Read-only application snapshot. A running service does not prove fix delivery. */
internal object AndroidPlatformDiagnostics {
  private fun granted(context: Context, permission: String): Boolean =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

  private fun <T> observe(block: () -> T): T? = try { block() } catch (_: Exception) { null }

  @Suppress("DEPRECATION")
  fun snapshot(context: Context): Map<String, Any?> {
    val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
    val activity = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
    val locationServices = observe {
      activity?.getRunningServices(Int.MAX_VALUE)?.filter {
        it.service.packageName == context.packageName &&
          it.service.className == "expo.modules.location.services.LocationTaskService"
      }
    }
    return mapOf(
      "schemaVersion" to 1,
      "scope" to "application_snapshot",
      "androidApiLevel" to Build.VERSION.SDK_INT,
      "observedElapsedMs" to SystemClock.elapsedRealtime(),
      "fineLocationGranted" to granted(context, Manifest.permission.ACCESS_FINE_LOCATION),
      "coarseLocationGranted" to granted(context, Manifest.permission.ACCESS_COARSE_LOCATION),
      "backgroundLocationGranted" to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
        granted(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) else null,
      "screenInteractive" to observe { power?.isInteractive },
      "powerSaveMode" to observe { power?.isPowerSaveMode },
      "deviceIdleMode" to observe { power?.isDeviceIdleMode },
      "batteryOptimizationExempt" to observe { power?.isIgnoringBatteryOptimizations(context.packageName) },
      "locationServiceCount" to locationServices?.size,
      "locationForegroundServiceObserved" to locationServices?.any { it.foreground },
      // No OEM kill attribution or task/session ownership is inferred from a snapshot.
      "serviceLifecycleAvailable" to false,
      "taskAcknowledgementAvailable" to false
    )
  }
}
