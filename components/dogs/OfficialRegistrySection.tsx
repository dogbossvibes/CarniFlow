import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { Input } from '@/components/ui/Input';
import { useT, type TranslationKey } from '@/i18n';
import type { DogRegistryType } from '@/types';
import {
  COUNTRY_REGISTRY_TYPES,
  REGISTRY_COUNTRIES,
  defaultRegistryType,
  isFixedRegistryCountry,
  registryNameEditable,
  registryNameRequired,
  registryUrl,
  type RegistryCountry,
  type RegistryDraft,
} from '@/features/dogs/registry';

const TYPE_LABEL_KEY: Record<DogRegistryType, TranslationKey> = {
  amicus:                'officialRegistration.types.amicus',
  tasso:                 'officialRegistration.types.tasso',
  findefix:              'officialRegistration.types.findefix',
  official_dog_register: 'officialRegistration.types.officialDogRegister',
  austria_pet_database:  'officialRegistration.types.austriaPetDatabase',
  other:                 'officialRegistration.types.other',
};

const COUNTRY_LABEL_KEY: Record<RegistryCountry, TranslationKey> = {
  CH:    'officialRegistration.countries.CH',
  DE:    'officialRegistration.countries.DE',
  AT:    'officialRegistration.countries.AT',
  OTHER: 'officialRegistration.countries.other',
};

export function OfficialRegistrySection({
  value,
  onChange,
}: {
  value: RegistryDraft;
  onChange: (v: RegistryDraft) => void;
}) {
  const { t } = useT();
  const country = value.countryCode;
  const fixedType = defaultRegistryType(country);          // CH/AT/OTHER → einziger Typ; DE → null
  const effectiveType = fixedType ?? value.registryType;
  const nameEditable = registryNameEditable(effectiveType);
  const url = registryUrl(effectiveType);

  const selectCountry = (c: RegistryCountry) => {
    if (c === country) return;
    const nextType = defaultRegistryType(c);               // CH/AT/OTHER gesetzt, DE null
    onChange({
      countryCode: c,
      registryType: nextType,
      registryName: registryNameEditable(nextType) ? value.registryName : '',
      registrationNumber: value.registrationNumber,
    });
  };

  const selectType = (ty: DogRegistryType) => {
    onChange({
      ...value,
      registryType: ty,
      registryName: registryNameEditable(ty) ? value.registryName : '',
    });
  };

  const openRegistry = async () => {
    if (!url) return;
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) throw new Error('cannot open');
      await Linking.openURL(url);
    } catch (e) {
      if (__DEV__) console.error('[registry] openURL failed', e);
      Alert.alert(t('officialRegistration.title'), t('officialRegistration.errors.linkUnavailable'));
    }
  };

  return (
    <View>
      <Text style={s.gruppeLabel}>{t('officialRegistration.title')}</Text>
      <View style={s.felder}>
        {/* Land */}
        <View>
          <Text style={s.label}>{t('officialRegistration.country')}</Text>
          <View style={s.chipRow}>
            {REGISTRY_COUNTRIES.map((c) => {
              const aktiv = country === c;
              return (
                <TouchableOpacity
                  key={c}
                  style={[s.chip, aktiv && s.chipAktiv]}
                  onPress={() => selectCountry(c)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.chipText, aktiv && s.chipTextAktiv]}>{t(COUNTRY_LABEL_KEY[c])}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {country && (
          <>
            {/* Register: DE = Auswahl, CH/AT = fester Name, OTHER = kein Feld (freier Name unten) */}
            {country === 'DE' ? (
              <View>
                <Text style={s.label}>{t('officialRegistration.registry')}</Text>
                <View style={s.chipRow}>
                  {COUNTRY_REGISTRY_TYPES.DE.map((ty) => {
                    const aktiv = value.registryType === ty;
                    return (
                      <TouchableOpacity
                        key={ty}
                        style={[s.chip, aktiv && s.chipAktiv]}
                        onPress={() => selectType(ty)}
                        activeOpacity={0.8}
                      >
                        <Text style={[s.chipText, aktiv && s.chipTextAktiv]}>{t(TYPE_LABEL_KEY[ty])}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : isFixedRegistryCountry(country) && effectiveType ? (
              <View>
                <Text style={s.label}>{t('officialRegistration.registry')}</Text>
                <View style={s.fixedRow}>
                  <Text style={s.fixedText}>{t(TYPE_LABEL_KEY[effectiveType])}</Text>
                </View>
              </View>
            ) : null}

            {/* Registername: nur bei other (Pflicht) / official_dog_register (optional) */}
            {nameEditable && (
              <Input
                label={t('officialRegistration.registryName')}
                placeholder={t('officialRegistration.registryName')}
                value={value.registryName}
                onChangeText={(v) => onChange({ ...value, registryName: v })}
                autoCapitalize="words"
              />
            )}

            {/* Registrierungsnummer (immer optional) */}
            <Input
              label={t('officialRegistration.registrationNumber')}
              placeholder={t('officialRegistration.registrationNumber')}
              value={value.registrationNumber}
              onChangeText={(v) => onChange({ ...value, registrationNumber: v })}
              autoCapitalize="characters"
            />

            {/* Register öffnen: nur bei bekannter offizieller URL */}
            {url && (
              <TouchableOpacity style={s.linkBtn} onPress={openRegistry} activeOpacity={0.8}>
                <Ionicons name="open-outline" size={16} color={C.accent} />
                <Text style={s.linkText}>{t('officialRegistration.openRegistry')}</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <Text style={s.disclaimer}>{t('officialRegistration.disclaimer')}</Text>
      </View>
    </View>
  );
}

// Wiederverwendete Regel für die Screens (nur bei „Anderes" Registername Pflicht).
export { registryNameRequired };

const s = StyleSheet.create({
  gruppeLabel: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 14 },
  felder:      { gap: 16, marginBottom: 22 },
  label:       { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.input,
  },
  chipAktiv:     { borderColor: C.accent, backgroundColor: C.accentDim },
  chipText:      { fontSize: 13.5, color: C.muted, fontWeight: '600' },
  chipTextAktiv: { color: C.accent, fontWeight: '700' },
  fixedRow: {
    height: 50, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.input, justifyContent: 'center', paddingHorizontal: 16,
  },
  fixedText: { fontSize: 15, color: C.white, fontWeight: '600' },
  linkBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 48, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.input,
  },
  linkText: { fontSize: 14, color: C.accent, fontWeight: '700' },
  disclaimer: { fontSize: 12, color: C.muted, lineHeight: 18 },
});
