package expo.modules.anyvodailywidget;

import java.util.UUID;

/** Immutable session state; callers commit its disk image before publishing it. */
final class DailyWidgetState {
  final String ownerDigest, token, availability;
  final long sequence;
  final DailyWidgetSnapshot snapshot;
  DailyWidgetState(String owner, String token, long sequence, DailyWidgetSnapshot snapshot, String availability) {
    ownerDigest = owner; this.token = token; this.sequence = sequence; this.snapshot = snapshot; this.availability = availability;
  }
  static DailyWidgetState empty() { return new DailyWidgetState(null, UUID.randomUUID().toString(), 0, null, "ready"); }
  DailyWidgetState begin(String owner, long now) {
    boolean same = owner != null && owner.equals(ownerDigest);
    return new DailyWidgetState(owner, UUID.randomUUID().toString(), 0,
      same && snapshot != null && !snapshot.isExpired(now) ? snapshot : null, same ? availability : "ready");
  }
  DailyWidgetState expire(long now) {
    return snapshot != null && snapshot.isExpired(now)
      ? new DailyWidgetState(ownerDigest, token, sequence, null, availability) : this;
  }
  DailyWidgetState touchPresentation() {
    return new DailyWidgetState(ownerDigest, token, sequence, snapshot, availability);
  }
  boolean canRender(DailyWidgetState captured, long now) {
    return this == captured && (snapshot == null || !snapshot.isExpired(now));
  }
  boolean accepts(String incoming, long next) {
    return ownerDigest != null && token.equals(incoming) && next > sequence && next <= 9007199254740991L;
  }
  DailyWidgetState update(String incoming, long next, DailyWidgetSnapshot value, long now) {
    if (!accepts(incoming, next) || value.isExpired(now)
        || (snapshot != null && value.generatedAtMs < snapshot.generatedAtMs)) return null;
    return new DailyWidgetState(ownerDigest, token, next, value, "ready");
  }
  DailyWidgetState availability(String incoming, long next, String value) {
    if (!accepts(incoming, next) || (!"offline".equals(value) && !"error".equals(value))) return null;
    return new DailyWidgetState(ownerDigest, token, next, snapshot, value);
  }
}
