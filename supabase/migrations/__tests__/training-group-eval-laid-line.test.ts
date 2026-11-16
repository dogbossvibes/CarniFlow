/**
 * Gruppentraining #146 (Variante B): gelegte Linie nur bei selbst gelegter Fährte — statische Prüfung.
 * Verhalten gegen PostgreSQL: supabase/local/training_group_eval_laid_line_cases.sql
 * (ältere App sendet die Linie mit, Bestandszeilen, neue App, selbst gelegt, Rechte).
 */
import { readFileSync, readdirSync } from 'fs';

const file = '20261116233000_training_group_eval_laid_line.sql';
const sql = readFileSync(`supabase/migrations/${file}`, 'utf8');
const code = sql.replace(/^--.*$/gm, '');
const topLevel = code.replace(/\$function\$[\s\S]*?\$function\$/g, '$function$');

describe('#146 gelegte Linie nur bei selbst gelegter Fährte', () => {
  it('eindeutiger Zeitstempel', () => {
    expect(readdirSync('supabase/migrations').filter(f => f.startsWith(file.slice(0, 14)))).toEqual([file]);
  });
  it('rein additiv: nur Funktionen, keine Tabelle, Spalte oder Zeile wird geändert', () => {
    expect(topLevel).not.toMatch(/\b(drop |truncate|delete from|update public\.|insert into|alter table|create table)/i);
    expect(code).not.toMatch(/update public\.training_private_evaluations set package=(?!coalesce)/i);
  });
  it('speichert die gelegte Linie nur, wenn die teilende Person selbst gelegt hat', () => {
    expect(code).toContain("if tv.layer_id<>u then pkg:=jsonb_set(pkg,'{laid}','[]'::jsonb); end if;");
    expect(code).toContain("if ev.layer_id<>ev.handler_id then pkg:=jsonb_set(pkg,'{laid}','[]'::jsonb); end if;");
  });
  it('liefert die gelegte Linie nur bei layer_id = handler_id aus (auch Bestandszeilen)', () => {
    expect(code).toContain("'laid',case when e.layer_id=e.handler_id then e.package->'laid' else '[]'::jsonb end");
    expect(code).not.toMatch(/jsonb_build_object\('laid',e\.package->'laid'/);
  });
  it('leere gelegte Linie ist gültig, sonst weiter 2 bis 5000 Punkte; Schlüssel unverändert', () => {
    expect(code).toContain("(jsonb_array_length(pkg->'laid')<>0 and jsonb_array_length(pkg->'laid') not between 2 and 5000)");
    expect(code).toContain("<>array['laid','metrics','search','version']");
    expect(code).toContain("jsonb_array_length(pkg->'search') not between 2 and 10000");
  });
  it('Stand nennt der Hundeführerin, ob die gelegte Linie mitgeht', () => {
    expect(code).toContain("'laidLineShared',layer=u,");
  });
  it('Endpunkt weiter nur für angemeldete Personen, Hilfsfunktionen geschlossen', () => {
    expect(topLevel).toMatch(/grant execute on function public\.training_group_eval_v1\(text, jsonb\) to authenticated;/);
    expect(topLevel).not.toMatch(/grant execute on function public\.training_private_evaluation_\w+\([^)]*\) to [^;]*authenticated/);
  });
});
