import { readFileSync } from 'fs';

const src = (path: string) => readFileSync(path, 'utf8');

describe('keyboard-aware form layouts', () => {
  it('keeps the heat-cycle notes form scrollable above the keyboard', () => {
    const file = src('app/dog-heat/[id].tsx');

    expect(file).toContain('KeyboardAvoidingView');
    expect(file).toContain("behavior={Platform.OS === 'ios' ? 'padding' : 'height'}");
    expect(file).toContain('contentContainerStyle={[s.scroll, { paddingBottom: 32 + insets.bottom }]}');
    expect(file).toContain('keyboardShouldPersistTaps="handled"');
    expect(file).toContain("keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}");
    // The detail screen has notes input and save button in the edit form
    expect(file).toMatch(/value=\{editNotes\}[\s\S]*multiline/);
    expect(file).toMatch(/AnyvoButton[\s\S]*label=\{t\('common\.save'\)/);
  });

  it('keeps the health notes form scrollable above the keyboard', () => {
    const file = src('app/dog-health/[id].tsx');

    expect(file).toContain('KeyboardAvoidingView');
    expect(file).toContain("behavior={Platform.OS === 'ios' ? 'padding' : 'height'}");
    expect(file).toContain('contentContainerStyle={[s.scroll, { paddingBottom: 32 + insets.bottom }]}');
    expect(file).toContain('keyboardShouldPersistTaps="handled"');
    expect(file).toContain("keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}");
    expect(file).toMatch(/<TextInput[\s\S]*value=\{note\}[\s\S]*multiline[\s\S]*<AnyvoButton label=\{t\('common\.save'\)\}/);
  });

  it('keeps the trainer plan save button inside the keyboard avoiding area', () => {
    const file = src('app/trainer/plan-neu.tsx');
    const kavBlock = file.slice(file.indexOf('<KeyboardAvoidingView'), file.indexOf('</KeyboardAvoidingView>'));

    expect(kavBlock).toContain('<ScrollView');
    expect(kavBlock).toContain('value={notes} onChangeText={setNotes} multiline');
    expect(kavBlock).toContain('style={[s.saveBtn, saving && { opacity: 0.6 }]}');
  });

  it('keeps the "Kommando hinzufügen" save button reachable above the keyboard', () => {
    const file = src('app/dog-command/edit.tsx');
    const kavBlock = file.slice(file.indexOf('<KeyboardAvoidingView'), file.indexOf('</KeyboardAvoidingView>'));

    expect(file).toContain('KeyboardAvoidingView');
    expect(file).toContain("behavior={Platform.OS === 'ios' ? 'padding' : 'height'}");
    expect(file).toContain('contentContainerStyle={[s.scroll, { paddingBottom: 32 + insets.bottom }]}');
    expect(file).toContain('keyboardShouldPersistTaps="handled"');
    expect(file).toContain("keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}");
    // Save-Button und alle Textfelder liegen INNERHALB des KeyboardAvoidingView —
    // nicht danebem/darunter platziert, sonst würde die Tastatur ihn trotzdem verdecken.
    expect(kavBlock).toContain('<ScrollView');
    expect(kavBlock).toContain('value={name} onChangeText={setName}');
    expect(kavBlock).toContain('value={verbal} onChangeText={setVerbal}');
    expect(kavBlock).toMatch(/AnyvoButton label=\{t\('common\.save'\)\}/);
  });
});
