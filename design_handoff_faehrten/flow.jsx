// ANYVO Fährten — flow screens: Planen, Live, Auswertung, Historie
(function () {
  const I = window.Icon, V = window.Viz, C = window.Chrome;
  const { useState, useEffect, useRef } = React;

  const SURFACES = ['Acker', 'Wiese', 'Wald', 'Mischung'];
  const AGES = [{ k: '30 min', m: 30 }, { k: '1 h', m: 60 }, { k: '2 h', m: 120 }, { k: '3 h', m: 180 }];

  function Field({ icon, label, hint, children }) {
    return (
      <div className="card" style={{ padding: '15px 16px', display: 'flex', alignItems: 'center', gap: 13 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--acc-dim)', color: 'var(--acc)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><icon.type {...icon.props}/></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{label}</div>
          {hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{hint}</div>}
        </div>
        {children}
      </div>
    );
  }

  // ───────────────────────── PLANEN ─────────────────────────
  function Planen({ plan, setPlan, dog, dogs, wx, nav }) {
    const upd = (k, v) => setPlan(p => ({ ...p, [k]: v }));
    return (
      <Screen>
        <C.SubHeader title="FÄHRTE PLANEN" onBack={() => nav('overview')}/>
        <div className="scroll" style={{ flex: 1, padding: '4px 18px 20px' }}>
          {/* sketch preview */}
          <div className="card card-glow" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ height: 188, background: 'radial-gradient(120% 90% at 50% 0%, rgba(21,230,195,0.07), transparent)' }}>
              <V.TrackSketch legs={plan.angles} objects={plan.objects} w={320} h={188} progress={1}/>
            </div>
            <div style={{ display: 'flex', borderTop: '1px solid var(--line)' }}>
              {[[plan.length + ' Schr', 'Länge'], [plan.angles + ' Winkel', 'Verlauf'], [plan.objects + ' Gegenst.', 'Apportier'], [AGES.find(a=>a.m===plan.age).k, 'Alter']].map((s, i) => (
                <div key={i} style={{ flex: 1, padding: '11px 6px', textAlign: 'center',
                  borderLeft: i ? '1px solid var(--line)' : 'none' }}>
                  <div className="num" style={{ fontSize: 13.5, fontWeight: 800 }}>{s[0]}</div>
                  <div className="label-cap" style={{ fontSize: 8, marginTop: 2 }}>{s[1]}</div>
                </div>
              ))}
            </div>
          </div>

          <C.SectionLabel>Parameter</C.SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {/* length slider */}
            <div className="card" style={{ padding: '15px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Länge</span>
                <span className="num acc" style={{ fontSize: 17, fontWeight: 800 }}>{plan.length} <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Schritt</span></span>
              </div>
              <input type="range" min="200" max="1500" step="50" value={plan.length}
                onChange={e => upd('length', +e.target.value)}
                style={{ width: '100%', accentColor: 'var(--acc)', height: 4 }}/>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--faint)' }}>200</span>
                <span style={{ fontSize: 10, color: 'var(--faint)' }}>1500</span>
              </div>
            </div>
            <Field icon={<I.angle w={20}/>} label="Winkel" hint="Anzahl Richtungswechsel">
              <C.Stepper value={plan.angles} set={v => upd('angles', v)} min={0} max={5}/>
            </Field>
            <Field icon={<I.target w={20}/>} label="Gegenstände" hint="Apportierstücke auf der Fährte">
              <C.Stepper value={plan.objects} set={v => upd('objects', v)} min={0} max={5}/>
            </Field>
          </div>

          <div style={{ height: 18 }}/>
          <C.SectionLabel>Liegezeit</C.SectionLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            {AGES.map(a => (
              <button key={a.m} className={'chip' + (plan.age === a.m ? ' on' : '')} style={{ flex: 1 }} onClick={() => upd('age', a.m)}>{a.k}</button>
            ))}
          </div>

          <div style={{ height: 18 }}/>
          <C.SectionLabel>Untergrund</C.SectionLabel>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {SURFACES.map(s => (
              <button key={s} className={'chip' + (plan.surface === s ? ' on' : '')} style={{ flex: 1 }} onClick={() => upd('surface', s)}>{s}</button>
            ))}
          </div>

          <div style={{ height: 18 }}/>
          <div className="card" style={{ padding: '15px 16px', display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--acc-dim)', color: 'var(--acc)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.route w={20}/></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Verleitung</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Fremdfährte kreuzen lassen</div>
            </div>
            <Toggle on={plan.distraction} set={() => upd('distraction', !plan.distraction)}/>
          </div>

          <div style={{ height: 18 }}/>
          <C.SectionLabel>Bedingungen</C.SectionLabel>
          <div className="card" style={{ padding: '16px' }}>
            <C.WeatherStrip wx={wx}/>
            <div style={{ marginTop: 13, paddingTop: 13, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--acc)' }}><I.sparkle w={16}/></span>
              <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.8)' }}>Ideale Witterung — feuchter Boden, leichter Wind.</span>
            </div>
          </div>
        </div>

        <Footer>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => nav('overview')}>Entwurf speichern</button>
          <button className="btn btn-primary" style={{ flex: 1.4 }} onClick={() => nav('live')}><I.play w={16}/> Live starten</button>
        </Footer>
      </Screen>
    );
  }

  function Toggle({ on, set }) {
    return (
      <button onClick={set} style={{ width: 50, height: 30, borderRadius: 999, border: 'none', cursor: 'pointer',
        background: on ? 'var(--acc)' : 'rgba(255,255,255,0.12)', position: 'relative', transition: 'background .2s', padding: 0 }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 24, height: 24, borderRadius: '50%',
          background: '#fff', transition: 'left .2s cubic-bezier(.3,1.4,.5,1)', boxShadow: '0 2px 5px rgba(0,0,0,0.4)' }}/>
      </button>
    );
  }

  // ───────────────────────── LIVE ─────────────────────────
  function Live({ plan, dog, wx, nav }) {
    const [t, setT] = useState(8 * 60 + 42);
    const [prog, setProg] = useState(0.46);
    const [view, setView] = useState('map');
    const [paused, setPaused] = useState(false);
    const [found, setFound] = useState(1);
    useEffect(() => {
      if (paused) return;
      const id = setInterval(() => {
        setT(x => x + 1);
        setProg(p => Math.min(0.97, p + 0.006));
      }, 1000);
      return () => clearInterval(id);
    }, [paused]);
    useEffect(() => {
      const n = plan.objects ? Math.min(plan.objects, 1 + Math.floor(prog * plan.objects)) : 0;
      setFound(n);
    }, [prog, plan.objects]);
    const mm = String(Math.floor(t / 60)).padStart(2, '0'), ss = String(t % 60).padStart(2, '0');
    const dist = Math.round(prog * plan.length * 0.75);

    return (
      <Screen>
        {/* live top bar */}
        <div style={{ paddingTop: 54, padding: '54px 18px 10px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => nav('planen')} style={{ width: 36, height: 36, borderRadius: 11, border: '1px solid var(--line-strong)',
            background: 'rgba(255,255,255,0.06)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><I.chevL w={17}/></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999,
            background: 'rgba(255,93,108,0.14)', border: '1px solid rgba(255,93,108,0.3)' }}>
            <span className="rec-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--bad)' }}/>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: '#ff8a94' }}>LIVE</span>
          </div>
          <div style={{ flex: 1 }}/>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 11, padding: 3, gap: 2 }}>
            {[['map', 'Karte'], ['sketch', 'Skizze']].map(([k, l]) => (
              <button key={k} onClick={() => setView(k)} style={{ padding: '6px 11px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontFamily: 'Archivo', fontSize: 11.5, fontWeight: 700, background: view === k ? 'var(--acc)' : 'transparent',
                color: view === k ? '#04201b' : 'var(--muted)' }}>{l}</button>
            ))}
          </div>
        </div>

        {/* map / sketch */}
        <div style={{ flex: 1, position: 'relative', margin: '4px 14px 0', borderRadius: 24, overflow: 'hidden',
          border: '1px solid var(--line)' }}>
          {view === 'map'
            ? <V.GpsMap legs={plan.angles} objects={plan.objects} progress={prog} w={360} h={480}/>
            : <div style={{ height: '100%', background: '#08100e' }}><V.TrackSketch legs={plan.angles} objects={plan.objects} progress={prog} w={360} h={480}/></div>}

          {/* timer overlay */}
          <div className="glass" style={{ position: 'absolute', top: 14, left: 14, borderRadius: 16, padding: '10px 16px' }}>
            <div className="display num" style={{ fontSize: 30, letterSpacing: '0.01em' }}>{mm}:{ss}</div>
            <div className="label-cap" style={{ fontSize: 8.5, marginTop: 1 }}>Laufzeit</div>
          </div>
          {/* dog chip */}
          <div className="glass" style={{ position: 'absolute', top: 14, right: 14, borderRadius: 999, padding: '6px 12px 6px 6px',
            display: 'flex', alignItems: 'center', gap: 8 }}>
            <C.Avatar dog={dog} size={26}/>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>{dog.name}</span>
          </div>
          {/* bottom metric bar */}
          <div className="glass" style={{ position: 'absolute', left: 14, right: 14, bottom: 14, borderRadius: 18, padding: '12px 8px',
            display: 'flex', justifyContent: 'space-around' }}>
            {[[dist + ' m', 'Distanz'], [found + '/' + plan.objects, 'Gegenst.'], ['n. W' + Math.min(plan.angles, 1 + Math.floor(prog*plan.angles)), 'Abschnitt'], [plan.surface, 'Boden']].map((m, i) => (
              <div key={i} style={{ textAlign: 'center', flex: 1, borderLeft: i ? '1px solid var(--line)' : 'none' }}>
                <div className="num" style={{ fontSize: 15, fontWeight: 800 }}>{m[0]}</div>
                <div className="label-cap" style={{ fontSize: 8 }}>{m[1]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* controls */}
        <div style={{ flexShrink: 0, padding: '14px 18px 26px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setFound(f => Math.min(plan.objects, f + 1))} className="btn btn-ghost"
            style={{ flexDirection: 'column', gap: 3, height: 60, flex: 1, padding: 8 }}>
            <I.target w={20}/><span style={{ fontSize: 10.5 }}>Gegenstand</span>
          </button>
          <button onClick={() => setPaused(p => !p)} className="btn btn-ghost"
            style={{ flexDirection: 'column', gap: 3, height: 60, flex: 1, padding: 8 }}>
            {paused ? <I.play w={20}/> : <I.pause w={20}/>}<span style={{ fontSize: 10.5 }}>{paused ? 'Weiter' : 'Pause'}</span>
          </button>
          <button onClick={() => nav('auswertung')} className="btn"
            style={{ flexDirection: 'column', gap: 3, height: 60, flex: 1.3, padding: 8, background: 'var(--bad)', color: '#2a060a',
              boxShadow: '0 10px 30px -10px rgba(255,93,108,0.5)' }}>
            <I.stop w={20}/><span style={{ fontSize: 10.5, fontWeight: 800 }}>Stop & Auswerten</span>
          </button>
        </div>
      </Screen>
    );
  }

  // ───────────────────────── AUSWERTUNG ─────────────────────────
  function Auswertung({ dog, plan, wx, nav }) {
    const legs = [
      { name: 'Ausarbeitung Abschnitt 1', score: 18, max: 20 },
      { name: '1. Winkel', score: 9, max: 10 },
      { name: 'Ausarbeitung Abschnitt 2', score: 17, max: 20 },
      { name: '2. Winkel', score: 10, max: 10 },
      { name: 'Ausarbeitung Abschnitt 3', score: 19, max: 20 },
      { name: 'Gegenstände', score: 9, max: 10 },
    ];
    const total = legs.reduce((a, b) => a + b.score, 0);
    const maxT = legs.reduce((a, b) => a + b.max, 0);
    const score = Math.round(total / maxT * 100);
    return (
      <Screen>
        <C.SubHeader title="AUSWERTUNG" onBack={() => nav('overview')}/>
        <div className="scroll" style={{ flex: 1, padding: '4px 18px 20px' }}>
          {/* hero */}
          <div className="card card-glow" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14 }}>
            <V.ScoreRing value={score} size={118} label="Punkte" sub="Vorzüglich"/>
            <div style={{ flex: 1 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>{dog.name} · Heute</div>
              <div className="display" style={{ fontSize: 26, marginBottom: 8 }}>SEHR<br/>GUT.</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Tag>{plan.length} Schritt</Tag><Tag>{plan.surface}</Tag><Tag>{plan.angles} Winkel</Tag>
              </div>
            </div>
          </div>

          {/* highlight row */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {[[I.target, plan.objects + '/' + plan.objects, 'Gegenstände'], [I.check, 'Sauber', 'Winkel'], [I.route, plan.distraction ? '✓' : '–', 'Verleitung']].map(([Ic, v, l], i) => (
              <div key={i} className="card" style={{ flex: 1, padding: '14px 10px', textAlign: 'center' }}>
                <div style={{ color: 'var(--acc)', display: 'flex', justifyContent: 'center', marginBottom: 7 }}><Ic w={20}/></div>
                <div className="num" style={{ fontSize: 16, fontWeight: 800 }}>{v}</div>
                <div className="label-cap" style={{ fontSize: 8, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          <C.SectionLabel>Bewertung pro Abschnitt</C.SectionLabel>
          <div className="card" style={{ padding: '18px 16px', marginBottom: 16 }}>
            <V.LegBars rows={legs}/>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className="label-cap">Gesamtpunktzahl</span>
              <span className="num"><span className="display acc" style={{ fontSize: 22 }}>{total}</span><span style={{ color: 'var(--faint)', fontWeight: 700 }}>/{maxT}</span></span>
            </div>
          </div>

          <C.SectionLabel>Fährtenverlauf</C.SectionLabel>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ height: 190, position: 'relative' }}>
              <V.TrackSketch legs={plan.angles} objects={plan.objects} w={320} h={190} progress={1}/>
              <div style={{ position: 'absolute', left: 14, bottom: 12, display: 'flex', gap: 14 }}>
                <Legend c="var(--acc)" t="Fährte"/><Legend c="#fff" t="Gegenstand" sq/><Legend c="#ffb547" t="Korrektur"/>
              </div>
            </div>
          </div>

          <C.SectionLabel>Notiz</C.SectionLabel>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.82)' }}>
              Konzentrierte Nasenarbeit über die gesamte Distanz. Am 2. Winkel kurz überschossen, sauber korrigiert. Alle Gegenstände überzeugend verwiesen.
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 7 }}>
              <Tag>#tiefennase</Tag><Tag>#verweisen</Tag><Tag>#feuchterboden</Tag>
            </div>
          </div>
        </div>
        <Footer>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => nav('historie')}>Logbuch</button>
          <button className="btn btn-primary" style={{ flex: 1.4 }} onClick={() => nav('overview')}><I.check w={16}/> Auswertung speichern</button>
        </Footer>
      </Screen>
    );
  }

  function Tag({ children }) {
    return <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 8,
      background: 'rgba(255,255,255,0.06)', color: 'var(--muted)' }}>{children}</span>;
  }
  function Legend({ c, t, sq }) {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 9, height: 9, borderRadius: sq ? 2 : '50%', background: c, transform: sq ? 'rotate(45deg)' : 'none' }}/>
      <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{t}</span>
    </div>;
  }

  // ───────────────────────── HISTORIE ─────────────────────────
  function Historie({ dog, dogs, onDog, history, nav }) {
    const [filter, setFilter] = useState('Alle');
    const filters = ['Alle', 'Acker', 'Wiese', 'Wald'];
    const rows = history.filter(h => filter === 'Alle' || h.surface === filter);
    return (
      <Screen>
        <C.SubHeader title="LOGBUCH" onBack={() => nav('overview')} dog={dog} dogs={dogs} onDog={onDog}/>
        <div className="scroll" style={{ flex: 1, padding: '4px 18px 20px' }}>
          <div className="noscroll-x" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {filters.map(f => <button key={f} className={'chip' + (filter === f ? ' on' : '')} onClick={() => setFilter(f)}>{f}</button>)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {rows.map((h, i) => (
              <div key={i} className="card" style={{ padding: 13, display: 'flex', alignItems: 'center', gap: 13 }}>
                <div style={{ width: 64, height: 64, borderRadius: 14, overflow: 'hidden', flexShrink: 0,
                  background: '#0a1310', border: '1px solid var(--line)' }}>
                  <V.TrackSketch legs={h.angles} objects={h.objects} w={64} h={64} progress={1} showLabels={false}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 800 }}>{h.surface}</span>
                    <span style={{ fontSize: 11, color: 'var(--faint)' }}>· {h.date}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{h.length} Schr · {h.angles} Winkel · {h.objects} Gegenst. · {h.age}</div>
                  <div style={{ marginTop: 7, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                    <div style={{ width: h.score + '%', height: '100%', background: h.score >= 90 ? 'var(--acc)' : '#7fe6b0', borderRadius: 3 }}/>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="display num" style={{ fontSize: 24, color: h.score >= 90 ? 'var(--acc)' : '#fff' }}>{h.score}</div>
                  <div className="label-cap" style={{ fontSize: 8 }}>Punkte</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Screen>
    );
  }

  // shared scaffolding
  function Screen({ children }) {
    return <div className="anyvo" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000' }}>{children}</div>;
  }
  function Footer({ children }) {
    return (
      <div style={{ flexShrink: 0, padding: '12px 18px 26px', display: 'flex', gap: 10, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, top: -22, background: 'linear-gradient(180deg, rgba(0,0,0,0), #000 40%)', pointerEvents: 'none' }}/>
        <div style={{ position: 'relative', display: 'flex', gap: 10, width: '100%' }}>{children}</div>
      </div>
    );
  }

  window.Flow = { Planen, Live, Auswertung, Historie };
})();
