package expo.modules.anyvodailywidget;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TimeZone;

/** Typed whitelist. Never persist the caller's JSON, event titles or auth fields. */
final class DailyWidgetSnapshot {
  static final long FRESH_MS = 15 * 60 * 1000L;
  static final long EXPIRY_MS = 6 * 60 * 60 * 1000L;
  // Covers the agreed 128 dogs × 256 items × 128 bounded dog references.
  static final int MAX_BYTES = 16 * 1024 * 1024;
  final long generatedAtMs, freshUntilMs, expiresAtMs;
  final String timeZone;
  final boolean truncated;
  final List<Dog> dogs;
  final List<Item> items;

  static final class Dog {
    final String id, name;
    Dog(String id, String name) { this.id = id; this.name = name; }
  }
  static final class Item {
    final String id, kind, status;
    final List<String> dogIds;
    final long startAtMs;
    final Long endAtMs;
    final boolean carPlayEligible;
    Item(String id, String kind, List<String> dogIds, long start, Long end, String status, boolean eligible) {
      this.id = id; this.kind = kind; this.dogIds = Collections.unmodifiableList(dogIds);
      startAtMs = start; endAtMs = end; this.status = status; carPlayEligible = eligible;
    }
  }
  private DailyWidgetSnapshot(long generated, long fresh, long expires, String zone,
      boolean truncated, List<Dog> dogs, List<Item> items) {
    generatedAtMs = generated; freshUntilMs = fresh; expiresAtMs = expires; timeZone = zone;
    this.truncated = truncated; this.dogs = Collections.unmodifiableList(dogs);
    this.items = Collections.unmodifiableList(items);
  }
  static DailyWidgetSnapshot decode(String json, long now) throws Exception {
    if (json == null || json.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > MAX_BYTES)
      throw new IllegalArgumentException("Widget snapshot too large");
    JSONObject root = new JSONObject(json);
    if (integer(root, "schemaVersion") != 1) throw new IllegalArgumentException("Unknown widget schema");
    long generated = integer(root, "generatedAtMs"), fresh = integer(root, "freshUntilMs"), expires = integer(root, "expiresAtMs");
    if (generated <= 0 || generated > now + 60000 || fresh < generated || fresh - generated > FRESH_MS
        || expires < fresh || expires - generated > EXPIRY_MS || expires <= now)
      throw new IllegalArgumentException("Invalid widget lifetime");
    String zone = text(root, "timeZone", 128);
    boolean knownZone = false;
    for (String available : TimeZone.getAvailableIDs()) if (available.equals(zone)) { knownZone = true; break; }
    if (!knownZone) throw new IllegalArgumentException("Unknown widget timezone");
    boolean truncated = bool(root, "truncated");
    JSONArray rawDogs = root.getJSONArray("dogs"), rawItems = root.getJSONArray("items");
    if (rawDogs.length() > 128 || rawItems.length() > 256) throw new IllegalArgumentException("Widget limits exceeded");
    List<Dog> dogs = new ArrayList<>(); Set<String> dogIds = new HashSet<>();
    for (int i = 0; i < rawDogs.length(); i++) {
      JSONObject raw = rawDogs.getJSONObject(i); String id = text(raw, "id", 128);
      if (!dogIds.add(id)) throw new IllegalArgumentException("Duplicate widget dog");
      Object name = raw.get("name");
      if (!(name instanceof String) || ((String) name).length() > 100)
        throw new IllegalArgumentException("Invalid widget dog name");
      dogs.add(new Dog(id, ((String) name).replaceAll("[\\p{Cntrl}]", "")));
    }
    List<Item> items = new ArrayList<>(); Set<String> identities = new HashSet<>();
    for (int i = 0; i < rawItems.length(); i++) {
      JSONObject raw = rawItems.getJSONObject(i); String id = text(raw, "id", 128), kind = text(raw, "kind", 32);
      String status = text(raw, "status", 32);
      if ((!kind.equals("appointment") && !kind.equals("reminder"))
          || (!status.equals("confirmed") && !status.equals("pending"))
          || !identities.add(kind + ":" + id)) throw new IllegalArgumentException("Invalid widget item");
      long start = integer(raw, "startAtMs");
      Long end = raw.isNull("endAtMs") ? null : integer(raw, "endAtMs");
      if (start <= 0 || (end != null && end < start)) throw new IllegalArgumentException("Invalid widget dates");
      JSONArray references = raw.getJSONArray("dogIds"); List<String> refs = new ArrayList<>();
      Set<String> seen = new HashSet<>();
      for (int n = 0; n < references.length(); n++) {
        Object value = references.get(n);
        if (!(value instanceof String) || !dogIds.contains(value) || !seen.add((String) value))
          throw new IllegalArgumentException("Unknown widget dog reference");
        refs.add((String) value);
      }
      boolean eligible = bool(raw, "carPlayEligible");
      if (eligible && (!kind.equals("appointment") || !status.equals("confirmed")))
        throw new IllegalArgumentException("Invalid CarPlay eligibility");
      items.add(new Item(id, kind, refs, start, end, status, eligible));
    }
    return new DailyWidgetSnapshot(generated, fresh, expires, zone, truncated, dogs, items);
  }
  boolean isExpired(long now) { return now >= expiresAtMs || now + 60000 < generatedAtMs; }
  Item nextAppointment(long now) { return nextAppointment(now, null); }
  Item nextPendingAppointment(long now) { return nextPendingAppointment(now, null); }
  Item nextAppointment(long now, String dogId) { return nextAppointment(now, "confirmed", dogId); }
  Item nextPendingAppointment(long now, String dogId) { return nextAppointment(now, "pending", dogId); }
  private Item nextAppointment(long now, String status, String dogId) {
    Item next = null;
    for (Item item : items) if (item.kind.equals("appointment") && item.status.equals(status)
        && (dogId == null || item.dogIds.contains(dogId))
        && (item.startAtMs >= now || (item.endAtMs != null && item.endAtMs > now))
        && (next == null || item.startAtMs < next.startAtMs)) next = item;
    return next;
  }
  int reminderCount(long now) { return reminderCount(now, null); }
  int reminderCount(long now, String dogId) {
    java.util.Calendar date = java.util.Calendar.getInstance(TimeZone.getTimeZone(timeZone));
    date.setTimeInMillis(now); date.set(java.util.Calendar.HOUR_OF_DAY, 0);
    date.set(java.util.Calendar.MINUTE, 0); date.set(java.util.Calendar.SECOND, 0); date.set(java.util.Calendar.MILLISECOND, 0);
    long start = date.getTimeInMillis(); date.add(java.util.Calendar.DATE, 1); long end = date.getTimeInMillis();
    int count = 0;
    for (Item item : items) if (item.kind.equals("reminder") && item.startAtMs >= start && item.startAtMs < end
      && (dogId == null || item.dogIds.contains(dogId))) count++;
    return count;
  }
  JSONObject encode() throws Exception {
    JSONObject out = new JSONObject().put("schemaVersion", 1).put("generatedAtMs", generatedAtMs)
      .put("freshUntilMs", freshUntilMs).put("expiresAtMs", expiresAtMs).put("timeZone", timeZone).put("truncated", truncated);
    JSONArray encodedDogs = new JSONArray(), encodedItems = new JSONArray();
    for (Dog dog : dogs) encodedDogs.put(new JSONObject().put("id", dog.id).put("name", dog.name));
    for (Item item : items) encodedItems.put(new JSONObject().put("id", item.id).put("kind", item.kind)
      .put("dogIds", new JSONArray(item.dogIds)).put("startAtMs", item.startAtMs)
      .put("endAtMs", item.endAtMs == null ? JSONObject.NULL : item.endAtMs)
      .put("status", item.status).put("carPlayEligible", item.carPlayEligible));
    return out.put("dogs", encodedDogs).put("items", encodedItems);
  }
  private static long integer(JSONObject object, String key) throws Exception {
    Object raw = object.get(key);
    if (!(raw instanceof Number)) throw new IllegalArgumentException("Invalid widget number");
    double value = ((Number) raw).doubleValue();
    if (Double.isNaN(value) || Double.isInfinite(value) || value != Math.rint(value) || Math.abs(value) > 9007199254740991d)
      throw new IllegalArgumentException("Invalid widget number");
    return ((Number) raw).longValue();
  }
  private static String text(JSONObject object, String key, int max) throws Exception {
    Object raw = object.get(key);
    if (!(raw instanceof String)) throw new IllegalArgumentException("Invalid widget text");
    String value = (String) raw;
    if (value.trim().isEmpty() || value.length() > max || value.codePoints().anyMatch(Character::isISOControl))
      throw new IllegalArgumentException("Invalid widget text");
    return value;
  }
  private static boolean bool(JSONObject object, String key) throws Exception {
    Object raw = object.get(key);
    if (!(raw instanceof Boolean)) throw new IllegalArgumentException("Invalid widget flag");
    return (Boolean) raw;
  }
}
