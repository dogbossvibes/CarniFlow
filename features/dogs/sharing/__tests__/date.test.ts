import { sharedRecordDate } from '../date';
jest.mock('@/i18n/format', () => ({ formatDate: (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }));
it('keeps PostgreSQL calendar dates local, including UTC-negative zones', () => {
  expect(sharedRecordDate('2026-10-30')).toBe('2026-10-30');
});
it('interprets true timestamps as instants in the device timezone', () => {
  const instant = new Date('2026-10-30T00:30:00Z');
  const expected = `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, '0')}-${String(instant.getDate()).padStart(2, '0')}`;
  expect(sharedRecordDate('2026-10-30T00:30:00Z')).toBe(expected);
});
it.each(['invalid', '2026-02-31', '2026-13-01'])('does not display malformed dates %s', value => {
  expect(sharedRecordDate(value)).toBe('');
});
