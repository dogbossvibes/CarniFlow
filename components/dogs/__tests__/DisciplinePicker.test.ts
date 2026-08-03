import { disciplineToStored, DOG_CUSTOM_DISCIPLINE } from '../ChipSelect';

describe('disciplineToStored', () => {
  it('maps a fixed discipline to its trimmed value', () => {
    expect(disciplineToStored('IGP')).toBe('IGP');
    expect(disciplineToStored('  Agility  ')).toBe('Agility');
  });

  it('maps a custom discipline text to its trimmed value', () => {
    expect(disciplineToStored('Hoopers')).toBe('Hoopers');
    expect(disciplineToStored('  Rally Obedience ')).toBe('Rally Obedience');
  });

  it('maps empty selection to null', () => {
    expect(disciplineToStored('')).toBeNull();
  });

  it('maps the custom sentinel (selected, but empty) to null', () => {
    expect(disciplineToStored(DOG_CUSTOM_DISCIPLINE)).toBeNull();
  });
});
