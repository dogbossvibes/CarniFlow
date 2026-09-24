import { readFileSync } from 'fs';

const source = readFileSync('lib/supabase.ts', 'utf8');

describe('Supabase release configuration guard', () => {
  it('requires explicit environment configuration and rejects silent fallbacks', () => {
    expect(source).toContain('EXPO_PUBLIC_BACKEND_ENV');
    expect(source).toContain('EXPO_PUBLIC_SUPABASE_URL is required.');
    expect(source).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY is required.');
    expect(source).toContain("production: 'axkkhyqrjrtbkumaulta'");
    expect(source).toContain("staging: 'cbhrxkjclakzlvajyvfn'");
    expect(source).not.toMatch(/\?\?\s*['"]https:\/\/axkkhyqrjrtbkumaulta/);
    expect(source).not.toMatch(/\?\?\s*['"]eyJ/);
  });

  it('exports the validated backend environment for the QA indicator', () => {
    expect(source).toContain('export const SUPABASE_BACKEND_ENV');
    expect(source).toContain('Supabase project does not match');
  });
});
