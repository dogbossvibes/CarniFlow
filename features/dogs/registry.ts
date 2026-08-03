import type { Dog, DogRegistryType } from '@/types';

// Landesspezifische offizielle Hunderegistrierung — reine Logik/Config, damit sie
// isoliert testbar ist und keine URLs im UI hartcodiert werden.

export type RegistryCountry = 'CH' | 'DE' | 'AT' | 'OTHER';
export const REGISTRY_COUNTRIES: RegistryCountry[] = ['CH', 'DE', 'AT', 'OTHER'];

// Welche Registertypen sind je Land wählbar. CH/AT/OTHER sind eindeutig (ein Typ),
// nur DE bietet eine echte Auswahl.
export const COUNTRY_REGISTRY_TYPES: Record<RegistryCountry, DogRegistryType[]> = {
  CH:    ['amicus'],
  DE:    ['tasso', 'findefix', 'official_dog_register', 'other'],
  AT:    ['austria_pet_database'],
  OTHER: ['other'],
};

// Bekannte offizielle „Register öffnen"-URLs. NUR Einträge hier bekommen einen
// Öffnen-Button. austria_pet_database bewusst ohne Link, bis eine kanonische
// öffentliche Portal-URL feststeht; official_dog_register/other haben keinen festen Link.
export const REGISTRY_URLS: Partial<Record<DogRegistryType, string>> = {
  amicus:   'https://www.amicus.ch',
  tasso:    'https://www.tasso.net',
  findefix: 'https://www.findefix.com',
};

export function registryUrl(type: DogRegistryType | null | undefined): string | null {
  if (!type) return null;
  return REGISTRY_URLS[type] ?? null;
}

// Eindeutiges Land → fester Registertyp (kein Dropdown, Name nicht editierbar).
export function defaultRegistryType(country: RegistryCountry | null): DogRegistryType | null {
  if (!country) return null;
  const types = COUNTRY_REGISTRY_TYPES[country];
  return types.length === 1 ? types[0] : null;
}

// Land eindeutig (fester Registername, kein Dropdown nötig)?
export function isFixedRegistryCountry(country: RegistryCountry | null): boolean {
  return defaultRegistryType(country) != null && country !== 'OTHER';
}

// Braucht der Typ ein editierbares Registername-Feld?
//  - 'other'                 → Pflicht (freier Name)
//  - 'official_dog_register' → optional (Behördenname)
export function registryNameEditable(type: DogRegistryType | null): boolean {
  return type === 'other' || type === 'official_dog_register';
}
export function registryNameRequired(type: DogRegistryType | null): boolean {
  return type === 'other';
}

export interface RegistryDraft {
  countryCode:        RegistryCountry | null;
  registryType:       DogRegistryType | null;
  registryName:       string;
  registrationNumber: string;
}

export const EMPTY_REGISTRY_DRAFT: RegistryDraft = {
  countryCode: null, registryType: null, registryName: '', registrationNumber: '',
};

// Validierung → i18n-Key oder null (kein Fehler). Registrierungsnummer ist immer
// optional; Registername nur bei „Anderes" Pflicht.
export function validateRegistry(d: RegistryDraft): string | null {
  if (registryNameRequired(d.registryType) && !d.registryName.trim()) {
    return 'officialRegistration.errors.registryNameRequired';
  }
  return null;
}

type DogRegistryFields = Pick<Dog,
  'registry_country_code' | 'registry_type' | 'registry_name' | 'registry_number' | 'tasso_registered'>;

// Alt-Daten nicht still verlieren: hat der Hund keine neuen registry_*-Daten, aber
// den alten tasso_registered-Schalter gesetzt, wird DE/tasso vorbelegt (Nummer leer).
export function draftFromDog(dog: DogRegistryFields): RegistryDraft {
  const hasNew = !!dog.registry_country_code || !!dog.registry_type;
  if (!hasNew && dog.tasso_registered) {
    return { countryCode: 'DE', registryType: 'tasso', registryName: '', registrationNumber: '' };
  }
  return {
    countryCode:        (dog.registry_country_code as RegistryCountry | null) ?? null,
    registryType:       dog.registry_type ?? null,
    registryName:       dog.registry_name ?? '',
    registrationNumber: dog.registry_number ?? '',
  };
}

// Draft → additive DB-Spalten. Ohne gewähltes Land bleibt alles null (bestehende
// Hunde ohne Registrierung bleiben unverändert speicherbar).
export function draftToColumns(d: RegistryDraft): Pick<Dog,
  'registry_country_code' | 'registry_type' | 'registry_name' | 'registry_number'> {
  if (!d.countryCode) {
    return { registry_country_code: null, registry_type: null, registry_name: null, registry_number: null };
  }
  const type = defaultRegistryType(d.countryCode) ?? d.registryType;
  const nameApplies = registryNameEditable(type);
  return {
    registry_country_code: d.countryCode,
    registry_type:         type,
    registry_name:         nameApplies ? (d.registryName.trim() || null) : null,
    registry_number:       d.registrationNumber.trim() || null,
  };
}
