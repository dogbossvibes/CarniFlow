import {
  COUNTRY_REGISTRY_TYPES,
  defaultRegistryType,
  isFixedRegistryCountry,
  registryUrl,
  registryNameEditable,
  registryNameRequired,
  validateRegistry,
  draftFromDog,
  draftToColumns,
  EMPTY_REGISTRY_DRAFT,
  type RegistryDraft,
} from '@/features/dogs/registry';
import type { Dog } from '@/types';

const dogFields = (over: Partial<Pick<Dog,
  'registry_country_code' | 'registry_type' | 'registry_name' | 'registry_number' | 'tasso_registered'>> = {}) => ({
  registry_country_code: null,
  registry_type: null,
  registry_name: null,
  registry_number: null,
  tasso_registered: null,
  ...over,
});

describe('registry — Länder/Register', () => {
  it('Schweiz zeigt AMICUS als festen Typ', () => {
    expect(COUNTRY_REGISTRY_TYPES.CH).toEqual(['amicus']);
    expect(defaultRegistryType('CH')).toBe('amicus');
    expect(isFixedRegistryCountry('CH')).toBe(true);
  });

  it('Österreich zeigt Heimtierdatenbank als festen Typ', () => {
    expect(defaultRegistryType('AT')).toBe('austria_pet_database');
    expect(isFixedRegistryCountry('AT')).toBe(true);
  });

  it('Deutschland bietet vier Registertypen zur Auswahl (kein fester Typ)', () => {
    expect(COUNTRY_REGISTRY_TYPES.DE).toEqual(['tasso', 'findefix', 'official_dog_register', 'other']);
    expect(defaultRegistryType('DE')).toBeNull();
    expect(isFixedRegistryCountry('DE')).toBe(false);
  });

  it('OTHER erzwingt Typ "other" (freier Name), ist aber nicht "fixed"', () => {
    expect(defaultRegistryType('OTHER')).toBe('other');
    expect(isFixedRegistryCountry('OTHER')).toBe(false);
  });
});

describe('registry — Links', () => {
  it('nur bekannte offizielle Register haben eine URL', () => {
    expect(registryUrl('amicus')).toMatch(/amicus\.ch/);
    expect(registryUrl('tasso')).toMatch(/tasso\.net/);
    expect(registryUrl('findefix')).toMatch(/findefix\.com/);
  });
  it('ohne bekannte URL kein Link', () => {
    expect(registryUrl('official_dog_register')).toBeNull();
    expect(registryUrl('austria_pet_database')).toBeNull();
    expect(registryUrl('other')).toBeNull();
    expect(registryUrl(null)).toBeNull();
  });
});

describe('registry — Registername/Validierung', () => {
  it('Name ist nur bei "other" Pflicht, bei official_dog_register optional', () => {
    expect(registryNameRequired('other')).toBe(true);
    expect(registryNameRequired('official_dog_register')).toBe(false);
    expect(registryNameEditable('official_dog_register')).toBe(true);
    expect(registryNameEditable('tasso')).toBe(false);
  });

  it('validateRegistry verlangt Namen nur bei "other"', () => {
    const other: RegistryDraft = { countryCode: 'OTHER', registryType: 'other', registryName: '', registrationNumber: '' };
    expect(validateRegistry(other)).toBe('officialRegistration.errors.registryNameRequired');
    expect(validateRegistry({ ...other, registryName: 'Mein Register' })).toBeNull();
  });

  it('Speichern ohne Registrierungsnummer ist erlaubt', () => {
    const ch: RegistryDraft = { countryCode: 'CH', registryType: 'amicus', registryName: '', registrationNumber: '' };
    expect(validateRegistry(ch)).toBeNull();
    expect(validateRegistry(EMPTY_REGISTRY_DRAFT)).toBeNull();
  });
});

describe('registry — Alt-Daten (draftFromDog)', () => {
  it('alter TASSO-Datensatz → DE/tasso vorbelegt', () => {
    expect(draftFromDog(dogFields({ tasso_registered: true }))).toEqual({
      countryCode: 'DE', registryType: 'tasso', registryName: '', registrationNumber: '',
    });
  });

  it('bestehender Hund ohne Daten → leerer Draft', () => {
    expect(draftFromDog(dogFields())).toEqual(EMPTY_REGISTRY_DRAFT);
  });

  it('vorhandene neue Registry-Daten haben Vorrang vor Legacy-TASSO', () => {
    expect(draftFromDog(dogFields({
      registry_country_code: 'CH', registry_type: 'amicus', registry_number: 'A-1', tasso_registered: true,
    }))).toEqual({ countryCode: 'CH', registryType: 'amicus', registryName: '', registrationNumber: 'A-1' });
  });
});

describe('registry — draftToColumns', () => {
  it('CH → amicus, kein editierbarer Name', () => {
    expect(draftToColumns({ countryCode: 'CH', registryType: null, registryName: 'x', registrationNumber: ' 123 ' }))
      .toEqual({ registry_country_code: 'CH', registry_type: 'amicus', registry_name: null, registry_number: '123' });
  });

  it('DE/other mit freiem Namen', () => {
    expect(draftToColumns({ countryCode: 'DE', registryType: 'other', registryName: ' Stadtregister ', registrationNumber: '' }))
      .toEqual({ registry_country_code: 'DE', registry_type: 'other', registry_name: 'Stadtregister', registry_number: null });
  });

  it('kein Land → alle Spalten null', () => {
    expect(draftToColumns(EMPTY_REGISTRY_DRAFT))
      .toEqual({ registry_country_code: null, registry_type: null, registry_name: null, registry_number: null });
  });
});
