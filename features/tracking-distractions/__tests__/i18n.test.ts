import i18n from '@/i18n/config';
import { distractionDisplayName } from '../i18n';
it.each(['de', 'gsw', 'en', 'fr', 'it'])('renders a numbered default name in %s using the actual app interpolation', language => {
 const name = i18n.getFixedT(language, 'distractions')('defaultName', { number: 2 });
 expect(name).toContain('2'); expect(name).not.toMatch(/[{}]/); expect(name).not.toBe('defaultName');
});

it('repairs only exact legacy default labels for display and preserves chosen names', () => {
 expect(distractionDisplayName('Verleitung {{number}}')).toBe('Verleitung');
 expect(distractionDisplayName('Fausse piste {{number}}')).toBe('Fausse piste');
 expect(distractionDisplayName('Querlinie {{number}}')).toBe('Querlinie {{number}}');
 expect(distractionDisplayName('Verleitung 2')).toBe('Verleitung 2');
});
