import { categoryLabel, isHealthDocument } from '@/features/dogs/documentCategories';

describe('health document classification', () => {
  it('keeps legacy health kinds visible', () => {
    expect(isHealthDocument({ kind: 'impfpass', category: null })).toBe(true);
    expect(isHealthDocument({ kind: 'hd_ed', category: null })).toBe(true);
    expect(isHealthDocument({ kind: 'stammbaum', category: null })).toBe(false);
  });

  it('prefers the new category metadata without hiding non-health documents', () => {
    expect(isHealthDocument({ kind: 'sonstiges', category: 'health', subtype: 'lab' })).toBe(true);
    expect(isHealthDocument({ kind: 'impfpass', category: 'other', subtype: 'other' })).toBe(false);
    expect(isHealthDocument({ kind: 'sonstiges', category: 'insurance', subtype: 'other' })).toBe(false);
  });

  it('labels the health category instead of falling back to other', () => {
    expect(categoryLabel('health')).toBe('Gesundheit');
  });
});
