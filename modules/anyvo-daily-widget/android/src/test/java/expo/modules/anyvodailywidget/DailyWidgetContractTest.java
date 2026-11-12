package expo.modules.anyvodailywidget;

import org.junit.Test;
import static org.junit.Assert.*;
import org.json.JSONArray;
import org.json.JSONObject;

public class DailyWidgetContractTest {
  private static final long NOW = 1791964800000L;
  private JSONObject data() throws Exception {
    return new JSONObject().put("schemaVersion", 1).put("generatedAtMs", NOW)
      .put("freshUntilMs", NOW + DailyWidgetSnapshot.FRESH_MS).put("expiresAtMs", NOW + DailyWidgetSnapshot.EXPIRY_MS)
      .put("timeZone", "Europe/Zurich").put("truncated", false)
      .put("dogs", new JSONArray().put(new JSONObject().put("id", "dog-a").put("name", "Private dog name"))
        .put(new JSONObject().put("id", "dog-b").put("name", "Second dog")))
      .put("items", new JSONArray().put(item("appointment", "a", NOW + 60000, "confirmed", true)));
  }
  private JSONObject item(String kind, String id, long time, String status, boolean carPlay) throws Exception {
    return new JSONObject().put("id", id).put("kind", kind).put("dogIds", new JSONArray().put("dog-a"))
      .put("startAtMs", time).put("endAtMs", JSONObject.NULL).put("status", status).put("carPlayEligible", carPlay);
  }
  private DailyWidgetSnapshot decode(JSONObject data) throws Exception { return DailyWidgetSnapshot.decode(data.toString(), NOW); }
  private void invalid(JSONObject data) throws Exception {
    try { decode(data); fail("Malformed snapshot accepted"); } catch (IllegalArgumentException expected) { }
  }
  @Test public void decoderRemovesPrivateAndUnknownFields() throws Exception {
    JSONObject data = data().put("accessToken", "secret").put("ownerId", "account");
    data.getJSONArray("items").getJSONObject(0).put("title", "Private medical note").put("location", "Home address");
    String normalized = decode(data).encode().toString();
    assertFalse(normalized.contains("secret")); assertFalse(normalized.contains("Private medical"));
    assertFalse(normalized.contains("ownerId")); assertFalse(normalized.contains("location"));
  }
  @Test public void multipleDogsRemainSeparate() throws Exception {
    DailyWidgetSnapshot snapshot = decode(data()); assertEquals(2, snapshot.dogs.size());
    assertEquals("dog-a", snapshot.items.get(0).dogIds.get(0));
  }
  @Test public void emptyDogNameFromSharedProjectionIsSupported() throws Exception {
    JSONObject data = data(); data.getJSONArray("dogs").getJSONObject(0).put("name", "");
    assertEquals("", decode(data).dogs.get(0).name);
  }
  @Test public void unknownDogIsRejected() throws Exception {
    JSONObject data = data(); data.getJSONArray("items").getJSONObject(0).put("dogIds", new JSONArray().put("foreign")); invalid(data);
  }
  @Test public void unknownSchemaIsRejected() throws Exception { invalid(data().put("schemaVersion", 2)); }
  @Test public void coercibleStringSchemaIsRejected() throws Exception { invalid(data().put("schemaVersion", "1")); }
  @Test public void completedAndCancelledAreRejected() throws Exception {
    for (String status : new String[]{"completed", "cancelled"}) {
      JSONObject data = data(); data.getJSONArray("items").getJSONObject(0).put("status", status); invalid(data);
    }
  }
  @Test public void unknownKindIsRejected() throws Exception {
    JSONObject data = data(); data.getJSONArray("items").getJSONObject(0).put("kind", "health"); invalid(data);
  }
  @Test public void pendingAndReminderCannotClaimCarPlayEligibility() throws Exception {
    JSONObject data = data(); data.getJSONArray("items").getJSONObject(0).put("status", "pending"); invalid(data);
    data = data(); data.getJSONArray("items").getJSONObject(0).put("kind", "reminder"); invalid(data);
  }
  @Test public void duplicateDogIdsAreRejected() throws Exception {
    JSONObject data = data(); data.getJSONArray("dogs").put(data.getJSONArray("dogs").getJSONObject(0)); invalid(data);
  }
  @Test public void duplicateItemsAreRejected() throws Exception {
    JSONObject data = data(); data.getJSONArray("items").put(data.getJSONArray("items").getJSONObject(0)); invalid(data);
  }
  @Test public void unknownTimeZoneIsRejected() throws Exception { invalid(data().put("timeZone", "Invalid/Unknown")); }
  @Test public void freshAndExpiryCannotBeExtended() throws Exception {
    invalid(data().put("freshUntilMs", NOW + DailyWidgetSnapshot.FRESH_MS + 1));
    invalid(data().put("expiresAtMs", NOW + DailyWidgetSnapshot.EXPIRY_MS + 1));
  }
  @Test public void expiredAndFutureDatedDataFailClosed() throws Exception {
    invalid(data().put("expiresAtMs", NOW));
    invalid(data().put("generatedAtMs", NOW + 60001));
  }
  @Test public void offlineStateDoesNotChangeTimestamps() throws Exception {
    DailyWidgetState state = DailyWidgetState.empty().begin("owner-a", NOW);
    state = state.update(state.token, 1, decode(data()), NOW);
    DailyWidgetState offline = state.availability(state.token, 2, "offline");
    assertSame(state.snapshot, offline.snapshot);
    assertEquals(NOW + DailyWidgetSnapshot.EXPIRY_MS, offline.snapshot.expiresAtMs);
    assertTrue(offline.snapshot.isExpired(NOW + DailyWidgetSnapshot.EXPIRY_MS));
  }
  @Test public void logoutRotatesTokenAndRejectsOldWrites() throws Exception {
    DailyWidgetState before = DailyWidgetState.empty().begin("owner-a", NOW);
    DailyWidgetState after = before.begin(null, NOW);
    assertNotEquals(before.token, after.token); assertNull(after.snapshot);
    assertNull(after.update(before.token, 20, decode(data()), NOW));
    assertNull(after.update(after.token, 1, decode(data()), NOW));
  }
  @Test public void switchOwnerRejectsLateAvailabilityAndSnapshot() throws Exception {
    DailyWidgetState before = DailyWidgetState.empty().begin("owner-a", NOW);
    before = before.update(before.token, 1, decode(data()), NOW);
    DailyWidgetState after = before.begin("owner-b", NOW);
    assertNull(after.snapshot); assertNull(after.update(before.token, 2, before.snapshot, NOW));
    assertNull(after.availability(before.token, 3, "error"));
  }
  @Test public void sameOwnerColdStartPreservesValidSnapshotButRotatesAuthority() throws Exception {
    DailyWidgetState before = DailyWidgetState.empty().begin("owner-a", NOW);
    before = before.update(before.token, 1, decode(data()), NOW);
    DailyWidgetState after = before.begin("owner-a", NOW + 1000);
    assertSame(before.snapshot, after.snapshot); assertNotEquals(before.token, after.token);
    assertNull(after.update(before.token, 100, before.snapshot, NOW + 1000));
  }
  @Test public void staleSequenceCannotReplaceNewerData() throws Exception {
    DailyWidgetState state = DailyWidgetState.empty().begin("owner-a", NOW);
    state = state.update(state.token, 5, decode(data()), NOW);
    assertNull(state.update(state.token, 4, decode(data()), NOW));
    assertNull(state.availability(state.token, 5, "offline"));
    assertNotNull(state.availability(state.token, 6, "error"));
  }
  @Test public void capsFailWithoutPretendingNoItems() throws Exception {
    JSONObject data = data(); JSONArray items = new JSONArray();
    for (int i = 0; i < 257; i++) items.put(item("appointment", "item" + i, NOW + i + 1, "confirmed", false));
    data.put("items", items); invalid(data);
  }
  @Test public void partialViewFlagSurvivesEncoding() throws Exception {
    assertTrue(decode(data().put("truncated", true)).encode().getBoolean("truncated"));
  }
  @Test public void expiredSnapshotDoesNotSurviveOwnerResume() throws Exception {
    DailyWidgetState state = DailyWidgetState.empty().begin("owner-a", NOW);
    state = state.update(state.token, 1, decode(data()), NOW);
    assertNull(state.begin("owner-a", NOW + DailyWidgetSnapshot.EXPIRY_MS).snapshot);
  }
  @Test public void confirmedAppointmentTakesPriorityAndRequestsRemainSeparate() throws Exception {
    JSONObject data = data().put("items", new JSONArray()
      .put(item("appointment", "past", NOW - 10, "confirmed", false))
      .put(item("appointment", "pending", NOW + 50, "pending", false))
      .put(item("appointment", "later", NOW + 100, "confirmed", true)));
    assertEquals("later", decode(data).nextAppointment(NOW).id);
    assertEquals("pending", decode(data).nextPendingAppointment(NOW).id);
  }
  @Test public void remindersRespectLocalDayAndDoNotCountAppointments() throws Exception {
    JSONObject data = data(); data.getJSONArray("items")
      .put(item("reminder", "today", NOW + 1000, "confirmed", false))
      .put(item("reminder", "tomorrow", NOW + 86400000, "confirmed", false));
    assertEquals(1, decode(data).reminderCount(NOW));
  }
  @Test public void coldProcessCacheHasFreshTokenAndRetainsOnlySameOwnerData() throws Exception {
    String owner = new String(new char[64]).replace('\0', 'a');
    DailyWidgetState before = DailyWidgetState.empty().begin(owner, NOW);
    before = before.update(before.token, 9, decode(data()), NOW);
    String stored = DailyWidgetCacheCodec.encode(before);
    assertFalse(stored.contains(before.token)); assertFalse(stored.contains("sequence"));
    DailyWidgetState loaded = DailyWidgetCacheCodec.decode(stored, NOW + 1000);
    assertEquals(owner, loaded.ownerDigest); assertNotNull(loaded.snapshot);
    assertNotEquals(before.token, loaded.token); assertEquals(0, loaded.sequence);
    assertNull(loaded.update(before.token, 10, before.snapshot, NOW + 1000));
  }
  @Test public void malformedCacheAndUnknownEnvelopeFailClosed() throws Exception {
    assertNull(DailyWidgetCacheCodec.decode("{corrupt", NOW).snapshot);
    DailyWidgetState state = DailyWidgetState.empty().begin(new String(new char[64]).replace('\0', 'a'), NOW);
    state = state.update(state.token, 1, decode(data()), NOW);
    JSONObject cache = new JSONObject(DailyWidgetCacheCodec.encode(state)).put("envelopeVersion", 2);
    assertNull(DailyWidgetCacheCodec.decode(cache.toString(), NOW).snapshot);
    cache.put("envelopeVersion", "1"); assertNull(DailyWidgetCacheCodec.decode(cache.toString(), NOW).snapshot);
  }
  @Test public void logoutTombstoneCarriesNoOwnerOrSnapshot() throws Exception {
    DailyWidgetState state = DailyWidgetState.empty().begin(new String(new char[64]).replace('\0', 'a'), NOW);
    state = state.update(state.token, 1, decode(data()), NOW);
    String stored = DailyWidgetCacheCodec.encode(state.begin(null, NOW));
    assertFalse(stored.contains("Private dog")); assertNull(DailyWidgetCacheCodec.decode(stored, NOW).ownerDigest);
    assertNull(DailyWidgetCacheCodec.decode(stored, NOW).snapshot);
  }
  @Test public void expiredCacheAndInvalidOwnerDigestStayAnonymous() throws Exception {
    DailyWidgetState state = DailyWidgetState.empty().begin(new String(new char[64]).replace('\0', 'a'), NOW);
    state = state.update(state.token, 1, decode(data()), NOW);
    String stored = DailyWidgetCacheCodec.encode(state);
    assertNull(DailyWidgetCacheCodec.decode(stored, NOW + DailyWidgetSnapshot.EXPIRY_MS).snapshot);
    JSONObject invalid = new JSONObject(stored).put("ownerDigest", "raw-account-id");
    assertNull(DailyWidgetCacheCodec.decode(invalid.toString(), NOW).ownerDigest);
  }
  @Test public void largeMultiDogSnapshotWithinAgreedCapsIsNotSilentlyRejected() throws Exception {
    JSONObject data = data(); JSONArray dogs = new JSONArray(), references = new JSONArray(), items = new JSONArray();
    for (int i = 0; i < 128; i++) {
      String id = String.format("00000000-0000-0000-0000-%012d", i);
      dogs.put(new JSONObject().put("id", id).put("name", "Dog")); references.put(id);
    }
    for (int i = 0; i < 256; i++) items.put(item("appointment", "item" + i, NOW + i + 1, "confirmed", false).put("dogIds", references));
    data.put("dogs", dogs).put("items", items);
    assertTrue(data.toString().length() > 65536);
    DailyWidgetSnapshot snapshot = decode(data);
    assertEquals(128, snapshot.dogs.size()); assertEquals(256, snapshot.items.size());
  }
  @Test public void reminderDayHandlesShortAndLongDstDays() throws Exception {
    for (int month : new int[]{java.util.Calendar.MARCH, java.util.Calendar.OCTOBER}) {
      java.util.Calendar day = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("Europe/Zurich"));
      day.clear(); day.set(2026, month, month == java.util.Calendar.MARCH ? 29 : 25, 0, 0, 0);
      long start = day.getTimeInMillis(); day.add(java.util.Calendar.DATE, 1); long end = day.getTimeInMillis();
      assertEquals((month == java.util.Calendar.MARCH ? 23 : 25) * 3600000L, end - start);
      long now = start + 12 * 3600000L;
      JSONObject data = data().put("generatedAtMs", now).put("freshUntilMs", now + DailyWidgetSnapshot.FRESH_MS)
        .put("expiresAtMs", now + DailyWidgetSnapshot.EXPIRY_MS).put("items", new JSONArray()
          .put(item("reminder", "early", start, "confirmed", false))
          .put(item("reminder", "late", end - 1, "pending", false))
          .put(item("reminder", "tomorrow", end, "confirmed", false)));
      assertEquals(2, DailyWidgetSnapshot.decode(data.toString(), now).reminderCount(now));
    }
  }
  @Test public void expiredReadDropsPayloadWithoutChangingCurrentSessionAuthority() throws Exception {
    DailyWidgetState state = DailyWidgetState.empty().begin(new String(new char[64]).replace('\0', 'a'), NOW);
    state = state.update(state.token, 8, decode(data()), NOW);
    DailyWidgetState expired = state.expire(NOW + DailyWidgetSnapshot.EXPIRY_MS);
    assertNull(expired.snapshot); assertEquals(state.token, expired.token); assertEquals(8, expired.sequence);
    assertTrue(expired.accepts(state.token, 9)); assertFalse(DailyWidgetCacheCodec.encode(expired).contains("Private dog"));
    assertNull(expired.update(state.token, 9, state.snapshot, NOW + DailyWidgetSnapshot.EXPIRY_MS));
  }
  @Test public void pendingOnlyIsNotPresentedAsConfirmedAppointment() throws Exception {
    JSONObject data = data().put("items", new JSONArray().put(item("appointment", "pending", NOW + 50, "pending", false)));
    DailyWidgetSnapshot snapshot = decode(data); assertNull(snapshot.nextAppointment(NOW));
    assertEquals("pending", snapshot.nextPendingAppointment(NOW).id);
  }
  @Test public void capturedWidgetRenderCannotCommitAfterLogoutOrOwnerSwitch() throws Exception {
    DailyWidgetState captured = DailyWidgetState.empty().begin("owner-a", NOW);
    captured = captured.update(captured.token, 1, decode(data()), NOW);
    assertTrue(captured.canRender(captured, NOW));
    assertFalse(captured.begin(null, NOW).canRender(captured, NOW));
    assertFalse(captured.begin("owner-b", NOW).canRender(captured, NOW));
    assertFalse(captured.begin("owner-a", NOW).canRender(captured, NOW));
  }
  @Test public void newerSequenceOrExpiryInvalidatesPreparedRender() throws Exception {
    DailyWidgetState captured = DailyWidgetState.empty().begin("owner-a", NOW);
    captured = captured.update(captured.token, 1, decode(data()), NOW);
    assertFalse(captured.availability(captured.token, 2, "offline").canRender(captured, NOW));
    assertFalse(captured.canRender(captured, NOW + DailyWidgetSnapshot.EXPIRY_MS));
    assertFalse(captured.expire(NOW + DailyWidgetSnapshot.EXPIRY_MS).canRender(captured, NOW + DailyWidgetSnapshot.EXPIRY_MS));
  }
  private DailyWidgetState ownerState(String owner) throws Exception {
    DailyWidgetState state = DailyWidgetState.empty().begin(DailyWidgetSelection.digest(owner), NOW);
    return state.update(state.token, 1, decode(data()), NOW);
  }
  @Test public void selectedDogPreferenceStoresOnlyDigestsAndRoundTrips() throws Exception {
    DailyWidgetState state = ownerState("account-a");
    DailyWidgetSelection selected = DailyWidgetSelection.forDog(state, "dog-a", NOW);
    String encoded = selected.encode().toString();
    assertFalse(encoded.contains("account-a")); assertFalse(encoded.contains("dog-a"));
    assertFalse(encoded.contains("Private dog name")); assertFalse(encoded.contains(state.token));
    assertEquals("dog-a", DailyWidgetSelection.decode(new JSONObject(encoded)).resolve(state));
    assertFalse(selected.allDogs());
  }
  @Test public void dogSelectionCannotCrossOwnerLogoutOrAnonymousCache() throws Exception {
    DailyWidgetState state = ownerState("account-a");
    DailyWidgetSelection selected = DailyWidgetSelection.forDog(state, "dog-a", NOW);
    assertNull(selected.resolve(ownerState("account-b")));
    assertNull(selected.resolve(state.begin(null, NOW)));
    assertNull(selected.resolve(DailyWidgetState.empty()));
    assertEquals("dog-a", selected.resolve(ownerState("account-a")));
  }
  @Test public void removedOrUnknownDogNeverBecomesAllDogs() throws Exception {
    DailyWidgetState state = ownerState("account-a");
    DailyWidgetSelection selected = DailyWidgetSelection.forDog(state, "dog-a", NOW);
    JSONObject withoutDog = data().put("dogs", new JSONArray().put(new JSONObject().put("id", "dog-b").put("name", "B")))
      .put("items", new JSONArray());
    DailyWidgetState newer = state.update(state.token, 2, decode(withoutDog), NOW);
    assertNull(selected.resolve(newer)); assertFalse(selected.allDogs());
    assertNull(DailyWidgetSelection.forDog(newer, "dog-a", NOW));
    assertNull(DailyWidgetSelection.forDog(state, "unknown", NOW));
    assertNull(DailyWidgetSelection.forDog(state, "dog-a", NOW + DailyWidgetSnapshot.EXPIRY_MS));
  }
  @Test public void intentionallyAllDogsIsExplicitAndNotMalformedFallback() throws Exception {
    DailyWidgetState state = ownerState("account-a");
    DailyWidgetSelection all = DailyWidgetSelection.forDog(state, null, NOW);
    assertTrue(all.allDogs()); assertTrue(DailyWidgetSelection.decode(all.encode()).allDogs());
    for (JSONObject bad : new JSONObject[]{new JSONObject(), new JSONObject().put("ownerDigest", JSONObject.NULL),
      new JSONObject().put("ownerDigest", 5).put("dogDigest", "bad"),
      all.encode().put("unavailable", "false"), all.encode().put("unavailable", true)}) {
      assertFalse(DailyWidgetSelection.decode(bad).allDogs());
      assertNull(DailyWidgetSelection.decode(bad).resolve(state));
    }
  }
  @Test public void widgetIdReuseAndMissingPreferenceFailClosed() throws Exception {
    DailyWidgetState state = ownerState("account-a");
    JSONObject old = DailyWidgetSelection.forDog(state, "dog-a", NOW).encode().put("binding", "old-nonce");
    assertSame(old, DailyWidgetBinding.reconcile(old, "old-nonce", false));
    assertFalse(DailyWidgetBinding.selection(old, "new-nonce").allDogs());
    assertNull(DailyWidgetBinding.selection(old, "new-nonce").resolve(state));
    assertFalse(DailyWidgetBinding.selection(null, "old-nonce").allDogs());
    JSONObject lost = DailyWidgetBinding.reconcile(null, "old-nonce", false);
    assertFalse(DailyWidgetBinding.selection(lost, "old-nonce").allDogs());
    JSONObject newWidget = DailyWidgetBinding.reconcile(old, "new-nonce", true);
    assertTrue(DailyWidgetBinding.selection(newWidget, "new-nonce").allDogs());
    assertFalse(newWidget.toString().contains(old.getString("dogDigest")));
  }
  @Test public void oldConfigurationDialogCannotSaveAfterOwnerOrSessionSwitch() throws Exception {
    DailyWidgetState state = ownerState("account-a");
    assertNotNull(DailyWidgetBinding.configure(state, state.token, "dog-a", NOW));
    assertNull(DailyWidgetBinding.configure(state.begin(null, NOW), state.token, null, NOW));
    assertNull(DailyWidgetBinding.configure(ownerState("account-b"), state.token, "dog-a", NOW));
    assertNull(DailyWidgetBinding.configure(state.begin(state.ownerDigest, NOW), state.token, "dog-a", NOW));
    assertNull(DailyWidgetBinding.configure(state, state.token, "foreign-dog", NOW));
  }
  @Test public void changedSelectionInvalidatesPreparedViewButKeepsSourceAuthority() throws Exception {
    DailyWidgetState state = ownerState("account-a"), changed = state.touchPresentation();
    assertFalse(changed.canRender(state, NOW)); assertTrue(changed.canRender(changed, NOW));
    assertEquals(state.token, changed.token); assertEquals(state.sequence, changed.sequence);
    assertSame(state.snapshot, changed.snapshot); assertTrue(changed.accepts(state.token, state.sequence + 1));
  }
  @Test public void perDogAppointmentAndPendingSelectorsExcludeOtherAndUnlinkedEvents() throws Exception {
    JSONObject data = data().put("items", new JSONArray()
      .put(item("appointment", "general", NOW + 1, "confirmed", true).put("dogIds", new JSONArray()))
      .put(item("appointment", "other", NOW + 2, "confirmed", true).put("dogIds", new JSONArray().put("dog-b")))
      .put(item("appointment", "own", NOW + 3, "confirmed", true))
      .put(item("appointment", "pending-other", NOW + 1, "pending", false).put("dogIds", new JSONArray().put("dog-b")))
      .put(item("appointment", "pending-own", NOW + 4, "pending", false)));
    DailyWidgetSnapshot snapshot = decode(data);
    assertEquals("general", snapshot.nextAppointment(NOW).id);
    assertEquals("own", snapshot.nextAppointment(NOW, "dog-a").id);
    assertEquals("other", snapshot.nextAppointment(NOW, "dog-b").id);
    assertEquals("pending-own", snapshot.nextPendingAppointment(NOW, "dog-a").id);
    assertNull(snapshot.nextAppointment(NOW, "unknown"));
  }
  @Test public void perDogRemindersIncludeSharedReferencesButExcludeGeneralAndOther() throws Exception {
    JSONObject data = data().put("items", new JSONArray()
      .put(item("reminder", "general", NOW + 1, "confirmed", false).put("dogIds", new JSONArray()))
      .put(item("reminder", "other", NOW + 2, "confirmed", false).put("dogIds", new JSONArray().put("dog-b")))
      .put(item("reminder", "own", NOW + 3, "pending", false))
      .put(item("reminder", "both", NOW + 4, "confirmed", false).put("dogIds", new JSONArray().put("dog-a").put("dog-b")))
      .put(item("reminder", "tomorrow", NOW + 86400000, "confirmed", false)));
    DailyWidgetSnapshot snapshot = decode(data);
    assertEquals(4, snapshot.reminderCount(NOW)); assertEquals(2, snapshot.reminderCount(NOW, "dog-a"));
    assertEquals(2, snapshot.reminderCount(NOW, "dog-b")); assertEquals(0, snapshot.reminderCount(NOW, "unknown"));
  }

}
