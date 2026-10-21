package expo.modules.anyvowearablecontrol.protocol

import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.util.UUID

/** Shared by the phone module and the independent Wear target. No recorder or account state. */
object Wire {
  const val MAX_BYTES = 8192
  const val COMMAND_PATH = "/anyvo/control/v1/command"
  const val SNAPSHOT_PATH = "/anyvo/control/v1/snapshot"
  const val ACK_PATH = "/anyvo/control/v1/ack"
  const val CLEAR_PATH = "/anyvo/control/v1/clear"
  const val PHONE_CAPABILITY = "anyvo_phone_control_v1"
  const val WATCH_CAPABILITY = "anyvo_watch_control_v1"
  const val REQUEST = "{\"protocolVersion\":1,\"kind\":\"snapshot_request\"}"
  val actions = setOf("start_lay", "start_search", "mark_object", "pause", "resume", "end_phase")
  val phases = setOf("idle", "lay_prepared", "lay_recording", "lay_paused", "search_prepared", "search_recording", "search_paused", "finishing", "finished")
  private val reasons = setOf("ok", "invalid_command", "unavailable", "stale_context", "stale_revision", "expired", "wrong_target", "not_allowed", "confirmation_required", "busy", "failed")

  data class Snapshot(val json: String, val contextId: String?, val revision: Long, val sequence: Long,
    val leaseId: String?, val expiresAtMs: Double, val sessionId: String?, val dogId: String?,
    val dogName: String?, val phase: String, val distanceM: Double?, val elapsedSeconds: Double?, val capabilities: Set<String>)
  data class Command(val json: String, val commandId: String, val contextId: String, val revision: Long,
    val leaseId: String, val sessionId: String?, val dogId: String, val action: String, val confirmed: Boolean)
  data class Ack(val commandId: String?, val accepted: Boolean, val reason: String, val snapshot: Snapshot)

  fun decode(bytes: ByteArray): String {
    require(bytes.size <= MAX_BYTES)
    return Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
      .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()
  }

  private fun objectOf(json: String): JSONObject {
    require(json.toByteArray(Charsets.UTF_8).size <= MAX_BYTES)
    StrictJson(json).validate()
    val tokener = JSONTokener(json)
    val obj = tokener.nextValue() as? JSONObject ?: error("object required")
    require(tokener.nextClean() == '\u0000')
    require(integer(obj, "protocolVersion") == 1L)
    return obj
  }
  private fun keys(obj: JSONObject, expected: String) {
    require(obj.keys().asSequence().toSet() == expected.split(',').toSet())
  }
  private fun string(obj: JSONObject, key: String): String = (obj.get(key) as? String)
    ?.takeIf { it.isNotEmpty() && it.length <= 160 } ?: error("invalid $key")
  private fun nullableString(obj: JSONObject, key: String): String? = if (obj.isNull(key)) null else string(obj, key)
  private fun integer(obj: JSONObject, key: String): Long {
    val n = obj.get(key) as? Number ?: error("invalid $key")
    val d = n.toDouble()
    require(d.isFinite() && d >= 0 && d <= 9007199254740991.0 && d % 1.0 == 0.0)
    return n.toLong()
  }
  private fun number(obj: JSONObject, key: String): Double {
    val d = (obj.get(key) as? Number)?.toDouble() ?: error("invalid $key")
    require(d.isFinite() && d >= 0)
    return d
  }
  private fun nullableNumber(obj: JSONObject, key: String) = if (obj.isNull(key)) null else number(obj, key)
  private fun uuid(value: String): String {
    require(Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}").matches(value))
    require(UUID.fromString(value).toString().equals(value, ignoreCase = true))
    return value
  }

  fun isRequest(json: String): Boolean = runCatching {
    val o = objectOf(json)
    keys(o, "protocolVersion,kind")
    o.get("kind") == "snapshot_request"
  }.getOrDefault(false)

  fun snapshot(json: String): Snapshot {
    val o = objectOf(json)
    keys(o, "protocolVersion,kind,contextId,revision,sequence,leaseId,expiresAtMs,sessionId,dogId,dogName,phase,distanceM,elapsedSeconds,capabilities")
    require(o.get("kind") == "snapshot")
    val phase = string(o, "phase").also { require(it in phases) }
    val list = o.get("capabilities") as? JSONArray ?: error("capabilities required")
    val capabilities = (0 until list.length()).map { (list.get(it) as? String)?.also { a -> require(a in actions) } ?: error("invalid action") }
    require(capabilities.size == capabilities.toSet().size)
    val context = nullableString(o, "contextId")
    val lease = nullableString(o, "leaseId")
    val dog = nullableString(o, "dogId")
    require(capabilities.isEmpty() || (context != null && lease != null && dog != null))
    return Snapshot(json, context, integer(o, "revision"), integer(o, "sequence"), lease,
      number(o, "expiresAtMs"), nullableString(o, "sessionId"), dog, nullableString(o, "dogName"),
      phase, nullableNumber(o, "distanceM"), nullableNumber(o, "elapsedSeconds"), capabilities.toSet())
  }

  fun command(json: String): Command {
    val o = objectOf(json)
    keys(o, "protocolVersion,kind,commandId,contextId,revision,leaseId,sessionId,dogId,action,confirmed")
    require(o.get("kind") == "command")
    val action = string(o, "action").also { require(it in actions) }
    val confirmed = o.get("confirmed") as? Boolean ?: error("boolean required")
    return Command(json, uuid(string(o, "commandId")), string(o, "contextId"), integer(o, "revision"),
      string(o, "leaseId"), nullableString(o, "sessionId"), string(o, "dogId"), action, confirmed)
  }

  fun ack(json: String): Ack {
    val o = objectOf(json)
    keys(o, "protocolVersion,kind,commandId,status,reason,snapshot")
    require(o.get("kind") == "ack")
    val status = string(o, "status").also { require(it in setOf("accepted", "rejected")) }
    val reason = string(o, "reason").also { require(it in reasons) }
    require((status == "accepted") == (reason == "ok"))
    return Ack(nullableString(o, "commandId")?.let(::uuid), status == "accepted", reason,
      snapshot((o.get("snapshot") as? JSONObject ?: error("snapshot required")).toString()))
  }

  fun makeCommand(snapshot: Snapshot, action: String, confirmed: Boolean, id: String = UUID.randomUUID().toString()): Command {
    require(action in snapshot.capabilities && (action != "end_phase" || confirmed))
    val o = JSONObject().put("protocolVersion", 1).put("kind", "command").put("commandId", id)
      .put("contextId", snapshot.contextId).put("revision", snapshot.revision).put("leaseId", snapshot.leaseId)
      .put("sessionId", snapshot.sessionId ?: JSONObject.NULL).put("dogId", snapshot.dogId)
      .put("action", action).put("confirmed", confirmed)
    return command(o.toString())
  }
}
