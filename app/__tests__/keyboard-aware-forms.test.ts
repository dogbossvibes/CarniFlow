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
    expect(file).toMatch(/<TextInput[\s\S]*value=\{notes\}[\s\S]*multiline[\s\S]*<AnyvoButton label=\{t\('common\.save'\)\}/);
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
});
