import { readFileSync } from 'fs';

// Statischer Vertrag der Mitteilungs-Migration (Spec 04, PR D). Wirkung: supabase/local/training_group_plan_notify_cases.sql.
const strip = (s: string) => s.replace(/--.*$/gm, '');
const sql = strip(readFileSync('supabase/migrations/20261127120000_training_group_plan_notify.sql', 'utf8'));
const stage3 = strip(readFileSync('supabase/migrations/20261116170000_training_group_stage3.sql', 'utf8'));
const fn = (src: string, name: string) => { const i = src.indexOf(`create or replace function public.${name}(`); return src.slice(i, src.indexOf('$function$;', src.indexOf('as $function$', i) + 13)); };
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('Migration training_group_plan_notify', () => {
  it('ändert keine Daten, nur additive Spalte und erweiterte Arten', () => {
    expect(sql).not.toMatch(/\b(delete\s+from|truncate|drop\s+table|drop\s+function)\b/i);
    // Einzige Schreibvorgänge: Einstellungen der Person selbst (unverändert aus Stufe 3) und der Ausgang.
    expect((sql.match(/update\s+public\.(\w+)/gi) ?? []).map(x => x.split('.')[1])).toEqual(['group_notify_settings']);
    expect(sql).toContain('add column if not exists plans boolean not null default true');
    expect(sql).toContain("'training_started','plan_published','plan_changed','plan_lay_turn'");
  });
  it('bestehende Texte, Regeln und Einstellungen bleiben wortgleich erhalten', () => {
    for (const name of ['group_notify_text', 'group_notify_enqueue', 'training_group_notify_v1']) {
      const now = norm(fn(sql, name));
      for (const line of fn(stage3, name).split('\n').map(norm).filter(Boolean)) {
        if (/when 'track_searched' then st\.track_searched else st\.training_started end,|x not in \('joinRequests','trackReady','trackSearched','trainingStarted'\)\)|'trainingStarted',coalesce\(st\.training_started,false\)\)\);/.test(line)) continue;
        expect([name, now.includes(line)]).toEqual([name, true]);
      }
    }
  });
  it('nie an sich selbst und nie bei Blockierung (unveränderte Einreihung)', () => {
    expect(fn(sql, 'group_notify_enqueue')).toContain('if recipient is null or recipient = actor then return; end if;');
    expect(fn(sql, 'group_notify_enqueue')).toContain('public.contact_is_blocked(recipient, actor)');
  });
  it('Auslöser verhindern nie eine Planänderung und sind nicht aufrufbar', () => {
    for (const name of ['group_notify_plan_status', 'group_notify_plan_entry', 'group_notify_plan_track_lying']) {
      expect(fn(sql, name)).toContain('exception when others then return null;');
      expect(sql).toContain(`revoke all on function public.${name}() from public, anon, authenticated;`);
    }
    expect(sql.match(/grant execute on function [^;]+ to authenticated;/g)).toEqual(['grant execute on function public.training_group_notify_v1(text, jsonb) to authenticated;']);
  });
  it('Mitteilungen ohne Treffpunkt', () => {
    for (const name of ['group_notify_plan_status', 'group_notify_plan_entry', 'group_notify_plan_next_layer']) expect(fn(sql, name)).not.toContain('meeting_point');
  });
});
