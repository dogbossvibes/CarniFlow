import { claimGreeting, firstName, greetingKey, GREETING_DURATION_MS, publicUsername } from '../greetingModel';
test.each([[4,59,'evening'],[5,0,'morning'],[10,59,'morning'],[11,0,'day'],[17,59,'day'],[18,0,'evening'],[0,0,'evening']])('local boundary %s:%s', (h,m,part) => {
  expect(greetingKey(new Date(2026,9,21,Number(h),Number(m)))).toBe(`greeting.${part}`);
});
test('uses the current local clock on timezone change', () => {
  const date = new Date(); jest.spyOn(date,'getHours').mockReturnValueOnce(10).mockReturnValueOnce(18);
  expect(greetingKey(date)).toBe('greeting.morning'); expect(greetingKey(date)).toBe('greeting.evening');
});
test.each([null,undefined,{},'', '  ', 'owner@example.com', 'bad\nname'])('rejects missing/private/invalid name %s', value => expect(firstName(value)).toBeNull());
test('trims names without leaking email and validates public handles', () => {
  expect(firstName('  Moyo   Mustermann ')).toBe('Moyo'); expect(publicUsername('moyo_1')).toBe('moyo_1');
  expect(publicUsername('a@b.ch')).toBeNull(); expect(publicUsername('')).toBeNull();
});
test('refocus and account A-B-A never replay in the same app process', () => {
  expect(claimGreeting('A')).toBe(true); expect(claimGreeting('A')).toBe(false);
  expect(claimGreeting('B')).toBe(true); expect(claimGreeting('A')).toBe(false); expect(GREETING_DURATION_MS).toBe(2040);
});
