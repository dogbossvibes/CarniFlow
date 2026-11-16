package expo.modules.anyvodailywidget;

import android.content.Context;
import android.util.AtomicFile;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** App-private derived data only, excluded from backup and credential-protected. */
final class DailyWidgetStore {
  private static final Object LOCK = new Object();
  private static DailyWidgetState cached;
  private static String cachedPath;
  private static AtomicFile file(Context context) {
    return new AtomicFile(new File(context.getNoBackupFilesDir(), "anyvo-daily-widget-v1.json"));
  }
  private static DailyWidgetState load(Context context) {
    AtomicFile file = file(context); String path = file.getBaseFile().getPath();
    if (cached != null && path.equals(cachedPath)) return cached;
    cachedPath = path; cached = DailyWidgetState.empty();
    try (FileInputStream input = file.openRead(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
      byte[] chunk = new byte[1024]; int count;
      while ((count = input.read(chunk)) != -1) {
        if (bytes.size() + count > DailyWidgetSnapshot.MAX_BYTES + 2048) return cached;
        bytes.write(chunk, 0, count);
      }
      cached = DailyWidgetCacheCodec.decode(new String(bytes.toByteArray(), StandardCharsets.UTF_8), System.currentTimeMillis());
      if (cached.ownerDigest == null) file.delete();
    } catch (Exception ignored) { file.delete(); /* Derived cache only; no customer source data. */ }
    return cached;
  }
  private static void persist(Context context, DailyWidgetState state) throws Exception {
    String encoded = DailyWidgetCacheCodec.encode(state);
    AtomicFile file = file(context); FileOutputStream stream = null;
    try {
      stream = file.startWrite(); stream.write(encoded.getBytes(StandardCharsets.UTF_8));
      file.finishWrite(stream);
    } catch (Exception error) { if (stream != null) file.failWrite(stream); throw error; }
  }
  static String begin(Context context, String ownerId) throws Exception {
    synchronized (LOCK) {
      if (ownerId != null && (ownerId.trim().isEmpty() || ownerId.length() > 256)) throw new IllegalArgumentException("Invalid widget owner");
      String digest = ownerId == null ? null : DailyWidgetSelection.digest(ownerId);
      DailyWidgetState previous = load(context);
      DailyWidgetState next = previous.begin(digest, System.currentTimeMillis());
      // Invalidate in-memory authority first, including on exceptional disk failure.
      cached = next;
      if (digest == null || !digest.equals(previous.ownerDigest)) {
        file(context).delete();
        if (file(context).getBaseFile().exists()
            || new File(file(context).getBaseFile().getPath() + ".bak").exists()
            || new File(file(context).getBaseFile().getPath() + ".new").exists())
          throw new java.io.IOException("Unable to clear widget cache");
      }
      persist(context, next);
      return next.token;
    }
  }
  static boolean update(Context context, String token, long sequence, String json) throws Exception {
    DailyWidgetSnapshot snapshot;
    try { snapshot = DailyWidgetSnapshot.decode(json, System.currentTimeMillis()); }
    catch (Exception ignored) { return false; }
    synchronized (LOCK) {
      DailyWidgetState next = load(context).update(token, sequence, snapshot, System.currentTimeMillis());
      if (next == null) return false;
      persist(context, next); cached = next; return true;
    }
  }
  static boolean availability(Context context, String token, long sequence, String availability) throws Exception {
    synchronized (LOCK) {
      DailyWidgetState next = load(context).availability(token, sequence, availability);
      if (next == null) return false;
      persist(context, next); cached = next; return true;
    }
  }
  static DailyWidgetState read(Context context) {
    synchronized (LOCK) {
      DailyWidgetState current = load(context), next = current.expire(System.currentTimeMillis());
      if (next != current) {
        cached = next;
        try { persist(context, next); } catch (Exception ignored) { file(context).delete(); }
      }
      return next;
    }
  }
  static boolean renderCurrent(Context context, DailyWidgetState captured, Runnable render) {
    synchronized (LOCK) {
      // Serialize the actual Binder submission with logout/owner/sequence changes.
      // A token check before leaving the lock would leave another race window.
      if (!read(context).canRender(captured, System.currentTimeMillis())) return false;
      render.run(); return true;
    }
  }
  private static AtomicFile selectionFile(Context context) {
    return new AtomicFile(new File(context.getNoBackupFilesDir(), "anyvo-daily-widget-selection-v1.json"));
  }
  private static JSONObject selections(Context context) {
    try (FileInputStream input = selectionFile(context).openRead(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
      byte[] chunk = new byte[1024]; int count;
      while ((count = input.read(chunk)) != -1) {
        if (bytes.size() + count > 65536) throw new java.io.IOException("Widget preference limit");
        bytes.write(chunk, 0, count);
      }
      JSONObject value = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
      if (!(value.opt("version") instanceof Integer) || value.getInt("version") != 1) throw new IllegalArgumentException("Unknown preference version");
      return value.getJSONObject("widgets");
    } catch (Exception ignored) { return new JSONObject(); }
  }
  private static void saveSelections(Context context, JSONObject widgets) throws Exception {
    byte[] bytes = new JSONObject().put("version", 1).put("widgets", widgets).toString().getBytes(StandardCharsets.UTF_8);
    if (bytes.length > 65536) throw new IllegalArgumentException("Widget preference limit");
    AtomicFile file = selectionFile(context); FileOutputStream stream = null;
    try { stream = file.startWrite(); stream.write(bytes); file.finishWrite(stream); }
    catch (Exception error) { if (stream != null) file.failWrite(stream); throw error; }
  }
  static void reconcileBinding(Context context, int widgetId, String binding, boolean newBinding) throws Exception {
    synchronized (LOCK) {
      JSONObject all = selections(context), old = all.optJSONObject(Integer.toString(widgetId));
      JSONObject reconciled = DailyWidgetBinding.reconcile(old, binding, newBinding);
      if (reconciled == old) return;
      all.put(Integer.toString(widgetId), reconciled);
      saveSelections(context, all); cached = read(context).touchPresentation();
    }
  }
  static DailyWidgetSelection selection(Context context, int widgetId, String binding) {
    synchronized (LOCK) {
      JSONObject raw = selections(context).optJSONObject(Integer.toString(widgetId));
      return DailyWidgetBinding.selection(raw, binding);
    }
  }
  static boolean configure(Context context, int widgetId, String binding, String token, String dogId) throws Exception {
    synchronized (LOCK) {
      DailyWidgetState state = read(context);
      DailyWidgetSelection selected = DailyWidgetBinding.configure(state, token, dogId, System.currentTimeMillis());
      if (selected == null) return false;
      JSONObject all = selections(context), old = all.optJSONObject(Integer.toString(widgetId));
      if (old == null || !binding.equals(old.optString("binding", ""))) return false;
      all.put(Integer.toString(widgetId), selected.encode().put("binding", binding));
      saveSelections(context, all); cached = state.touchPresentation(); return true;
    }
  }
  static void removeConfigurations(Context context, int[] ids) {
    synchronized (LOCK) {
      JSONObject all = selections(context);
      for (int id : ids) all.remove(Integer.toString(id));
      try { saveSelections(context, all); cached = read(context).touchPresentation(); } catch (Exception ignored) { }
    }
  }
}
