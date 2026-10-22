package expo.modules.anyvogreetingaudio

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class AnyvoGreetingAudioModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private val requests = ConcurrentHashMap<String, GreetingRequest>()
  private var player: MediaPlayer? = null
  private var playerRequest: GreetingRequest? = null
  private var receiverContext: Context? = null
  private val receiver: BroadcastReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY ||
        intent.getIntExtra(AudioManager.EXTRA_RINGER_MODE, -1) != AudioManager.RINGER_MODE_NORMAL) {
        controller.stop()
      } else controller.checkNow()
    }
  }
  private val controller = GreetingPlaybackController(object : GreetingPlaybackController.Host {
    override fun now() = SystemClock.elapsedRealtime()
    override fun allowed(): Boolean {
      val context = appContext.reactContext ?: return false
      val activity = appContext.currentActivity ?: return false
      if (activity.isFinishing || activity.isDestroyed || !activity.hasWindowFocus()) return false
      val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return false
      val notifications = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return false
      return audio.ringerMode == AudioManager.RINGER_MODE_NORMAL && audio.mode == AudioManager.MODE_NORMAL &&
        !audio.isStreamMute(AudioManager.STREAM_MUSIC) && audio.getStreamVolume(AudioManager.STREAM_MUSIC) > 0 &&
        !audio.isStreamMute(AudioManager.STREAM_SYSTEM) && audio.getStreamVolume(AudioManager.STREAM_SYSTEM) > 0 &&
        audio.activeRecordingConfigurations.isEmpty() &&
        notifications.currentInterruptionFilter == NotificationManager.INTERRUPTION_FILTER_ALL
    }
    override fun arm(request: GreetingRequest) {
      val context = appContext.reactContext ?: error("Context unavailable")
      playerRequest = request
      // Registering must succeed. A listener object alone is not an acknowledgement.
      val filter = IntentFilter(AudioManager.RINGER_MODE_CHANGED_ACTION).apply {
        addAction(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
      }
      if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      else { @Suppress("DEPRECATION") context.registerReceiver(receiver, filter) }
      receiverContext = context
    }
    override fun prepare(request: GreetingRequest, ready: () -> Unit, done: () -> Unit) {
      val context = appContext.reactContext ?: error("Context unavailable")
      val next = MediaPlayer()
      player = next
      next.setAudioAttributes(AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
      // Fixed bundled original only: no remote URI, file path or customer data input.
      context.resources.openRawResourceFd(R.raw.anyvo_greeting).use { asset ->
        next.setDataSource(asset.fileDescriptor, asset.startOffset, asset.length)
      }
      next.isLooping = false
      next.setOnPreparedListener { ready() }
      next.setOnCompletionListener { done() }
      next.setOnErrorListener { _, _, _ -> done(); true }
      next.prepareAsync()
    }
    override fun play(request: GreetingRequest) {
      if (playerRequest === request) player?.start()
    }
    override fun release(request: GreetingRequest) {
      requests.remove(request.token, request)
      if (playerRequest !== request) return
      playerRequest = null
      val previous = player
      player = null
      try { previous?.release() } finally {
        val context = receiverContext
        receiverContext = null
        if (context != null) try { context.unregisterReceiver(receiver) } catch (_: Exception) { }
      }
    }
    override fun schedule(task: Runnable, delayMs: Long) { handler.postDelayed(task, delayMs) }
    override fun unschedule(task: Runnable) { handler.removeCallbacks(task) }
  })

  override fun definition() = ModuleDefinition {
    Name("AnyvoGreetingAudio")
    Function("getApiVersion") { 1 }
    Function("beginSession") { remainingMs: Double ->
      if (!remainingMs.isFinite() || remainingMs <= 0 || remainingMs > 2040 || requests.size >= 16) null
      else {
        val token = UUID.randomUUID().toString()
        requests[token] = GreetingRequest(token, SystemClock.elapsedRealtime() + remainingMs.toLong())
        token
      }
    }
    AsyncFunction("play") { token: String ->
      val request = requests[token]
      request != null && request.claimed.compareAndSet(false, true) && controller.start(request)
    }.runOnQueue(Queues.MAIN)
    Function("cancel") { token: String -> requests[token]?.cancelled?.set(true) }
    AsyncFunction("stop") { token: String ->
      val request = requests.remove(token)
      if (request != null) {
        request.cancelled.set(true)
        controller.stop(request)
      }
      true
    }.runOnQueue(Queues.MAIN)
    OnActivityEntersBackground { handler.post { cancelAll() } }
    OnActivityDestroys { handler.post { cancelAll() } }
    OnDestroy { handler.post { cancelAll() } }
  }
  private fun cancelAll() {
    requests.values.forEach { it.cancelled.set(true) }
    requests.clear()
    controller.stop()
  }
}
