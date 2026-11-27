import { activeDisciplines, ageInMonths, buildCoachInput, examsFromBook, localToday, profileDisciplines, sessionsFromUnits, toCoachDiscipline, trackFromRow } from '../input';
import { buildCoachWeek } from '..';

const TODAY = '2026-11-27';

describe('Coach-Eingabe aus App-Daten', () => {
  it('Sparten aus Freitext und System-Schlüssel', () => {
    expect(toCoachDiscipline('Fährte')).toBe('faehrte');
    expect(toCoachDiscipline('system:unterordnung')).toBe('unterordnung');
    expect(toCoachDiscipline('Schutzdienst')).toBe('schutzdienst');
    expect(toCoachDiscipline('Mantrailing')).toBe('mantrailing');
    expect(toCoachDiscipline('Obedience')).toBe('obedience');
    expect(toCoachDiscipline('Agility')).toBe('other');
    expect(toCoachDiscipline(null)).toBe('other');
    expect(profileDisciplines('IGP')).toEqual(['faehrte', 'unterordnung', 'schutzdienst']);
    expect(profileDisciplines('Mondioring')).toEqual([]);
  });

  it('Einheit mit Übungen: je Sparte ein Eintrag, Lernstufen zählen nicht als Bewertung', () => {
    const out = sessionsFromUnits([{
      session_date: '2026-11-20', rating: 3, score: null, duration_sec: 3600,
      exercises: [
        { discipline: 'Unterordnung', rating: 4, duration_sec: 600 },
        { discipline: 'Unterordnung', rating: 2, duration_sec: 600 },
        { discipline: 'Schutzdienst', rating: 5, rating_scale: 'lernstufe' },
      ],
    }]);
    expect(out).toEqual([
      { date: '2026-11-20', discipline: 'unterordnung', rating: 3, durationMinutes: 20 },
      { date: '2026-11-20', discipline: 'schutzdienst', rating: 3, durationMinutes: null },
    ]);
  });

  it('Einheit ohne Übungen: Score 1–10 wird auf 1–5 umgerechnet; ungültiges Datum fällt weg', () => {
    expect(sessionsFromUnits([{ session_date: '2026-11-20', rating: null, score: 7, duration_sec: null }])[0].rating).toBe(3.5);
    expect(sessionsFromUnits([{ session_date: 'kaputt', rating: 3, score: null, duration_sec: null }])).toEqual([]);
  });

  it('Fährte: Winkelabweichung aus gespeicherter Auswertung, ältere Fährten ohne Auswertung ohne Zahlen', () => {
    const t = trackFromRow({
      session_date: '2026-11-25', lying_time_minutes: 30, articles_found: 3, articles_total: 3,
      track_data: { plan: { length: 600 }, run: { analytics: { corners: [{ maxLateralDeviationM: 2.5 }, { maxLateralDeviationM: null }] } } },
    });
    expect(t).toEqual({ date: '2026-11-25', lyingMinutes: 30, cornerDeviationsM: [2.5, null], articlesFound: 3, articlesTotal: 3, lengthSteps: 600 });
    expect(trackFromRow({ session_date: '2026-11-25', track_data: null })?.cornerDeviationsM).toEqual([]);
    expect(trackFromRow({})).toBeNull();
  });

  it('Prüfungsbuch: nur kommende, nicht gelöschte Einträge', () => {
    const rows = [
      { exam_date: '2026-12-20', exam_type: 'igp' },
      { exam_date: '2026-10-01', exam_type: 'bh' },
      { exam_date: '2026-12-21', exam_type: 'fh', deleted_at: '2026-11-01' },
    ];
    expect(examsFromBook(rows, TODAY, r => r.exam_type.toUpperCase())).toEqual([{ date: '2026-12-20', examType: 'igp', label: 'IGP' }]);
  });

  it('Alter in Monaten; fehlend oder in der Zukunft = unbekannt', () => {
    expect(ageInMonths('2025-11-28', TODAY)).toBe(11);
    expect(ageInMonths('2025-11-27', TODAY)).toBe(12);
    expect(ageInMonths(null, TODAY)).toBeNull();
    expect(ageInMonths('2027-01-01', TODAY)).toBeNull();
  });

  it('aktive Sparten: Profil, letzte 90 Tage, Prüfungen; alte Trainings und «other» nicht', () => {
    const d = activeDisciplines(null,
      [{ date: '2026-11-01', discipline: 'obedience', rating: null, durationMinutes: null },
       { date: '2026-01-01', discipline: 'schutzdienst', rating: null, durationMinutes: null },
       { date: '2026-11-01', discipline: 'other', rating: null, durationMinutes: null }],
      [], [{ date: '2026-12-20', examType: 'bh', label: 'BH' }], TODAY);
    expect(d).toEqual(['unterordnung', 'obedience']);
  });

  it('ganzer Weg: App-Daten → Woche mit echten Zahlen; ohne Daten no_data', () => {
    const input = buildCoachInput({
      today: TODAY, dog: { id: 'dog-1', birth_date: '2022-05-01', discipline: 'IGP' },
      units: [{ session_date: '2026-11-17', rating: 4, score: null, duration_sec: 1800, exercises: [{ discipline: 'Unterordnung', rating: 4 }] }],
      trackRows: [], exams: [], inHeat: null, dismissedKeys: [], disabledRules: [],
    });
    const week = buildCoachWeek(input, { isPro: true });
    expect(week.state).toBe('ok');
    expect(week.suggestions.find(s => s.discipline === 'unterordnung')?.reasons[0].params).toEqual({ days: 10 });
    const empty = buildCoachInput({ today: TODAY, dog: { id: 'd', birth_date: null, discipline: null }, units: [], trackRows: [], exams: [], inHeat: null, dismissedKeys: [], disabledRules: [] });
    expect(buildCoachWeek(empty, { isPro: false }).state).toBe('no_data');
  });

  it('lokaler Kalendertag', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
