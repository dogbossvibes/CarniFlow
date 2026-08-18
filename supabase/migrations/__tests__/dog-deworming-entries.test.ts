import { readFileSync } from 'fs';

const sql = readFileSync('supabase/migrations/20260817190000_dog_deworming_entries.sql', 'utf8');

describe('dog deworming migration', () => {
  it('is additive and restricts every operation to the owner of the referenced dog', () => {
    expect(sql).toMatch(/create table if not exists public\.dog_deworming_entries/);
    expect(sql).toMatch(/owner_id\s+uuid not null references auth\.users/);
    expect(sql).toMatch(/dog_id\s+uuid not null references public\.dogs/);
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('owner_id = auth.uid()');
    expect(sql).toMatch(/d\.id = dog_deworming_entries\.dog_id/);
    expect(sql).toMatch(/d\.owner_id = auth\.uid\(\)/);
    expect(sql).not.toContain('public.connections');
  });

  it('stores only owner-selected next dates and no medical interval default', () => {
    expect(sql).toMatch(/next_due_date\s+date/);
    expect(sql).toMatch(/next_due_date is null or next_due_date >= treatment_date/);
    expect(sql).not.toMatch(/next_due_date[^\n]*default/i);
    expect(sql).not.toMatch(/months?\s*\+/i);
  });
});
