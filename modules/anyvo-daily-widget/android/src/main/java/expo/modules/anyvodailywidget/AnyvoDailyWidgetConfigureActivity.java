package expo.modules.anyvodailywidget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ComponentName;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ArrayAdapter;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Set;
import java.util.WeakHashMap;

/** Only phone configuration may show names. No name/ID leaves this Activity result. */
public final class AnyvoDailyWidgetConfigureActivity extends Activity {
  private static final Set<AnyvoDailyWidgetConfigureActivity> LIVE = Collections.newSetFromMap(new WeakHashMap<>());
  private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
  private DailyWidgetState displayed;
  private String binding;
  private final ArrayList<String> dogIds = new ArrayList<>();
  private ListView choices;
  private TextView hint;
  private boolean hasPendingChoice;
  private String pendingDogDigest;
  static void notifyChanged() {
    ArrayList<AnyvoDailyWidgetConfigureActivity> active;
    synchronized (LIVE) { active = new ArrayList<>(LIVE); }
    for (AnyvoDailyWidgetConfigureActivity activity : active)
      activity.runOnUiThread(() -> { if (!activity.isFinishing()) activity.renderChoices(); });
  }
  private boolean validWidget() {
    AppWidgetProviderInfo info = AppWidgetManager.getInstance(this).getAppWidgetInfo(widgetId);
    return widgetId != AppWidgetManager.INVALID_APPWIDGET_ID && info != null
      && new ComponentName(this, AnyvoDailyWidgetProvider.class).equals(info.provider);
  }
  @Override public void onCreate(Bundle state) {
    super.onCreate(state); setResult(RESULT_CANCELED);
    widgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
    if (!validWidget()) { finish(); return; }
    try { binding = AnyvoDailyWidgetProvider.ensureBinding(this, AppWidgetManager.getInstance(this), widgetId); }
    catch (Exception ignored) { finish(); return; }
    LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(0xff111319);
    int padding = Math.round(18 * getResources().getDisplayMetrics().density);
    root.setPadding(padding, padding, padding, padding);
    root.setOnApplyWindowInsetsListener((view, insets) -> {
      if (Build.VERSION.SDK_INT >= 30) {
        android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
        view.setPadding(padding + safe.left, padding + safe.top, padding + safe.right, padding + safe.bottom);
      } else view.setPadding(padding + insets.getSystemWindowInsetLeft(), padding + insets.getSystemWindowInsetTop(),
        padding + insets.getSystemWindowInsetRight(), padding + insets.getSystemWindowInsetBottom());
      return insets;
    });
    TextView title = new TextView(this); title.setText(R.string.anyvo_daily_configure);
    title.setTextColor(0xff15e6c3); title.setTextSize(22); root.addView(title);
    hint = new TextView(this); hint.setTextColor(0xffd0d4d9); hint.setTextSize(14); root.addView(hint);
    choices = new ListView(this); choices.setChoiceMode(ListView.CHOICE_MODE_SINGLE);
    root.addView(choices, new LinearLayout.LayoutParams(-1, 0, 1));
    choices.setOnItemClickListener((parent, view, position, id) -> {
      if (position < dogIds.size()) {
        try { pendingDogDigest = dogIds.get(position) == null ? null : DailyWidgetSelection.digest(dogIds.get(position)); hasPendingChoice = true; }
        catch (Exception ignored) { hasPendingChoice = false; }
      }
    });
    Button save = new Button(this); save.setText(R.string.anyvo_daily_save); save.setOnClickListener(v -> save()); root.addView(save);
    Button cancel = new Button(this); cancel.setText(R.string.anyvo_daily_cancel); cancel.setOnClickListener(v -> finish()); root.addView(cancel);
    setContentView(root); root.requestApplyInsets(); synchronized (LIVE) { LIVE.add(this); }
    renderChoices();
  }
  @Override protected void onResume() { super.onResume(); if (choices != null) renderChoices(); }
  @Override protected void onDestroy() { synchronized (LIVE) { LIVE.remove(this); } super.onDestroy(); }
  private void renderChoices() {
    if (choices == null || !validWidget()) return;
    DailyWidgetState fresh = DailyWidgetStore.read(this);
    if (displayed != null && !displayed.token.equals(fresh.token)) { hasPendingChoice = false; pendingDogDigest = null; }
    displayed = fresh; dogIds.clear(); dogIds.add(null);
    ArrayList<String> names = new ArrayList<>(); names.add(getString(R.string.anyvo_daily_all_dogs));
    DailyWidgetSnapshot snapshot = displayed.snapshot;
    if (displayed.ownerDigest != null && snapshot != null && !snapshot.isExpired(System.currentTimeMillis()))
      for (DailyWidgetSnapshot.Dog dog : snapshot.dogs) {
        dogIds.add(dog.id); names.add(dog.name.trim().isEmpty() ? getString(R.string.anyvo_daily_dog_slot, names.size()) : dog.name);
      }
    hint.setText(displayed.ownerDigest == null ? R.string.anyvo_daily_login
      : snapshot == null ? R.string.anyvo_daily_refresh : R.string.anyvo_daily_choose_dog);
    choices.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_list_item_single_choice, names));
    DailyWidgetSelection selection = DailyWidgetStore.selection(this, widgetId, binding);
    String chosen = null;
    try { if (selection != null) chosen = selection.resolve(displayed); } catch (Exception ignored) { }
    int checked = chosen != null ? dogIds.indexOf(chosen) : selection != null && selection.allDogs() ? 0 : -1;
    if (hasPendingChoice) {
      checked = pendingDogDigest == null ? 0 : -1;
      for (int i = 1; i < dogIds.size(); i++) try { if (pendingDogDigest != null && pendingDogDigest.equals(DailyWidgetSelection.digest(dogIds.get(i)))) checked = i; } catch (Exception ignored) { }
    }
    choices.clearChoices();
    if (checked >= 0) choices.setItemChecked(checked, true);
    else hint.setText(R.string.anyvo_daily_selection_unavailable);
  }
  private void save() {
    if (!validWidget() || displayed == null || choices.getCheckedItemPosition() < 0) return;
    int selected = choices.getCheckedItemPosition(); if (selected >= dogIds.size()) return;
    try {
      String currentBinding = AppWidgetManager.getInstance(this).getAppWidgetOptions(widgetId)
        .getString(AnyvoDailyWidgetProvider.BINDING_OPTION, "");
      if (!binding.equals(currentBinding) || !DailyWidgetStore.configure(this, widgetId, binding, displayed.token, dogIds.get(selected))) {
        renderChoices(); hint.setText(R.string.anyvo_daily_configuration_changed); return;
      }
      AnyvoDailyWidgetProvider.refresh(this);
      setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)); finish();
    } catch (Exception ignored) { hint.setText(R.string.anyvo_daily_error); }
  }
}
