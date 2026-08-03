import { StyleSheet, View } from 'react-native';
import { Input } from '@/components/ui/Input';
import { useT } from '@/i18n';
import { ChipSelect, DOG_CUSTOM_DISCIPLINE, DOG_DISCIPLINES } from './ChipSelect';

// Re-Export: Speicherlogik lebt beim Sentinel in ChipSelect.tsx (i18n-frei testbar).
export { disciplineToStored } from './ChipSelect';

// Sparten-Auswahl für das Hundeprofil: feste Sparten als Chips plus optionale
// freie „Eigene Sparte"-Eingabe. `value` ist entweder '' (nichts gewählt), eine
// feste Sparte, der Custom-Sentinel (gewählt, aber noch leer) oder der freie Text.
export function DisciplinePicker({
  value, onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useT();
  const isCustom = value !== '' && !(DOG_DISCIPLINES as readonly string[]).includes(value);

  return (
    <View style={s.wrap}>
      <ChipSelect
        label={t('dog.discipline')}
        options={[...DOG_DISCIPLINES, DOG_CUSTOM_DISCIPLINE]}
        labels={{ [DOG_CUSTOM_DISCIPLINE]: t('dog.customDiscipline') }}
        value={isCustom ? DOG_CUSTOM_DISCIPLINE : value}
        onChange={onChange}
      />
      {isCustom ? (
        <Input
          label={t('dog.customDiscipline')}
          placeholder={t('dog.customDisciplinePlaceholder')}
          value={value === DOG_CUSTOM_DISCIPLINE ? '' : value}
          onChangeText={onChange}
          autoCapitalize="words"
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 14 },
});
