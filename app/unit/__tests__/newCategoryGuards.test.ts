import { readFileSync } from 'fs';

// Statische Verdrahtungs-/Sicherheitsprüfung für die Anlage einer eigenen
// Trainings-Sparte (analog app/track/__tests__/tracking-ux-safety.test.ts) —
// deckt Dinge ab, die ein Render-Test dieses recht grossen Formulars unnötig
// aufwendig machen würde, aber eindeutig aus dem Quelltext ablesbar sind.
describe('eigene Sparte — Anlage-Screen (app/unit/new-category.tsx)', () => {
  const src = readFileSync('app/unit/new-category.tsx', 'utf8');
  const service = readFileSync('services/customCategoryService.ts', 'utf8');

  it('verhindert einen leeren Namen vor dem Speichern', () => {
    expect(src).toContain('const trimmed = name.trim();');
    expect(src).toContain("if (!trimmed) { Alert.alert(t('training.categoryNameMissing'), t('training.categoryNameMissingBody')); return; }");
  });

  it('übersetzt den vom Nutzer eingegebenen Namen nicht — trimmed wird 1:1 gespeichert', () => {
    expect(src).toContain('const payload = { name: trimmed, icon, color, exercises };');
    expect(src).not.toContain('t(name)');
    expect(src).not.toContain('t(trimmed)');
  });

  it('nutzt für Erstellen UND Bearbeiten dieselbe Persistenz-Schicht (keine zweite Implementierung)', () => {
    expect(src).toContain('createCustomCategory, updateCustomCategory');
    expect(src).toContain('editing');
    expect(src).toContain('? await updateCustomCategory(id!, payload)');
    expect(src).toContain(': await createCustomCategory(ownerId, payload)');
  });

  it('Löschen bricht keine bestehenden Trainings — keine Kaskade/Referenz auf training_exercises im Service', () => {
    expect(service).not.toContain('training_exercises');
    expect(service).not.toContain('training_sessions');
  });

  it('alle sichtbaren UI-Texte laufen über i18n (t(...)), keine hardcodierten deutschen Strings ausser dem Platzhalter', () => {
    // Jede Text-/Label-/Alert-Stelle im Formular geht durch t(...); der einzige
    // von Nutzern eingegebene, bewusst nicht übersetzte Wert ist `name`/`trimmed`.
    expect(src).toContain("t('training.customCategory')");
    expect(src).toContain("t('training.editCategory')");
    expect(src).toContain("t('training.categoryNamePlaceholder')");
    expect(src).toContain("t('training.saveCategory')");
    expect(src).toContain("t('training.deleteCategory')");
    expect(src).toContain("t('training.deleteCategoryTitle')");
    expect(src).toContain("t('training.deleteCategoryBody')");
  });
});

describe('eigene Sparte — Einstiegspunkte in Training/Create/Edit', () => {
  const start = readFileSync('app/unit/start.tsx', 'utf8');
  const document = readFileSync('app/unit/document.tsx', 'utf8');

  it('start.tsx (Training starten) bietet „Eigene Sparte hinzufügen" an', () => {
    expect(start).toContain("router.push('/unit/new-category')");
    expect(start).toContain("t('training.createCategory')");
  });

  it('document.tsx (Training nachträglich dokumentieren) bietet denselben Einstieg — keine zweite Implementierung', () => {
    expect(document).toContain("router.push('/unit/new-category')");
    expect(document).toContain("t('training.createCategory')");
  });

  it('beide Screens laden dieselbe useCustomCategories-Quelle (Supabase custom_categories, persistiert über App-Neustart hinweg)', () => {
    expect(start).toContain("import { useCustomCategories } from '@/hooks/useCustomCategories';");
    expect(document).toContain("import { useCustomCategories } from '@/hooks/useCustomCategories';");
  });
});
