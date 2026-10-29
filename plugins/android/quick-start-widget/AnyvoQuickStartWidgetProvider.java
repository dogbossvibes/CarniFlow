package __APPLICATION_ID__.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.RemoteViews;
import __APPLICATION_ID__.R;

/** Stateless navigation only. No GPS, user data, background work or network. */
public final class AnyvoQuickStartWidgetProvider extends AppWidgetProvider {
  private static final int EXPANDED_WIDTH_DP = 260;
  private static final String[] DESTINATIONS = {
    "anyvo://track", "anyvo://track/legen", "anyvo://track/historie"
  };

  @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
    for (int id : ids) update(context, manager, id, manager.getAppWidgetOptions(id));
  }

  @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager,
      int id, Bundle options) {
    update(context, manager, id, options);
  }

  @Override public void onReceive(Context context, Intent intent) {
    super.onReceive(context, intent);
    if (Intent.ACTION_LOCALE_CHANGED.equals(intent.getAction())) {
      AppWidgetManager manager = AppWidgetManager.getInstance(context);
      int[] ids = manager.getAppWidgetIds(new ComponentName(context, getClass()));
      onUpdate(context, manager, ids);
    }
  }

  private static void update(Context context, AppWidgetManager manager, int id, Bundle options) {
    // Keep labels readable when the user increases system font size.
    int expandedWidth = Math.round(EXPANDED_WIDTH_DP
      * Math.max(1f, context.getResources().getConfiguration().fontScale));
    boolean expanded = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) >= expandedWidth;
    RemoteViews views = new RemoteViews(context.getPackageName(), expanded
      ? R.layout.anyvo_widget_medium : R.layout.anyvo_widget_small);
    bind(context, views, R.id.anyvo_widget_lay, 1);
    if (expanded) {
      bind(context, views, R.id.anyvo_widget_tracks, 0);
      bind(context, views, R.id.anyvo_widget_logbook, 2);
    }
    manager.updateAppWidget(id, views);
  }

  private static void bind(Context context, RemoteViews views, int viewId, int action) {
    // Resolve our own launcher explicitly; another app cannot intercept the URI.
    Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
    if (intent == null) return;
    intent.setAction(Intent.ACTION_VIEW);
    intent.removeCategory(Intent.CATEGORY_LAUNCHER);
    intent.setData(Uri.parse(DESTINATIONS[action]));
    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    // Same destination may safely share an immutable pending intent across widgets.
    PendingIntent pending = PendingIntent.getActivity(context, action, intent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    views.setOnClickPendingIntent(viewId, pending);
  }
}
