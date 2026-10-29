package expo.modules.anyvodailywidget;

import org.json.JSONObject;

/** Native session tokens never survive a process restart or enter the disk envelope. */
final class DailyWidgetCacheCodec {
  static DailyWidgetState decode(String json, long now) {
    DailyWidgetState empty = DailyWidgetState.empty();
    try {
      if (json.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > DailyWidgetSnapshot.MAX_BYTES + 2048) return empty;
      JSONObject raw = new JSONObject(json);
      if (!(raw.get("envelopeVersion") instanceof Number) || raw.getDouble("envelopeVersion") != 1) return empty;
      String owner = raw.optString("ownerDigest", "");
      if (!owner.matches("[0-9a-f]{64}")) return empty;
      DailyWidgetSnapshot snapshot = raw.isNull("snapshot") ? null
        : DailyWidgetSnapshot.decode(raw.getJSONObject("snapshot").toString(), now);
      String availability = raw.optString("availability", "error");
      if (!availability.equals("ready") && !availability.equals("offline") && !availability.equals("error")) return empty;
      return new DailyWidgetState(owner, empty.token, 0, snapshot, availability);
    } catch (Exception ignored) { return empty; }
  }
  static String encode(DailyWidgetState state) throws Exception {
    return new JSONObject().put("envelopeVersion", 1)
      .put("ownerDigest", state.ownerDigest == null ? JSONObject.NULL : state.ownerDigest)
      .put("availability", state.availability)
      .put("snapshot", state.snapshot == null ? JSONObject.NULL : state.snapshot.encode()).toString();
  }
}
