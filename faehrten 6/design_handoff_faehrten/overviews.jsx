// ANYVO Fährten — 4 Übersicht (overview) layout variants
(function () {
  const I = window.Icon, V = window.Viz, C = window.Chrome;

  // shared bits
  function StatTriple({ stats }) {
    const cells = [[stats.total, 'FÄHRTEN', false], [stats.avg, 'Ø PUNKTE', false], [stats.streak, 'SERIE', true]];
    return (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {cells.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div style={{ width: 1, height: 38, background: 'var(--line)' }}/>}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div className="display num" style={{ fontSize: 30, color: c[2] ? 'var(--acc)' : '#fff' }}>{c[0]}</div>
              <div className="label-cap" style={{ fontSize: 9, marginTop: 4 }}>{c[1]}</div>
            </div>
          </React.Fragment>
        ))}
      </div>
    );
  }

  function TrackRow({ h, onClick, big }) {
    return (
      <button onClick={onClick} className="card" style={{ padding: big ? 14 : 12, display: 'flex', alignItems: 'center', gap: 13,
        width: '100%', textAlign: 'left', cursor: 'pointer', color: '#fff', background: 'rgba(255,255,255,0.025)' }}>
        <div style={{ width: big ? 58 : 50, height: big ? 58 : 50, borderRadius: 13, overflow: 'hidden', flexShrink: 0,
          background: '#0a1310', border: '1px solid var(--line)' }}>
          <V.TrackSketch seed={h.seed} w={58} h={58} mode="full" showLabels={false}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{h.surface}</span>
            <span style={{ fontSize: 11, color: 'var(--faint)' }}>· {h.date}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{h.length} Schr · {h.angles} Winkel · {h.age}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="display num" style={{ fontSize: 21, color: h.score >= 90 ? 'var(--acc)' : '#fff' }}>{h.score}</div>
          <div className="label-cap" style={{ fontSize: 7.5 }}>PKT</div>
        </div>
      </button>
    );
  }

  function CTA({ nav, label = 'Neue Fährte legen' }) {
    return (
      <button className="btn btn-primary" style={{ width: '100%', padding: '17px' }} onClick={() => nav('legen')}>
        <I.plus w={18}/> {label}
      </button>
    );
  }

  const Screen = ({ children }) => <div className="anyvo" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000' }}>{children}</div>;

  // ════════════════ A · HERO ════════════════
  function OverviewHero({ dog, dogs, onDog, wx, history, stats, nav }) {
    return (
      <Screen>
        <C.SubHeader dog={dog} dogs={dogs} onDog={onDog}/>
        <div className="scroll" style={{ flex: 1, padding: '2px 18px 16px' }}>
          {/* hero */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative', marginBottom: 14,
            border: '1px solid rgba(21,230,195,0.18)' }}>
            <div style={{ position: 'absolute', inset: 0, opacity: 0.5 }}>
              <V.TrackSketch seed={6} w={340} h={340} mode="full" showLabels={false}/>
            </div>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.55) 55%, #0b0c0e 100%)' }}/>
            <div style={{ position: 'relative', padding: '20px 18px 18px' }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Fährtenarbeit · {dog.name}</div>
              <div className="display" style={{ fontSize: 33, marginBottom: 14 }}>
                <span>NASE.</span><br/><span style={{ color: 'var(--muted)' }}>FÄHRTE.</span><br/><span className="acc">FOKUS.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 18 }}>
                <V.ScoreRing value={stats.avg} size={92} stroke={9} label="Ø Punkte"/>
                <div style={{ paddingBottom: 6 }}>
                  <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: 'var(--acc)' }}><I.chart w={15}/></span> +6 Pkt vs. Vormonat
                  </div>
                  <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 7 }}>
                    <span style={{ color: 'var(--acc)' }}><I.sparkle w={15}/></span> {stats.streak} Fährten Serie
                  </div>
                </div>
              </div>
              <CTA nav={nav}/>
            </div>
          </div>

          <div className="card" style={{ padding: '16px 8px', marginBottom: 16 }}>
            <StatTriple stats={stats}/>
          </div>

          <C.SectionLabel action="Logbuch" onAction={() => nav('historie')}>Letzte Fährten</C.SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {history.slice(0, 3).map((h, i) => <TrackRow key={i} h={h} onClick={() => nav('auswertung')}/>)}
          </div>

          <C.SectionLabel action="Details" onAction={() => nav('legen')}>Bedingungen heute</C.SectionLabel>
          <div className="card" style={{ padding: 16 }}>
            <C.WeatherStrip wx={wx}/>
          </div>
        </div>
        <C.BottomNav/>
      </Screen>
    );
  }

  // ════════════════ B · BENTO DASHBOARD ════════════════
  function OverviewBento({ dog, dogs, onDog, wx, history, stats, nav }) {
    return (
      <Screen>
        <C.SubHeader dog={dog} dogs={dogs} onDog={onDog}/>
        <div className="scroll" style={{ flex: 1, padding: '2px 18px 16px' }}>
          {/* top bento: ring + 2 kpis */}
          <div style={{ display: 'flex', gap: 11, marginBottom: 11 }}>
            <div className="card card-glow" style={{ flex: 1.25, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <V.ScoreRing value={stats.avg} size={116} label="Ø Punkte"/>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div className="card" style={{ flex: 1, padding: 15, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ color: 'var(--acc)', marginBottom: 8 }}><I.sparkle w={19}/></div>
                <div className="display num" style={{ fontSize: 27, color: 'var(--acc)' }}>{stats.streak}</div>
                <div className="label-cap" style={{ fontSize: 8.5, marginTop: 2 }}>Serie</div>
              </div>
              <div className="card" style={{ flex: 1, padding: 15, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ color: 'var(--muted)', marginBottom: 8 }}><I.route w={19}/></div>
                <div className="display num" style={{ fontSize: 27 }}>{stats.total}</div>
                <div className="label-cap" style={{ fontSize: 8.5, marginTop: 2 }}>Fährten</div>
              </div>
            </div>
          </div>

          {/* formkurve */}
          <div className="card" style={{ padding: 16, marginBottom: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span className="eyebrow">Formkurve · 8 Fährten</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--acc)', display: 'flex', alignItems: 'center', gap: 4 }}><I.chart w={13}/> +12%</span>
            </div>
            <V.LineChart data={[82,86,84,90,88,93,91,stats.avg]} w={300} h={92} labels={['','','','','','','','']}/>
          </div>

          {/* weather bento */}
          <div className="card" style={{ padding: 16, marginBottom: 11 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Bedingungen heute · ideal</div>
            <C.WeatherStrip wx={wx}/>
          </div>

          <C.SectionLabel action="Alle" onAction={() => nav('historie')}>Letzte Fährten</C.SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {history.slice(0, 2).map((h, i) => <TrackRow key={i} h={h} onClick={() => nav('auswertung')}/>)}
          </div>
          <CTA nav={nav}/>
        </div>
        <C.BottomNav/>
      </Screen>
    );
  }

  // ════════════════ C · MAP FIRST ════════════════
  function OverviewMap({ dog, dogs, onDog, wx, history, stats, session, nav }) {
    const last = history[0];
    const actions = [
      { icon: I.plus, l: 'Legen', s: 'legen', p: true },
      { icon: I.play, l: 'Ausarbeiten', s: 'ausarbeiten' },
      { icon: I.layers, l: 'Logbuch', s: 'historie' },
      { icon: I.chart, l: 'Auswertung', s: 'auswertung' },
    ];
    return (
      <Screen>
        <C.SubHeader dog={dog} dogs={dogs} onDog={onDog}/>
        <div className="scroll" style={{ flex: 1, padding: '2px 18px 16px' }}>
          {/* big map card */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14, position: 'relative', border: '1px solid rgba(21,230,195,0.16)' }}>
            <div style={{ height: 248, position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0 }}><V.AerialMap w={344} h={248} seed={4}/></div>
              <div style={{ position: 'absolute', inset: 0 }}><V.RouteFigure session={session} mode="full" aerial w={344} h={248}/></div>
            </div>
            <div style={{ position: 'absolute', top: 13, left: 13 }} className="glass">
              <div style={{ padding: '7px 13px', borderRadius: 12 }}>
                <div className="label-cap" style={{ fontSize: 8 }}>Letzte Fährte</div>
                <div style={{ fontSize: 13, fontWeight: 800, marginTop: 1 }}>{last.surface} · {last.length} Schr</div>
              </div>
            </div>
            <div className="glass" style={{ position: 'absolute', top: 13, right: 13, borderRadius: 14, padding: '8px 14px', textAlign: 'center' }}>
              <div className="display num acc" style={{ fontSize: 24 }}>{last.score}</div>
              <div className="label-cap" style={{ fontSize: 7.5 }}>Punkte</div>
            </div>
            <div className="glass" style={{ position: 'absolute', left: 13, right: 13, bottom: 13, borderRadius: 14, padding: '10px 6px' }}>
              <StatTriple stats={stats}/>
            </div>
          </div>

          {/* quick actions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginBottom: 16 }}>
            {actions.map((a, i) => (
              <button key={i} onClick={() => nav(a.s)} className={a.p ? '' : 'card'} style={{ padding: '16px 14px', borderRadius: 20, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', color: a.p ? '#04201b' : '#fff',
                background: a.p ? 'var(--acc)' : 'rgba(255,255,255,0.03)', border: a.p ? 'none' : '1px solid var(--line)',
                boxShadow: a.p ? '0 12px 30px -12px var(--acc-glow)' : 'none', fontFamily: 'Archivo' }}>
                <a.icon w={22}/>
                <span style={{ fontSize: 14.5, fontWeight: 800 }}>{a.l}</span>
              </button>
            ))}
          </div>

          <C.SectionLabel action="Logbuch" onAction={() => nav('historie')}>Verlauf</C.SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.slice(0, 2).map((h, i) => <TrackRow key={i} h={h} onClick={() => nav('auswertung')}/>)}
          </div>
        </div>
        <C.BottomNav/>
      </Screen>
    );
  }

  // ════════════════ D · EDITORIAL TIMELINE ════════════════
  function OverviewEditorial({ dog, dogs, onDog, wx, history, stats, nav }) {
    return (
      <Screen>
        <C.SubHeader dog={dog} dogs={dogs} onDog={onDog}/>
        <div className="scroll" style={{ flex: 1, padding: '2px 20px 16px' }}>
          {/* editorial masthead */}
          <div style={{ padding: '6px 0 18px' }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Saison 2025 · {dog.name}</div>
            <div className="display" style={{ fontSize: 30, lineHeight: 0.95 }}>
              <span style={{ color: 'var(--muted)' }}>{stats.total} Fährten,</span><br/>
              <span>Schnitt <span className="acc">{stats.avg}</span>.</span>
            </div>
            <div style={{ marginTop: 18, marginBottom: 4, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <span className="label-cap">Formkurve</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--acc)' }}>Best {stats.best} · Serie {stats.streak}</span>
            </div>
            <V.LineChart data={[82,86,84,90,88,93,91,stats.avg]} w={320} h={86}/>
          </div>

          <div className="divider" style={{ marginBottom: 4 }}/>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0 8px' }}>
            <span className="eyebrow">Letzte Fährten</span>
            <button onClick={() => nav('historie')} style={{ background: 'none', border: 'none', color: 'var(--acc)', fontFamily: 'Archivo', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Alle</button>
          </div>

          {/* editorial rows */}
          <div>
            {history.slice(0, 4).map((h, i) => (
              <button key={i} onClick={() => nav('auswertung')} style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                padding: '15px 0', background: 'none', border: 'none', borderBottom: '1px solid var(--line)', cursor: 'pointer', color: '#fff', textAlign: 'left' }}>
                <span className="display num" style={{ fontSize: 13, color: 'var(--faint)', width: 22 }}>{String(i + 1).padStart(2, '0')}</span>
                <div style={{ width: 46, height: 46, borderRadius: 11, overflow: 'hidden', background: '#0a1310', border: '1px solid var(--line)', flexShrink: 0 }}>
                  <V.TrackSketch seed={h.seed} w={46} h={46} mode="full" showLabels={false}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{h.surface}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{h.date} · {h.length} Schr · {h.angles} Winkel</div>
                </div>
                <div className="display num" style={{ fontSize: 25, color: h.score >= 90 ? 'var(--acc)' : '#fff' }}>{h.score}</div>
              </button>
            ))}
          </div>

          <div style={{ height: 18 }}/>
          <CTA nav={nav}/>
        </div>
        <C.BottomNav/>
      </Screen>
    );
  }

  window.Overviews = {
    Hero: OverviewHero, Bento: OverviewBento, Map: OverviewMap, Editorial: OverviewEditorial,
  };
})();
