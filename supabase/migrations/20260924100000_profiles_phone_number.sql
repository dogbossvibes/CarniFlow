-- ANYVO: Optional central profile phone number for emergency contact display.
-- Additive and nullable: existing users and profile flows remain valid.
alter table public.profiles
  add column if not exists phone_number text null;
