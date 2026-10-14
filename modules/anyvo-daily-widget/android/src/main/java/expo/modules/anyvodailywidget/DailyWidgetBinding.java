package expo.modules.anyvodailywidget;

import org.json.JSONObject;

/** Pure binding rules shared by the atomic store and its tests. */
final class DailyWidgetBinding {
  static JSONObject reconcile(JSONObject previous, String binding, boolean newBinding) throws Exception {
    if (previous != null && binding.equals(previous.opt("binding"))) return previous;
    JSONObject value = newBinding ? DailyWidgetSelection.forDog(DailyWidgetState.empty(), null, 0).encode()
      : new JSONObject().put("unavailable", true);
    return value.put("binding", binding);
  }
  static DailyWidgetSelection selection(JSONObject raw, String binding) {
    return raw == null || !binding.equals(raw.opt("binding"))
      ? DailyWidgetSelection.unavailable() : DailyWidgetSelection.decode(raw);
  }
  static DailyWidgetSelection configure(DailyWidgetState state, String token, String dogId, long now) throws Exception {
    return state.ownerDigest == null || !state.token.equals(token) ? null : DailyWidgetSelection.forDog(state, dogId, now);
  }
}
