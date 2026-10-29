package expo.modules.anyvodailywidget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.RemoteViews;
import java.text.DateFormat;
import java.util.Date;
import java.util.TimeZone;

/** Presentation only. Never reads auth, databases, health records or network. */
public final class AnyvoDailyWidgetProvider extends AppWidgetProvider {
  static final String BINDING_OPTION = "anyvo_daily_widget_binding_v1";
  static String ensureBinding(Context context, AppWidgetManager manager, int id) throws Exception {
    Bundle options = manager.getAppWidgetOptions(id);
    String binding = options.getString(BINDING_OPTION);
    if (binding == null || binding.length() > 64 || binding.isEmpty()) {
      binding = java.util.UUID.randomUUID().toString(); options.putString(BINDING_OPTION, binding);
      DailyWidgetStore.reconcileBinding(context, id, binding, true);
      manager.updateAppWidgetOptions(id, options);
    } else DailyWidgetStore.reconcileBinding(context, id, binding, false);
    return binding;
  }
  @Override public void onDeleted(Context context, int[] ids) {
    DailyWidgetStore.removeConfigurations(context, ids);
  }
  @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
    for (int id : ids) {
      try { ensureBinding(context, manager, id); } catch (Exception ignored) { continue; }
      update(context, manager, id, manager.getAppWidgetOptions(id), DailyWidgetStore.read(context));
    }
  }
  @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
    try { ensureBinding(context, manager, id); } catch (Exception ignored) { return; }
    update(context, manager, id, manager.getAppWidgetOptions(id), DailyWidgetStore.read(context));
  }
  @Override public void onReceive(Context context, Intent intent) {
    super.onReceive(context, intent);
    String action = intent.getAction();
    if (Intent.ACTION_LOCALE_CHANGED.equals(action) || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
        || Intent.ACTION_TIME_CHANGED.equals(action) || Intent.ACTION_DATE_CHANGED.equals(action)
        || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) refresh(context);
  }
  static void refresh(Context context) {
    AppWidgetManager manager = AppWidgetManager.getInstance(context);
    int[] ids = manager.getAppWidgetIds(new ComponentName(context, AnyvoDailyWidgetProvider.class));
    new AnyvoDailyWidgetProvider().onUpdate(context, manager, ids);
    AnyvoDailyWidgetConfigureActivity.notifyChanged();
  }
  private static void update(Context context, AppWidgetManager manager, int id, Bundle options, DailyWidgetState state) {
    float scale = Math.max(1f, context.getResources().getConfiguration().fontScale);
    boolean landscape = context.getResources().getConfiguration().orientation
      == android.content.res.Configuration.ORIENTATION_LANDSCAPE;
    int width = options.getInt(landscape ? AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH
      : AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 180);
    int height = options.getInt(landscape ? AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT
      : AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 180));
    boolean minimal = height < Math.round(180 * scale);
    boolean expanded = !minimal && width >= Math.round(280 * scale) && height >= Math.round(260 * scale);
    RemoteViews view = new RemoteViews(context.getPackageName(), minimal ? R.layout.anyvo_daily_minimal
      : expanded ? R.layout.anyvo_daily_expanded : R.layout.anyvo_daily_compact);
    long now = System.currentTimeMillis(); DailyWidgetSnapshot snapshot = state.snapshot;
    DailyWidgetSelection selection = DailyWidgetStore.selection(context, id, options.getString(BINDING_OPTION, ""));
    String selectedDog = null;
    try { if (selection != null) selectedDog = selection.resolve(state); } catch (Exception ignored) { }
    boolean unavailable = selection != null && !selection.allDogs() && selectedDog == null;
    boolean valid = !unavailable && state.ownerDigest != null && snapshot != null && !snapshot.isExpired(now)
      && TimeZone.getDefault().hasSameRules(TimeZone.getTimeZone(snapshot.timeZone));
    String summary = context.getString(R.string.anyvo_daily_open);
    String details = context.getString(state.ownerDigest == null ? R.string.anyvo_daily_login : R.string.anyvo_daily_refresh);
    String status = "";
    if (valid) {
      DailyWidgetSnapshot.Item next = snapshot.nextAppointment(now, selectedDog);
      DailyWidgetSnapshot.Item pending = snapshot.nextPendingAppointment(now, selectedDog);
      int reminders = snapshot.reminderCount(now, selectedDog);
      summary = next == null ? context.getString(R.string.anyvo_daily_no_appointment)
        : context.getString(R.string.anyvo_daily_appointment, format(context, next.startAtMs, now));
      if (next != null && !next.dogIds.isEmpty()) summary += " · "
        + context.getResources().getQuantityString(R.plurals.anyvo_daily_for_dogs, next.dogIds.size(), next.dogIds.size());
      details = context.getResources().getQuantityString(R.plurals.anyvo_daily_dogs, selectedDog == null ? snapshot.dogs.size() : 1, selectedDog == null ? snapshot.dogs.size() : 1)
        + " · " + context.getResources().getQuantityString(R.plurals.anyvo_daily_reminders, reminders, reminders);
      if (pending != null) details += " · " + context.getString(R.string.anyvo_daily_pending, format(context, pending.startAtMs, now));
      if (!state.availability.equals("ready")) status = context.getString(
        state.availability.equals("offline") ? R.string.anyvo_daily_offline : R.string.anyvo_daily_error);
      else if (now >= snapshot.freshUntilMs) status = context.getString(R.string.anyvo_daily_stale);
      if (snapshot.truncated) status = context.getString(R.string.anyvo_daily_partial)
        + (status.isEmpty() ? "" : " · " + status);
      status = context.getString(R.string.anyvo_daily_as_of, format(context, snapshot.generatedAtMs, now))
        + (status.isEmpty() ? "" : " · " + status);
    }
    if (unavailable && state.ownerDigest != null && snapshot != null) {
      summary = context.getString(R.string.anyvo_daily_selection_unavailable);
      details = context.getString(R.string.anyvo_daily_configure);
    }
    view.setTextViewText(R.id.anyvo_daily_summary, minimal ? context.getString(R.string.anyvo_daily_open) : summary);
    if (!minimal) {
      view.setTextViewText(R.id.anyvo_daily_details, details);
      view.setTextViewText(R.id.anyvo_daily_status, status);
    }
    Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
    if (launch != null) {
      launch.setAction(Intent.ACTION_VIEW); launch.removeCategory(Intent.CATEGORY_LAUNCHER);
      // The app rechecks its fresh session. No cached event/dog identity travels in the URL.
      launch.setData(Uri.parse("anyvo://widgets/today"));
      launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      PendingIntent action = PendingIntent.getActivity(context, 70401, launch,
        PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
      view.setOnClickPendingIntent(R.id.anyvo_daily_root, action);
      if (expanded) view.setOnClickPendingIntent(R.id.anyvo_daily_action, action);
    }
    DailyWidgetStore.renderCurrent(context, state, () -> manager.updateAppWidget(id, view));
  }
  private static String formatTime(Context context, long epoch) {
    return android.text.format.DateFormat.getTimeFormat(context).format(new Date(epoch));
  }
  private static String format(Context context, long epoch, long now) {
    Date date = new Date(epoch);
    java.util.Calendar a = java.util.Calendar.getInstance(), b = java.util.Calendar.getInstance();
    a.setTimeInMillis(epoch); b.setTimeInMillis(now);
    if (a.get(java.util.Calendar.YEAR) == b.get(java.util.Calendar.YEAR)
        && a.get(java.util.Calendar.DAY_OF_YEAR) == b.get(java.util.Calendar.DAY_OF_YEAR)) return formatTime(context, epoch);
    return DateFormat.getDateInstance(DateFormat.SHORT, context.getResources().getConfiguration().getLocales().get(0))
      .format(date) + " " + formatTime(context, epoch);
  }
}
