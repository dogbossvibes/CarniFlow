package expo.modules.anyvodailywidget;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.json.JSONObject;

/** Widget preference contains only pseudonymous digests, never a dog name or raw ID. */
final class DailyWidgetSelection {
  final String ownerDigest, dogDigest;
  private DailyWidgetSelection(String owner, String dog) { ownerDigest = owner; dogDigest = dog; }
  static DailyWidgetSelection unavailable() { return new DailyWidgetSelection("", ""); }
  static DailyWidgetSelection forDog(DailyWidgetState state, String id, long now) throws Exception {
    if (id == null) return new DailyWidgetSelection(null, null);
    if (state.ownerDigest == null || state.snapshot == null || state.snapshot.isExpired(now)) return null;
    for (DailyWidgetSnapshot.Dog dog : state.snapshot.dogs) if (dog.id.equals(id))
      return new DailyWidgetSelection(state.ownerDigest, digest(id));
    return null;
  }
  boolean allDogs() { return ownerDigest == null && dogDigest == null; }
  String resolve(DailyWidgetState state) throws Exception {
    if (allDogs() || state.snapshot == null || !ownerDigest.equals(state.ownerDigest)) return null;
    for (DailyWidgetSnapshot.Dog dog : state.snapshot.dogs) if (dogDigest.equals(digest(dog.id))) return dog.id;
    return null;
  }
  JSONObject encode() throws Exception {
    return new JSONObject().put("ownerDigest", ownerDigest == null ? JSONObject.NULL : ownerDigest)
      .put("dogDigest", dogDigest == null ? JSONObject.NULL : dogDigest);
  }
  static DailyWidgetSelection decode(JSONObject raw) {
    if (raw.opt("unavailable") != null && !Boolean.FALSE.equals(raw.opt("unavailable"))) return unavailable();
    if (!raw.has("ownerDigest") || !raw.has("dogDigest")) return unavailable();
    if (raw.isNull("ownerDigest") && raw.isNull("dogDigest")) return new DailyWidgetSelection(null, null);
    String owner = raw.optString("ownerDigest", ""), dog = raw.optString("dogDigest", "");
    return owner.matches("[0-9a-f]{64}") && dog.matches("[0-9a-f]{64}") ? new DailyWidgetSelection(owner, dog) : unavailable();
  }
  static String digest(String value) throws Exception {
    byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
    StringBuilder out = new StringBuilder();
    for (byte item : bytes) out.append(String.format(java.util.Locale.ROOT, "%02x", item & 255));
    return out.toString();
  }
}
