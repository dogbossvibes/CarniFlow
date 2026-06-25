// ANYVO Fährten — Legen → Liegezeit → Ausarbeiten → Auswertung → Logbuch
(function () {
  const I = window.Icon, MatIcon = window.MatIcon, V = window.Viz, C = window.Chrome;
  const { useState, useEffect, useRef } = React;
  const MAT = V.MATERIALS, MAT_ORDER = V.MAT_ORDER;
  const SURFACES = ['Acker', 'Wiese', 'Wald', 'Mischung'];
  const WINKEL = { right: 'Rechter Winkel', left: 'Linker Winkel', spitz: 'Spitzwinkel' };
  const WLET = { right: 'R', left: 'L', spitz: 'S' };
  const WCOL = { right: 'var(--acc)', left: 'var(--acc)', spitz: '#ffb547' };
  function winkelCounts(corners) { const m = { right: 0, left: 0, spitz: 0 }; (corners||[]).forEach(c => m[c.type] = (m[c.type]||0)+1); return m; }
  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const clamp = (v,a,b) => Math.min(b, Math.max(a, v));

  // group objects by material → [{material,count}]
  function byMaterial(objects) {
    const m = {}; (objects||[]).forEach(o => m[o.material] = (m[o.material]||0)+1);
    return MAT_ORDER.filter(k => m[k]).map(k => ({ material: k, count: m[k] }));
  }

  // ───────────────────────── LEGEN (live recorder) ─────────────────────────
  function Legen({ setSession, dog, dogs, onDog, wx, nav }) {
    const [pts, setPts] = useState([[0.2, 0.86]]);
    const [objects, setObjects] = useState([]);
    const [corners, setCorners] = useState([]);
    const [steps, setSteps] = useState(0);
    const [secs, setSecs] = useState(0);
    const [walking, setWalking] = useState(true);
    const [view, setView] = useState('map');
    const [surface, setSurface] = useState('Acker');
    const [sheet, setSheet] = useState(false);
    const [toast, setToast] = useState(null);
    const [breaks, setBreaks] = useState([]);
    const angRef = useRef(-Math.PI/2);
    const ptsRef = useRef(pts);
    ptsRef.current = pts;
    const tickRef = useRef(0);
    const nextEventRef = useRef(15);
    const flash = (msg, tone) => { const k = Date.now(); setToast({ msg, tone, k }); setTimeout(() => setToast(t => (t && t.k === k) ? null : t), 1600); };

    useEffect(() => {
      if (!walking) return;
      const id = setInterval(() => {
        tickRef.current += 1;
        // auto-detect Winkel / Abriss from the walked path
        if (tickRef.current >= nextEventRef.current && ptsRef.current.length > 6) {
          nextEventRef.current = tickRef.current + 13 + Math.floor(Math.random()*9);
          const r = Math.random();
          if (r < 0.17) {
            setBreaks(b => [...b, ptsRef.current.length - 1]);
            flash('Abriss erkannt', 'bad');
          } else {
            const type = r < 0.5 ? 'right' : r < 0.78 ? 'left' : 'spitz';
            const mag = type === 'spitz' ? Math.PI * 0.8 : Math.PI / 2;
            const sign = type === 'left' ? -1 : type === 'spitz' ? (Math.random() > 0.5 ? 1 : -1) : 1;
            angRef.current += sign * (mag + (Math.random()-0.5)*0.25);
            setCorners(c => [...c, { idx: ptsRef.current.length - 1, type }]);
            flash(WINKEL[type] + ' erkannt');
          }
        }
        setPts(prev => {
          const last = prev[prev.length-1];
          let ang = angRef.current + (Math.random()-0.5)*0.1; // gentle GPS meander
          let nx = last[0] + Math.cos(ang)*0.0115;
          let ny = last[1] + Math.sin(ang)*0.0115;
          if (nx < 0.1 || nx > 0.9) { ang = Math.PI - ang; nx = clamp(nx,0.1,0.9); }
          if (ny < 0.12 || ny > 0.88) { ang = -ang; ny = clamp(ny,0.12,0.88); }
          angRef.current = ang;
          return [...prev, [nx, ny]];
        });
        setSteps(s => s + 2 + Math.round(Math.random()*2));
      }, 130);
      return () => clearInterval(id);
    }, [walking]);
    useEffect(() => { const id = setInterval(() => setSecs(s => s+1), 1000); return () => clearInterval(id); }, []);

    const drop = (mat) => { setObjects(o => [...o, { idx: ptsRef.current.length-1, material: mat }]); setSheet(false); flash(MAT[mat].label + ' abgelegt'); };
    const finish = () => { setSession({ points: ptsRef.current, objects, corners, breaks, steps, surface, laidAt: Date.now(), dogId: dog.id }); nav('liegezeit'); };
    const session = { points: pts, objects, corners, breaks };
    const wc = winkelCounts(corners);

    const dist = Math.round(steps * 0.75);
    return (
      <Screen>
        <div style={{ padding: '54px 16px 10px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => nav('overview')} style={navBtn}><I.chevL w={17}/></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 999, background: 'rgba(255,93,108,0.16)' }}>
            <span className="rec-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--bad)' }}/>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: '#ff7d88' }}>LIVE</span>
          </div>
          <div style={{ flex: 1 }}/>
          <Seg value={view} set={setView} opts={[['map','Karte'],['sketch','Skizze']]}/>
        </div>

        <div style={{ flex: 1, position: 'relative', margin: '2px 12px 0', borderRadius: 26, overflow: 'hidden', border: '1px solid var(--line)' }}>
          {view === 'map'
            ? <div style={{ position: 'absolute', inset: 0 }}>
                <div style={{ position: 'absolute', inset: 0 }}><V.AerialMap w={360} h={500} seed={4}/></div>
                <div style={{ position: 'absolute', inset: 0 }}><V.RouteFigure session={session} live mode="full" aerial w={360} h={500}/></div>
              </div>
            : <div style={{ position: 'absolute', inset: 0, background: '#08100e' }}><V.TrackSketch session={session} live mode="full" w={360} h={500}/></div>}

          {/* timer · AUFNAHME */}
          <div style={{ position: 'absolute', top: 13, left: 13, borderRadius: 18, padding: '9px 16px',
            background: 'rgba(8,9,11,0.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}>
            <div className="display num" style={{ fontSize: 30, lineHeight: 1 }}>{fmt(secs)}</div>
            <div className="label-cap" style={{ fontSize: 8.5, marginTop: 2, color: 'rgba(255,255,255,0.7)' }}>Aufnahme</div>
          </div>
          {/* dog chip */}
          <div style={{ position: 'absolute', top: 13, right: 13, borderRadius: 999, padding: '5px 14px 5px 5px',
            display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(8,9,11,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}>
            <C.Avatar dog={dog} size={28}/><span style={{ fontSize: 14, fontWeight: 700 }}>{dog.name}</span>
          </div>

          {toast && <div key={toast.k} style={{ position: 'absolute', top: 84, left: '50%', transform: 'translateX(-50%)',
            borderRadius: 999, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 7, animation: 'anyvoToast .3s ease',
            background: toast.tone === 'bad' ? 'rgba(40,10,14,0.82)' : 'rgba(6,28,24,0.82)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            border: toast.tone === 'bad' ? '1px solid rgba(255,93,108,0.5)' : '1px solid rgba(21,230,195,0.45)' }}>
            <span style={{ color: toast.tone === 'bad' ? 'var(--bad)' : 'var(--acc)' }}>{toast.tone === 'bad' ? <I.undo w={15}/> : <I.check w={15}/>}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>{toast.msg}</span>
          </div>}

          {/* bottom metric strip over map */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '26px 10px 12px', display: 'flex', justifyContent: 'space-around',
            background: 'linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.55))' }}>
            {[[steps, 'Schritte'], [dist + ' m', 'Distanz'], [objects.length, 'Gegenst.'], [corners.length, 'Winkel']].map((m,i)=>(
              <div key={i} style={{ textAlign: 'center', flex: 1 }}>
                <div className="num" style={{ fontSize: 17, fontWeight: 800 }}>{m[0]}</div>
                <div className="label-cap" style={{ fontSize: 8, marginTop: 1, color: 'rgba(255,255,255,0.6)' }}>{m[1]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* voice control */}
        <div style={{ flexShrink: 0, padding: '12px 18px 0', display: 'flex', justifyContent: 'center' }}>
          <button onClick={() => flash('Sprachsteuerung aktiv — sag „Marker" oder „Winkel"')} style={{ display: 'flex', alignItems: 'center', gap: 10,
            padding: '13px 28px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--line-strong)', color: '#fff', cursor: 'pointer', fontFamily: 'Archivo', fontSize: 15, fontWeight: 700 }}>
            <I.mic w={19}/> Sprachsteuerung
          </button>
        </div>

        {/* controls: Marker / Pause / Stop & Weiter */}
        <div style={{ flexShrink: 0, padding: '12px 16px 26px', display: 'flex', gap: 10 }}>
          <BigBtn onClick={() => setSheet(true)} icon={<I.pluscircle w={22}/>} label="Marker"/>
          <BigBtn onClick={() => setWalking(w => !w)} icon={walking ? <I.pause w={22}/> : <I.play w={22}/>} label={walking ? 'Pause' : 'Weiter'}/>
          <BigBtn onClick={finish} icon={<I.stop w={22}/>} label="Stop & Weiter" danger/>
        </div>

        {/* material sheet */}
        {sheet && <Sheet title="Gegenstand ablegen" onClose={() => setSheet(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {MAT_ORDER.map(k => (
              <button key={k} onClick={() => drop(k)} className="card" style={{ padding: '15px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', color: '#fff', textAlign: 'left' }}>
                <span style={{ width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: MAT[k].c + '22', color: MAT[k].c, flexShrink: 0 }}><MatIcon material={k} w={21}/></span>
                <span style={{ fontSize: 14.5, fontWeight: 700 }}>{MAT[k].label}</span>
              </button>
            ))}
          </div>
        </Sheet>}
      </Screen>
    );
  }

  // ───────────────────────── LIEGEZEIT ─────────────────────────
  function Liegezeit({ session, dog, nav }) {
    const start = useRef(session.laidAt || Date.now());
    const [secs, setSecs] = useState(Math.floor((Date.now() - start.current) / 1000));
    const [target, setTarget] = useState(30);
    useEffect(() => { const id = setInterval(() => setSecs(Math.floor((Date.now() - start.current)/1000)), 1000); return () => clearInterval(id); }, []);
    const mats = byMaterial(session.objects);
    const wc = winkelCounts(session.corners); const nBreak = (session.breaks||[]).length;
    const ready = secs >= target * 60;
    const hh = Math.floor(secs/3600), mm = Math.floor((secs%3600)/60), ss = secs%60;
    const big = hh > 0 ? `${hh}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}` : `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
    return (
      <Screen>
        <C.SubHeader title="LIEGEZEIT" onBack={() => nav('overview')}/>
        <div className="scroll" style={{ flex: 1, padding: '4px 18px 20px' }}>
          {/* aging timer */}
          <div className="card card-glow" style={{ padding: '26px 20px', textAlign: 'center', marginBottom: 14 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--acc)', marginBottom: 14 }}>
              <span className="pulse-dot"><I.hourglass w={20}/></span>
              <span className="eyebrow" style={{ color: 'var(--acc)' }}>Fährte reift</span>
            </div>
            <div className="display num" style={{ fontSize: 58, letterSpacing: '0.01em' }}>{big}</div>
            <div className="label-cap" style={{ marginTop: 6 }}>seit dem Legen · {dog.name}</div>
            <div style={{ marginTop: 18, height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div style={{ width: clamp(secs/(target*60)*100,0,100) + '%', height: '100%', borderRadius: 4, background: ready ? 'var(--acc)' : '#7fe6b0', boxShadow: '0 0 8px var(--acc-glow)', transition: 'width 1s linear' }}/>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7 }}>
              <span style={{ fontSize: 11, color: 'var(--faint)' }}>0</span>
              <span style={{ fontSize: 11, color: ready ? 'var(--acc)' : 'var(--muted)', fontWeight: 700 }}>{ready ? 'bereit zum Ausarbeiten' : 'Ziel ' + target + ' min'}</span>
            </div>
          </div>

          <C.SectionLabel>Ziel-Liegezeit</C.SectionLabel>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {[15,30,60,120].map(t => <button key={t} className={'chip'+(target===t?' on':'')} style={{ flex: 1 }} onClick={() => setTarget(t)}>{t>=60? (t/60)+' h' : t+' min'}</button>)}
          </div>

          <C.SectionLabel>Gelegte Fährte</C.SectionLabel>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ height: 170, position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0 }}><V.AerialMap w={320} h={170} seed={4}/></div>
              <div style={{ position: 'absolute', inset: 0 }}><V.RouteFigure session={session} mode="full" aerial w={320} h={170}/></div>
            </div>
            <div style={{ display: 'flex', borderTop: '1px solid var(--line)' }}>
              {[[session.steps + ' Schr', 'Länge'], [session.corners.length + ' Winkel', 'Verlauf'], [session.objects.length + ' Gegenst.', 'Apportier'], [session.surface, 'Boden']].map((s,i)=>(
                <div key={i} style={{ flex: 1, padding: '11px 4px', textAlign: 'center', borderLeft: i ? '1px solid var(--line)' : 'none' }}>
                  <div className="num" style={{ fontSize: 13, fontWeight: 800 }}>{s[0]}</div>
                  <div className="label-cap" style={{ fontSize: 7.5, marginTop: 2 }}>{s[1]}</div>
                </div>
              ))}
            </div>
          </div>

          <C.SectionLabel>Erkannte Winkel & Ereignisse</C.SectionLabel>
          <div className="card" style={{ padding: '14px 14px', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 9 }}>
              {[['right', wc.right], ['left', wc.left], ['spitz', wc.spitz], ['abriss', nBreak]].map(([k, n]) => {
                const bad = k === 'abriss'; const col = bad ? 'var(--bad)' : WCOL[k];
                const label = bad ? 'Abriss' : WINKEL[k];
                return (
                  <div key={k} style={{ flex: 1, textAlign: 'center', padding: '10px 4px', borderRadius: 14, background: bad ? 'rgba(255,93,108,0.08)' : 'rgba(255,255,255,0.035)', border: `1px solid ${bad ? 'rgba(255,93,108,0.28)' : 'var(--line)'}` }}>
                    <div style={{ width: 26, height: 26, margin: '0 auto 7px', borderRadius: '50%', border: `1.5px solid ${col}`, color: col, fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Archivo' }}>{bad ? 'A' : WLET[k]}</div>
                    <div className="num" style={{ fontSize: 19, fontWeight: 800 }}>{n}</div>
                    <div className="label-cap" style={{ fontSize: 7.5, marginTop: 2 }}>{label}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 11, paddingTop: 11, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--acc)' }}><I.sparkle w={15}/></span>
              <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.7)' }}>Winkel & Abriss automatisch aus dem GPS-Verlauf erkannt.</span>
            </div>
          </div>

          {mats.length > 0 && <>
            <C.SectionLabel>Ausgelegte Gegenstände</C.SectionLabel>
            <div className="card" style={{ padding: '6px 8px' }}>
              {mats.map((m,i) => (
                <div key={m.material} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: MAT[m.material].c + '22', color: MAT[m.material].c }}><MatIcon material={m.material} w={18}/></span>
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>{MAT[m.material].label}</span>
                  <span className="num" style={{ fontSize: 14, fontWeight: 800, color: 'var(--muted)' }}>×{m.count}</span>
                </div>
              ))}
            </div>
          </>}
        </div>
        <Footer>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => nav('overview')}>Später</button>
          <button className="btn btn-primary" style={{ flex: 1.5 }} onClick={() => nav('ausarbeiten')}><I.play w={16}/> Ausarbeiten starten</button>
        </Footer>
      </Screen>
    );
  }

  // ───────────────────────── AUSARBEITEN ─────────────────────────
  function Ausarbeiten({ session, dog, nav }) {
    const N = (session.points || []).length;
    const [t, setT] = useState(0);
    const [work, setWork] = useState(0);
    const [view, setView] = useState('map');
    const [paused, setPaused] = useState(false);
    const [sound, setSound] = useState(true);
    useEffect(() => { if (paused) return; const id = setInterval(() => { setT(x => x+1); setWork(w => Math.min(0.99, w + 0.01)); }, 1000); return () => clearInterval(id); }, [paused]);
    const found = (session.objects||[]).filter(o => o.idx <= work*(N-1)).length;
    const passedW = (session.corners||[]).filter(c => c.idx <= work*(N-1)).length;
    const dist = Math.round(work * (session.steps||0) * 0.75);
    return (
      <Screen>
        <div style={{ padding: '54px 16px 10px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => nav('liegezeit')} style={navBtn}><I.chevL w={17}/></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 999, background: 'rgba(255,93,108,0.16)' }}>
            <span className="rec-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--bad)' }}/>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: '#ff7d88' }}>LIVE</span>
          </div>
          <div style={{ flex: 1 }}/>
          <Seg value={view} set={setView} opts={[['map','Karte'],['sketch','Skizze']]}/>
        </div>

        <div style={{ flex: 1, position: 'relative', margin: '2px 12px 0', borderRadius: 26, overflow: 'hidden', border: '1px solid var(--line)' }}>
          {view === 'map'
            ? <div style={{ position: 'absolute', inset: 0 }}>
                <div style={{ position: 'absolute', inset: 0 }}><V.AerialMap w={360} h={500} seed={4}/></div>
                <div style={{ position: 'absolute', inset: 0 }}><V.RouteFigure session={session} mode="dog" workFrac={work} live aerial w={360} h={500}/></div>
              </div>
            : <div style={{ position: 'absolute', inset: 0, background: '#08100e' }}><V.TrackSketch session={session} mode="dog" workFrac={work} w={360} h={500}/></div>}
          <div style={{ position: 'absolute', top: 13, left: 13, borderRadius: 18, padding: '9px 16px', background: 'rgba(8,9,11,0.42)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}>
            <div className="display num" style={{ fontSize: 30, lineHeight: 1 }}>{fmt(t)}</div>
            <div className="label-cap" style={{ fontSize: 8.5, marginTop: 2, color: 'rgba(255,255,255,0.7)' }}>Suchdauer</div>
          </div>
          <div style={{ position: 'absolute', top: 13, right: 13, borderRadius: 999, padding: '5px 14px 5px 5px', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(8,9,11,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}>
            <C.Avatar dog={dog} size={28}/><span style={{ fontSize: 14, fontWeight: 700 }}>{dog.name}</span>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '26px 6px 12px', display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', background: 'linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.55))' }}>
            {[[dist+' m', 'Distanz'], [found+'/'+(session.objects||[]).length, 'Gegenst.'], [passedW ? passedW + '°' : '—', 'Abweich.'], ['2 m', 'GPS']].map((m,i)=>(
              <React.Fragment key={i}>
                {i>0 && <div style={{ width: 1, height: 26, background: 'rgba(255,255,255,0.18)' }}/>}
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div className="num" style={{ fontSize: 17, fontWeight: 800 }}>{m[0]}</div>
                  <div className="label-cap" style={{ fontSize: 8, marginTop: 1, color: 'rgba(255,255,255,0.6)' }}>{m[1]}</div>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* voice control */}
        <div style={{ flexShrink: 0, padding: '12px 18px 0', display: 'flex', justifyContent: 'center' }}>
          <button onClick={() => {}} style={{ display: 'flex', alignItems: 'center', gap: 10,
            padding: '13px 28px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--line-strong)', color: '#fff', cursor: 'pointer', fontFamily: 'Archivo', fontSize: 15, fontWeight: 700 }}>
            <I.mic w={19}/> Sprachsteuerung
          </button>
        </div>

        <div style={{ flexShrink: 0, padding: '12px 16px 26px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <BigBtn onClick={() => {}} icon={<I.flag w={21}/>} label="Gegenstand"/>
          <BigBtn onClick={() => setSound(s => !s)} icon={<I.sound w={21}/>} label={sound ? 'Ton an' : 'Ton aus'} mint={sound}/>
          <BigBtn onClick={() => nav('auswertung')} icon={<I.stop w={22}/>} label="Stop & Auswerten" danger/>
        </div>
      </Screen>
    );
  }

  // ───────────────────────── AUSWERTUNG ─────────────────────────
  function Auswertung({ session, dog, nav }) {
    const cornersArr = session.corners || [];
    const nW = cornersArr.length;
    const objs = session.objects || [];
    const nBreak = (session.breaks||[]).length;
    const legRows = [];
    for (let i = 0; i <= nW; i++) {
      legRows.push({ name: 'Ausarbeitung Abschnitt ' + (i+1), score: 17 + (i%3), max: 20 });
      if (i < nW) { const c = cornersArr[i]; legRows.push({ name: WINKEL[c.type] || ((i+1)+'. Winkel'), score: c.type === 'spitz' ? 8 + (i%2) : 9 + (i%2), max: 10 }); }
    }
    if (nBreak > 0) legRows.push({ name: 'Abriss (' + nBreak + ') · neu angesetzt', score: Math.max(2, 8 - nBreak*2), max: 10 });
    legRows.push({ name: 'Gegenstände', score: Math.max(0, objs.length*2 + 1), max: Math.max(2, objs.length*2 + 2) });
    const total = legRows.reduce((a,b)=>a+b.score,0), maxT = legRows.reduce((a,b)=>a+b.max,0);
    const score = Math.round(total/maxT*100);
    const mats = byMaterial(objs);
    return (
      <Screen>
        <C.SubHeader title="AUSWERTUNG" onBack={() => nav('overview')}/>
        <div className="scroll" style={{ flex: 1, padding: '4px 18px 20px' }}>
          <div className="card card-glow" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14 }}>
            <V.ScoreRing value={score} size={118} label="Punkte" sub={score>=90?'Vorzüglich':'Gut'}/>
            <div style={{ flex: 1 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>{dog.name} · Heute</div>
              <div className="display" style={{ fontSize: 26, marginBottom: 8 }}>{score>=90?'SEHR':'GUT'}<br/>{score>=90?'GUT.':'GEMACHT.'}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Tag>{session.steps} Schritt</Tag><Tag>{session.surface}</Tag><Tag>{nW} Winkel</Tag>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {[[<I.target w={20}/>, objs.length+'/'+objs.length, 'Gegenstände'], [<I.angle w={20}/>, nW, 'Winkel'], [<I.undo w={20}/>, nBreak, 'Abriss']].map((c,i)=>(
              <div key={i} className="card" style={{ flex: 1, padding: '14px 8px', textAlign: 'center' }}>
                <div style={{ color: i===2 && nBreak>0 ? 'var(--bad)' : 'var(--acc)', display: 'flex', justifyContent: 'center', marginBottom: 7 }}>{c[0]}</div>
                <div className="num" style={{ fontSize: 16, fontWeight: 800 }}>{c[1]}</div>
                <div className="label-cap" style={{ fontSize: 8, marginTop: 2 }}>{c[2]}</div>
              </div>
            ))}
          </div>

          <C.SectionLabel>Bewertung pro Abschnitt</C.SectionLabel>
          <div className="card" style={{ padding: '18px 16px', marginBottom: 16 }}>
            <V.LegBars rows={legRows}/>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className="label-cap">Gesamtpunktzahl</span>
              <span className="num"><span className="display acc" style={{ fontSize: 22 }}>{total}</span><span style={{ color: 'var(--faint)', fontWeight: 700 }}>/{maxT}</span></span>
            </div>
          </div>

          <C.SectionLabel>Fährtenverlauf</C.SectionLabel>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ height: 190 }}><V.TrackSketch session={session} mode="full" w={320} h={190}/></div>
          </div>

          {mats.length > 0 && <>
            <C.SectionLabel>Verwiesene Gegenstände</C.SectionLabel>
            <div className="card" style={{ padding: '6px 8px', marginBottom: 16 }}>
              {mats.map((m,i) => (
                <div key={m.material} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: MAT[m.material].c + '22', color: MAT[m.material].c }}><MatIcon material={m.material} w={18}/></span>
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>{MAT[m.material].label}</span>
                  <span style={{ color: 'var(--acc)' }}><I.check w={17}/></span>
                  <span className="num" style={{ fontSize: 13, fontWeight: 800, color: 'var(--muted)' }}>×{m.count}</span>
                </div>
              ))}
            </div>
          </>}

          <C.SectionLabel>Notiz</C.SectionLabel>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.82)' }}>
              Konzentrierte Nasenarbeit über die gesamte Distanz. {nW>0?'Winkel sauber ausgearbeitet. ':''}Alle Gegenstände überzeugend verwiesen.
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              <Tag>#tiefennase</Tag><Tag>#verweisen</Tag><Tag>#{session.surface.toLowerCase()}</Tag>
            </div>
          </div>
        </div>
        <Footer>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => nav('historie')}>Logbuch</button>
          <button className="btn btn-primary" style={{ flex: 1.4 }} onClick={() => nav('overview')}><I.check w={16}/> Speichern</button>
        </Footer>
      </Screen>
    );
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
              <button key={i} onClick={() => nav('auswertung')} className="card" style={{ padding: 13, display: 'flex', alignItems: 'center', gap: 13, width: '100%', textAlign: 'left', cursor: 'pointer', color: '#fff' }}>
                <div style={{ width: 64, height: 64, borderRadius: 14, overflow: 'hidden', flexShrink: 0, background: '#0a1310', border: '1px solid var(--line)' }}>
                  <V.TrackSketch seed={h.seed} mode="full" w={64} h={64} showLabels={false}/>
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
              </button>
            ))}
          </div>
        </div>
      </Screen>
    );
  }

  // ── shared bits ──
  const navBtn = { width: 36, height: 36, borderRadius: 11, border: '1px solid var(--line-strong)', background: 'rgba(255,255,255,0.06)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
  function Seg({ value, set, opts }) {
    return (
      <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 11, padding: 3, gap: 2 }}>
        {opts.map(([k,l]) => <button key={k} onClick={() => set(k)} style={{ padding: '6px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'Archivo', fontSize: 11.5, fontWeight: 700, background: value===k?'var(--acc)':'transparent', color: value===k?'#04201b':'var(--muted)' }}>{l}</button>)}
      </div>
    );
  }
  function CtrlBtn({ onClick, icon, label }) {
    return <button onClick={onClick} className="btn btn-ghost" style={{ flexDirection: 'column', gap: 4, height: 62, flex: 1, padding: 8 }}>{icon}<span style={{ fontSize: 10.5 }}>{label}</span></button>;
  }
  function BigBtn({ onClick, icon, label, danger, mint }) {
    const bg = danger ? '#ff4b57' : mint ? 'var(--acc)' : 'rgba(255,255,255,0.05)';
    const col = danger ? '#fff' : mint ? '#04201b' : '#fff';
    return (
      <button onClick={onClick} style={{ flex: 1, height: 74, borderRadius: 22, border: (danger || mint) ? 'none' : '1px solid var(--line-strong)',
        background: bg, color: col, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'Archivo',
        WebkitTapHighlightColor: 'transparent' }}>
        {icon}<span style={{ fontSize: 12.5, fontWeight: 700 }}>{label}</span>
      </button>
    );
  }
  function Tag({ children }) { return <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: 'var(--muted)' }}>{children}</span>; }
  function Sheet({ title, onClose, children }) {
    return (
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', animation: 'anyvoFade .2s ease' }}>
        <div onClick={e => e.stopPropagation()} className="glass" style={{ width: '100%', borderRadius: '24px 24px 0 0', padding: '18px 18px 30px', animation: 'anyvoSheet .28s cubic-bezier(.2,.9,.3,1)' }}>
          <div style={{ width: 38, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.2)', margin: '0 auto 16px' }}/>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span className="display" style={{ fontSize: 18 }}>{title}</span>
            <button onClick={onClose} style={{ ...navBtn, width: 32, height: 32 }}><I.x w={15}/></button>
          </div>
          {children}
        </div>
      </div>
    );
  }
  function Screen({ children }) { return <div className="anyvo" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000' }}>{children}</div>; }
  function Footer({ children }) {
    return (
      <div style={{ flexShrink: 0, padding: '12px 18px 26px', display: 'flex', gap: 10, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, top: -22, background: 'linear-gradient(180deg, rgba(0,0,0,0), #000 40%)', pointerEvents: 'none' }}/>
        <div style={{ position: 'relative', display: 'flex', gap: 10, width: '100%' }}>{children}</div>
      </div>
    );
  }

  window.Flow = { Legen, Liegezeit, Ausarbeiten, Auswertung, Historie };
})();
