package expo.modules.anyvodailywidget

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.exception.Exceptions

class AnyvoDailyWidgetModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("AnyvoDailyWidget")
    Function("isAvailable") { true }
    Function("beginSession") { ownerId: String? ->
      val ctx = context
      try { DailyWidgetStore.begin(ctx, ownerId) }
      finally { AnyvoDailyWidgetProvider.refresh(ctx) }
    }
    AsyncFunction("updateSnapshot") { token: String, sequence: Double, json: String ->
      val ctx = context
      if (!validSequence(sequence)) false else {
        val updated = DailyWidgetStore.update(ctx, token, sequence.toLong(), json)
        if (updated) AnyvoDailyWidgetProvider.refresh(ctx)
        updated
      }
    }
    AsyncFunction("updateAvailability") { token: String, sequence: Double, state: String ->
      val ctx = context
      if (!validSequence(sequence)) false else {
        val updated = DailyWidgetStore.availability(ctx, token, sequence.toLong(), state)
        if (updated) AnyvoDailyWidgetProvider.refresh(ctx)
        updated
      }
    }
  }
  private fun validSequence(value: Double) = value.isFinite() && value > 0 && value <= 9007199254740991.0 && value == kotlin.math.floor(value)
}
