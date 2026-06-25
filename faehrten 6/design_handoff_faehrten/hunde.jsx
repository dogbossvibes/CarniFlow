// ANYVO — Hunde (Liste + Detailprofil), reichhaltige Infos
(function () {
  const I = window.Icon, C = window.Chrome;
  const { useState } = React;

  // ── sample dogs (Malu & Yam, echte Eckdaten + angereichert) ──
  const DOGS = [
    {
      id: 'malu', name: 'Malu', breed: 'Holländischer Schäferhund', breedShort: 'Herder',
      sex: 'Hündin', sexSym: '♀', age: '6 J.', ageExact: 6.8, weight: 23, color: 'Gestromt',
      c1: '#15e6c3', c2: '#0a7d72', sport: 'IGP-FH', level: 'FH 2', best: 96,
      tracks: 38, trainings: 25, streak: 4, chip: '276 098 100 234 417', tasso: 'TASSO · 14.09.2019', breeder: 'vom Heidewald',
      birthday: '14.09.2019', vet: 'TA Dr. Brunner', vaccine: '03/2026', feed: 'getreidefrei',
      heart: 'gesund', activity: [3,5,2,6,4,7,5,9], months: ['Nov','Dez','Jan','Feb','Mär','Apr','Mai','Jun'],
      recent: [['IGP', '23.06.2026', 92], ['Fährte · Acker', '21.06.2026', 94], ['Unterordnung', '18.06.2026', null]],
    },
    {
      id: 'yam', name: 'Yam', breed: 'Holländischer Schäferhund', breedShort: 'Herder',
      sex: 'Rüde', sexSym: '♂', age: '3 J.', ageExact: 3.2, weight: 29, color: 'Gestromt',
      c1: '#8ad7ff', c2: '#3a7bd1', sport: 'IGP', level: 'IGP 1', best: 89,
      tracks: 17, trainings: 19, streak: 2, chip: '276 098 100 877 731', tasso: 'TASSO · 02.03.2023', breeder: 'von der Wupperaue',
      birthday: '02.03.2023', vet: 'TA Dr. Brunner', vaccine: '11/2025', feed: 'BARF',
      heart: 'gesund', activity: [2,3,4,3,5,4,6,7], months: ['Nov','Dez','Jan','Feb','Mär','Apr','Mai','Jun'],
      recent: [['Fährte · Wiese', '22.06.2026', 89], ['IGP', '19.06.2026', 84], ['Apportieren', '15.06.2026', null]],
    },
  ];

  // ── shared atoms ──
  const Screen = ({ children }) => <div className="anyvo" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000' }}>{children}</div>;

  function Photo({ dog, style, round = 18, children }) {
    return (
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: round,
        background: `linear-gradient(150deg, ${dog.c1}, ${dog.c2} 72%)`, ...style }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.16, color: '#03241f',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <I.paw w={Math.min(style?.width || 56, style?.height || 56) * 0.62}/>
        </div>
        <span style={{ position: 'absolute', left: round*0.55, bottom: round*0.4, fontFamily: 'Archivo',
          fontWeight: 800, color: '#04241f', fontSize: Math.min(style?.width||56,(style?.height||56)) * 0.34, opacity: 0.9 }}>{dog.name[0]}</span>
        {children}
      </div>
    );
  }

  function Pill({ children, tint, icon }) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 999,
        background: tint ? 'var(--acc-dim)' : 'rgba(255,255,255,0.06)', border: '1px solid ' + (tint ? 'rgba(21,230,195,0.4)' : 'var(--line)'),
        color: tint ? 'var(--acc)' : 'rgba(255,255,255,0.78)', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
        {icon}{children}
      </span>
    );
  }

  function FAB({ onClick, icon }) {
    return (
      <button onClick={onClick} style={{ width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
        background: 'var(--acc)', color: '#04201b', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 10px 26px -8px var(--acc-glow)' }}>{icon || <I.plus w={24}/>}</button>
    );
  }

  // ══════════════════ LISTE · Variante A (reiche Karten) ══════════════════
  function ListRich({ onOpen }) {
    return (
      <Screen>
        <div style={{ padding: '56px 20px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 7 }}>Deine Hunde</div>
            <div className="display" style={{ fontSize: 34 }}>Meine Hunde</div>
          </div>
          <FAB/>
        </div>
        <div className="scroll" style={{ flex: 1, padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 13 }}>
          {DOGS.map(d => (
            <button key={d.id} onClick={() => onOpen(d.id)} className="card" style={{ padding: 14, textAlign: 'left', cursor: 'pointer', color: '#fff' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <Photo dog={d} style={{ width: 76, height: 76 }} round={20}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em' }}>{d.name}</span>
                    <span style={{ fontSize: 13, color: 'var(--faint)' }}>{d.sexSym}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 1 }}>{d.breedShort} · {d.color}</div>
                  <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
                    <Pill tint icon={<I.medal w={13}/>}>{d.level}</Pill>
                    <Pill>{d.age}</Pill>
                    <Pill icon={<I.weight w={13}/>}>{d.weight} kg</Pill>
                    <Pill icon={<I.chip w={13}/>}>gechippt</Pill>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', marginTop: 14, paddingTop: 13, borderTop: '1px solid var(--line)' }}>
                {[[d.trainings, 'Trainings'], [d.tracks, 'Fährten'], [d.best, 'Bestwert'], [d.streak + ' T', 'Serie']].map((s, i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center', borderLeft: i ? '1px solid var(--line)' : 'none' }}>
                    <div className="num" style={{ fontSize: 18, fontWeight: 800, color: i === 3 ? 'var(--acc)' : '#fff' }}>{s[0]}</div>
                    <div className="label-cap" style={{ fontSize: 8, marginTop: 2 }}>{s[1]}</div>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
        <C.BottomNav active="Hunde"/>
      </Screen>
    );
  }

  // ══════════════════ LISTE · Variante B (kompakt + Sparte-Akzent) ══════════════════
  function ListCompact({ onOpen }) {
    return (
      <Screen>
        <div style={{ padding: '56px 20px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 7 }}>2 Hunde · 1 Team</div>
            <div className="display" style={{ fontSize: 34 }}>Meine Hunde</div>
          </div>
          <FAB/>
        </div>
        <div className="scroll" style={{ flex: 1, padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {DOGS.map(d => (
            <button key={d.id} onClick={() => onOpen(d.id)} className="card" style={{ padding: 0, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', color: '#fff' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 13 }}>
                <Photo dog={d} style={{ width: 64, height: 64 }} round={18}>
                  <div style={{ position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: '50%',
                    background: d.c1, border: '2px solid rgba(0,0,0,0.4)' }}/>
                </Photo>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 20, fontWeight: 800 }}>{d.name}</span>
                    <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{d.age} · {d.sex}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>{d.breedShort}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--acc)', fontSize: 12.5, fontWeight: 700 }}>
                      <I.medal w={14}/> {d.sport} · {d.level}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', paddingRight: 2 }}>
                  <div className="display num" style={{ fontSize: 26, color: 'var(--acc)' }}>{d.best}</div>
                  <div className="label-cap" style={{ fontSize: 8 }}>Bestwert</div>
                </div>
              </div>
              {/* mini activity sparkline strip */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 30, padding: '0 14px 12px' }}>
                {d.activity.map((v, i) => (
                  <div key={i} style={{ flex: 1, height: (v / 9 * 100) + '%', borderRadius: 2,
                    background: i === d.activity.length - 1 ? d.c1 : 'rgba(255,255,255,0.1)' }}/>
                ))}
              </div>
            </button>
          ))}
          <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 12.5, color: 'var(--faint)' }}>Tippe einen Hund für das volle Profil</div>
        </div>
        <C.BottomNav active="Hunde"/>
      </Screen>
    );
  }

  // ══════════════════ DETAIL · Variante A (Hero + Bento + Sektionen) ══════════════════
  function DetailHero({ dogId, onBack }) {
    const d = DOGS.find(x => x.id === dogId) || DOGS[0];
    const maxA = Math.max(...d.activity);
    const [confirm, setConfirm] = useState(false);
    const [deleted, setDeleted] = useState(false);
    return (
      <Screen>
        <div className="scroll" style={{ flex: 1 }}>
          {/* hero photo */}
          <div style={{ position: 'relative', height: 340 }}>
            <Photo dog={d} round={0} style={{ position: 'absolute', inset: 0 }}/>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.15) 55%, #000 100%)' }}/>
            <div style={{ position: 'absolute', top: 52, left: 18, right: 18, display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={onBack} style={circBtn}><I.chevL w={18}/></button>
              <button style={circBtn}><I.edit w={17}/></button>
            </div>
            <div style={{ position: 'absolute', left: 20, bottom: 16 }}>
              <div className="display" style={{ fontSize: 40 }}>{d.name}</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.82)', marginTop: 4 }}>{d.breedShort} · {d.sexSym} {d.sex} · {d.color}</div>
            </div>
          </div>

          <div style={{ padding: '16px 16px 20px' }}>
            {/* bento stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginBottom: 18 }}>
              <Stat big v={d.best} l="Bestpunktzahl" acc icon={<I.medal w={17}/>}/>
              <Stat big v={d.streak} l="Tage Serie" acc icon={<I.sparkle w={17}/>}/>
              <Stat v={d.trainings} l="Trainings" icon={<I.dumbbell w={16}/>}/>
              <Stat v={d.tracks} l="Fährten" icon={<I.route w={16}/>}/>
            </div>

            {/* Steckbrief */}
            <Sec title="Steckbrief"/>
            <div className="card" style={{ padding: '4px 14px', marginBottom: 18 }}>
              <Row icon={<I.cake w={17}/>} k="Geburtstag" v={`${d.birthday} · ${d.ageExact} J.`}/>
              <Row icon={<I.weight w={17}/>} k="Gewicht" v={`${d.weight} kg`}/>
              <Row icon={<I.medal w={17}/>} k="Sparte / Stufe" v={`${d.sport} · ${d.level}`}/>
              <Row icon={<I.dna w={17}/>} k="Zwinger" v={d.breeder} last/>
            </div>

            {/* Mikrochip / Identität */}
            <Sec title="Mikrochip & Identität"/>
            <div className="card card-glow" style={{ padding: 16, marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <div className="tile" style={{ width: 46, height: 46 }}><I.chip w={24}/></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="label-cap" style={{ fontSize: 8.5, marginBottom: 3 }}>Mikrochip-Nr.</div>
                  <div className="num" style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.01em' }}>{d.chip}</div>
                </div>
                <Pill tint icon={<I.check w={13}/>}>aktiv</Pill>
              </div>
              <div style={{ marginTop: 13, paddingTop: 13, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ color: 'var(--acc)' }}><I.shield w={16}/></span>
                <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.78)', flex: 1 }}>Registriert</span>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>{d.tasso}</span>
              </div>
            </div>

            {/* Gesundheit */}
            <Sec title="Gesundheit"/>
            <div style={{ display: 'flex', gap: 11, marginBottom: 18 }}>
              <MiniCard icon={<I.vet w={18}/>} v={d.vaccine} l="Impfung"/>
              <MiniCard icon={<I.heart w={18}/>} v={d.heart} l="Herz"/>
              <MiniCard icon={<I.bone w={18}/>} v={d.feed} l="Futter"/>
            </div>

            {/* Trainingsaktivität */}
            <Sec title="Trainingsaktivität"/>
            <div className="card" style={{ padding: '18px 16px 14px', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, height: 96 }}>
                {d.activity.map((v, i) => {
                  const on = i === d.activity.length - 1;
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, height: '100%', justifyContent: 'flex-end' }}>
                      <div style={{ width: '100%', height: (v / maxA * 100) + '%', minHeight: 4, borderRadius: 6,
                        background: on ? d.c1 : 'rgba(255,255,255,0.09)', boxShadow: on ? '0 0 12px ' + d.c1 + '66' : 'none' }}/>
                      <span style={{ fontSize: 9, color: on ? 'var(--acc)' : 'var(--faint)', fontWeight: on ? 700 : 600 }}>{d.months[i]}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Letzte Aktivitäten */}
            <Sec title="Letzte Aktivitäten" action="Alle"/>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {d.recent.map((r, i) => (
                <div key={i} className="card" style={{ padding: 13, display: 'flex', alignItems: 'center', gap: 13 }}>
                  <div className="tile" style={{ width: 42, height: 42 }}><I.route w={20}/></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700 }}>{r[0]}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>{r[1]}</div>
                  </div>
                  {r[2] != null
                    ? <div className="display num" style={{ fontSize: 20, color: r[2] >= 90 ? 'var(--acc)' : '#fff' }}>{r[2]}</div>
                    : <span style={{ color: 'var(--faint)' }}><I.chevR w={18}/></span>}
                </div>
              ))}
            </div>

            {/* Hund löschen */}
            <button onClick={() => setConfirm(true)} style={{ width: '100%', marginTop: 20, padding: '15px', borderRadius: 16,
              background: 'rgba(255,93,108,0.08)', border: '1px solid rgba(255,93,108,0.28)', color: 'var(--bad)', cursor: 'pointer',
              fontFamily: 'Archivo', fontSize: 14.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
              <I.x w={17}/> {d.name} löschen
            </button>
          </div>
        </div>

        {confirm && (
          <div onClick={() => setConfirm(false)} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', animation: 'anyvoFade .2s ease' }}>
            <div onClick={e => e.stopPropagation()} className="glass" style={{ width: '100%', borderRadius: '24px 24px 0 0', padding: '18px 18px 30px', animation: 'anyvoSheet .28s cubic-bezier(.2,.9,.3,1)' }}>
              <div style={{ width: 38, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.2)', margin: '0 auto 18px' }}/>
              <div style={{ width: 52, height: 52, borderRadius: '50%', margin: '0 auto 14px', background: 'rgba(255,93,108,0.14)', color: 'var(--bad)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.x w={26}/></div>
              <div className="display" style={{ fontSize: 22, textAlign: 'center' }}>{d.name} löschen?</div>
              <div style={{ fontSize: 13.5, color: 'var(--muted)', textAlign: 'center', marginTop: 8, lineHeight: 1.5 }}>
                Alle Trainings, Fährten und Profildaten von {d.name} werden dauerhaft entfernt. Das kann nicht rückgängig gemacht werden.
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button onClick={() => setConfirm(false)} className="btn btn-ghost" style={{ flex: 1 }}>Abbrechen</button>
                <button onClick={() => { setConfirm(false); setDeleted(true); setTimeout(onBack, 1100); }}
                  className="btn" style={{ flex: 1, background: 'var(--bad)', color: '#fff' }}>Endgültig löschen</button>
              </div>
            </div>
          </div>
        )}

        {deleted && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.78)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, animation: 'anyvoFade .2s ease' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--acc-dim)', color: 'var(--acc)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.check w={28}/></div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{d.name} wurde gelöscht</div>
          </div>
        )}
      </Screen>
    );
  }
  function DetailCompact({ dogId, onBack }) {
    const d = DOGS.find(x => x.id === dogId) || DOGS[0];
    const [tab, setTab] = useState('Übersicht');
    const tabs = ['Übersicht', 'Sport', 'Gesundheit'];
    return (
      <Screen>
        <div style={{ padding: '52px 16px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={circBtn}><I.chevL w={18}/></button>
          <Photo dog={d} style={{ width: 44, height: 44 }} round={13}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 19, fontWeight: 800 }}>{d.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{d.breedShort} · {d.age} · {d.sex}</div>
          </div>
          <button style={circBtn}><I.edit w={16}/></button>
        </div>

        {/* tabs */}
        <div style={{ display: 'flex', gap: 8, padding: '4px 16px 12px' }}>
          {tabs.map(t => <button key={t} className={'chip' + (tab === t ? ' on' : '')} style={{ flex: 1 }} onClick={() => setTab(t)}>{t}</button>)}
        </div>

        <div className="scroll" style={{ flex: 1, padding: '4px 16px 16px' }}>
          {tab === 'Übersicht' && <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginBottom: 16 }}>
              <Stat big v={d.best} l="Bestpunktzahl" acc icon={<I.medal w={17}/>}/>
              <Stat big v={d.streak} l="Tage Serie" acc icon={<I.sparkle w={17}/>}/>
              <Stat v={d.trainings} l="Trainings" icon={<I.dumbbell w={16}/>}/>
              <Stat v={d.tracks} l="Fährten" icon={<I.route w={16}/>}/>
            </div>
            <Sec title="Letzte Aktivitäten"/>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {d.recent.map((r, i) => (
                <div key={i} className="card" style={{ padding: 13, display: 'flex', alignItems: 'center', gap: 13 }}>
                  <div className="tile" style={{ width: 42, height: 42 }}><I.route w={20}/></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700 }}>{r[0]}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{r[1]}</div>
                  </div>
                  {r[2] != null && <div className="display num" style={{ fontSize: 20, color: r[2] >= 90 ? 'var(--acc)' : '#fff' }}>{r[2]}</div>}
                </div>
              ))}
            </div>
          </>}

          {tab === 'Sport' && <>
            <div className="card card-glow" style={{ padding: 18, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div className="tile" style={{ width: 56, height: 56, fontSize: 0 }}><I.medal w={28}/></div>
              <div style={{ flex: 1 }}>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Aktuelle Stufe</div>
                <div className="display" style={{ fontSize: 26 }}>{d.sport} · {d.level}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="display num acc" style={{ fontSize: 30 }}>{d.best}</div>
                <div className="label-cap" style={{ fontSize: 8 }}>Best</div>
              </div>
            </div>
            <Sec title="Disziplinen"/>
            <div className="card" style={{ padding: '4px 14px' }}>
              <Row icon={<I.route w={17}/>} k="Fährte" v={`${d.tracks} Einheiten`}/>
              <Row icon={<I.dumbbell w={17}/>} k="Unterordnung" v="zuverlässig"/>
              <Row icon={<I.shield w={17}/>} k="Schutzdienst" v="im Aufbau" last/>
            </div>
          </>}

          {tab === 'Gesundheit' && <>
            <div style={{ display: 'flex', gap: 11, marginBottom: 16 }}>
              <MiniCard icon={<I.weight w={18}/>} v={d.weight + ' kg'} l="Gewicht"/>
              <MiniCard icon={<I.vet w={18}/>} v={d.vaccine} l="Impfung"/>
              <MiniCard icon={<I.heart w={18}/>} v={d.heart} l="Herz"/>
            </div>
            <Sec title="Details"/>
            <div className="card" style={{ padding: '4px 14px' }}>
              <Row icon={<I.bone w={17}/>} k="Futter" v={d.feed}/>
              <Row icon={<I.vet w={17}/>} k="Tierarzt" v={d.vet}/>
              <Row icon={<I.calendar w={17}/>} k="Letzte Impfung" v={d.vaccine}/>
              <Row icon={<I.droplet w={17}/>} k="Entwurmung" v="04/2026" last/>
            </div>
          </>}
        </div>
      </Screen>
    );
  }

  // ── detail atoms ──
  const circBtn = { width: 38, height: 38, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(8,9,11,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };

  function Stat({ v, l, acc, big, icon }) {
    return (
      <div className="card" style={{ padding: big ? '17px 16px' : '15px 16px' }}>
        <div style={{ color: acc ? 'var(--acc)' : 'var(--muted)', marginBottom: big ? 10 : 8 }}>{icon}</div>
        <div className="display num" style={{ fontSize: big ? 32 : 26, color: acc ? 'var(--acc)' : '#fff' }}>{v}</div>
        <div className="label-cap" style={{ fontSize: 8.5, marginTop: 3 }}>{l}</div>
      </div>
    );
  }
  function MiniCard({ icon, v, l }) {
    return (
      <div className="card" style={{ flex: 1, padding: '14px 10px', textAlign: 'center' }}>
        <div style={{ color: 'var(--acc)', display: 'flex', justifyContent: 'center', marginBottom: 8 }}>{icon}</div>
        <div style={{ fontSize: 13.5, fontWeight: 800, textTransform: 'capitalize' }}>{v}</div>
        <div className="label-cap" style={{ fontSize: 8, marginTop: 3 }}>{l}</div>
      </div>
    );
  }
  function Row({ icon, k, v, last }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 2px', borderBottom: last ? 'none' : '1px solid var(--line)' }}>
        <span style={{ color: 'var(--acc)', opacity: 0.85 }}>{icon}</span>
        <span style={{ fontSize: 13.5, color: 'var(--muted)', flex: 1 }}>{k}</span>
        <span style={{ fontSize: 13.5, fontWeight: 700, textAlign: 'right' }}>{v}</span>
      </div>
    );
  }
  function Sec({ title, action }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '2px 2px 11px' }}>
        <span className="display" style={{ fontSize: 19 }}>{title}</span>
        {action && <span style={{ color: 'var(--acc)', fontSize: 12.5, fontWeight: 700 }}>{action}</span>}
      </div>
    );
  }

  // ── router wrappers for canvas ──
  function HundeApp({ variant = 'rich', initial = 'list' }) {
    const [screen, setScreen] = useState(initial);
    const open = () => setScreen('detail');
    const back = () => setScreen('list');
    if (screen === 'detail') {
      return variant === 'compact'
        ? <DetailCompact dogId="malu" onBack={back}/>
        : <DetailHero dogId="malu" onBack={back}/>;
    }
    return variant === 'compact' ? <ListCompact onOpen={open}/> : <ListRich onOpen={open}/>;
  }

  window.Hunde = { ListRich, ListCompact, DetailHero, DetailCompact, HundeApp, DOGS };
})();
