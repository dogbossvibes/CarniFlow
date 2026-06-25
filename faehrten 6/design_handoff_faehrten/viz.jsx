// ANYVO Fährten — data viz + live track recorder model
(function () {
  const A = '#15e6c3';
  const ACC = () => (window.__ACC || A);

  // ── Materials (Gegenstand-Typen) ──
  const MATERIALS = {
    stoff:    { label: 'Stoff',    icon: 'stoff',    c: '#15e6c3' },
    holz:     { label: 'Holz',     icon: 'holz',     c: '#ffb547' },
    leder:    { label: 'Leder',    icon: 'leder',    c: '#d08a5a' },
    plastik:  { label: 'Plastik',  icon: 'plastik',  c: '#8ad7ff' },
    diverses: { label: 'Diverses', icon: 'diverses', c: '#a78bff' },
  };
  const MAT_ORDER = ['stoff', 'holz', 'leder', 'plastik', 'diverses'];

  // ── geometry over arbitrary normalized point arrays ──
  function cum(pts) { let c = [0], t = 0; for (let i = 1; i < pts.length; i++) { t += Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]); c.push(t); } return { c, total: t }; }
  function ptAtFrac(pts, f) { if (pts.length < 2) return pts[0]; const { c, total } = cum(pts); const w = f * total; for (let i = 1; i < pts.length; i++) { if (c[i] >= w) { const s = c[i]-c[i-1], u = s ? (w-c[i-1])/s : 0; return [pts[i-1][0]+(pts[i][0]-pts[i-1][0])*u, pts[i-1][1]+(pts[i][1]-pts[i-1][1])*u]; } } return pts[pts.length-1]; }
  function sliceFrac(pts, f) { if (pts.length < 2) return pts.slice(); const { c, total } = cum(pts); const w = f * total; const out = [pts[0]]; for (let i = 1; i < pts.length; i++) { if (c[i] <= w) out.push(pts[i]); else { const s = c[i]-c[i-1], u = s ? (w-c[i-1])/s : 0; out.push([pts[i-1][0]+(pts[i][0]-pts[i-1][0])*u, pts[i-1][1]+(pts[i][1]-pts[i-1][1])*u]); break; } } return out; }

  // ── deterministic sample recorded track (for demos / history) ──
  function rng(seed) { let s = (seed * 9301 + 49297) % 233280; return () => (s = (s * 9301 + 49297) % 233280) / 233280; }
  const TURN_TYPES = ['right','left','spitz'];
  function makeSample(seed = 1) {
    const rnd = rng(seed || 1);
    const pts = []; let x = 0.18 + rnd() * 0.08, y = 0.86; let ang = -Math.PI / 2 + (rnd() - 0.5) * 0.2;
    const corners = []; const objects = []; const breaks = [];
    const nTurns = 3 + Math.floor(rnd() * 2);
    const ticks = 60 + Math.floor(rnd() * 24);
    let nextTurn = 11 + Math.floor(rnd() * 5);
    const breakAt = Math.floor(ticks * (0.5 + rnd() * 0.22));
    pts.push([x, y]);
    for (let i = 1; i < ticks; i++) {
      let nx = x + Math.cos(ang) * 0.013 + (rnd() - 0.5) * 0.003;
      let ny = y + Math.sin(ang) * 0.013 + (rnd() - 0.5) * 0.003;
      if (nx < 0.1 || nx > 0.9) { ang = Math.PI - ang; nx = Math.min(0.9, Math.max(0.1, nx)); }
      if (ny < 0.12 || ny > 0.88) { ang = -ang; ny = Math.min(0.88, Math.max(0.12, ny)); }
      x = nx; y = ny; pts.push([x, y]);
      if (i === breakAt) breaks.push(pts.length - 1);
      if (i === nextTurn && corners.length < nTurns) {
        const type = TURN_TYPES[Math.floor(rnd() * (corners.length === 0 ? 2 : 3))];
        const mag = type === 'spitz' ? (Math.PI * 0.8) : (Math.PI / 2);
        const sign = type === 'left' ? -1 : type === 'spitz' ? (rnd() > 0.5 ? 1 : -1) : 1;
        ang += sign * (mag + (rnd() - 0.5) * 0.2);
        corners.push({ idx: pts.length - 1, type });
        nextTurn += 11 + Math.floor(rnd() * 5);
      }
    }
    const nObj = 3 + Math.floor(rnd() * 2);
    for (let k = 1; k <= nObj; k++) { const idx = Math.floor(pts.length * k / (nObj + 1)); objects.push({ idx, material: MAT_ORDER[Math.floor(rnd() * MAT_ORDER.length)] }); }
    const steps = 360 + Math.floor(rnd() * 280);
    return { points: pts, corners, objects, breaks, steps, surface: ['Acker','Wiese','Wald'][seed % 3] };
  }
  const DEFAULT = makeSample(7);

  // ── core route renderer ──
  function RouteFigure({ session, w = 320, h = 200, pad = 26, accent = ACC(), terrain = false,
    mode = 'full', workFrac = 1, live = false, showLabels = true, showStart = true, seed, aerial = false }) {
    const s = session || (seed != null ? makeSample(seed) : DEFAULT);
    const pts = s.points || [];
    if (pts.length < 2) {
      return <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio={terrain ? 'xMidYMid slice' : 'xMidYMid meet'}>
        {terrain && <rect width={w} height={h} fill="#070a0a"/>}
        {pts[0] && <circle cx={pad + pts[0][0]*(w-2*pad)} cy={pad + pts[0][1]*(h-2*pad)} r="7" fill={accent}/>}
      </svg>;
    }
    const N = pts.length;
    const X = p => pad + p[0] * (w - 2 * pad), Y = p => pad + p[1] * (h - 2 * pad);
    const poly = arr => arr.map(p => `${X(p).toFixed(1)},${Y(p).toFixed(1)}`).join(' ');
    const bright = mode === 'dog' ? sliceFrac(pts, workFrac) : pts;
    const head = mode === 'dog' ? ptAtFrac(pts, workFrac) : pts[N - 1];
    const headFrac = mode === 'dog' ? workFrac : 1;
    const objFound = (idx) => mode === 'dog' ? (idx <= headFrac * (N - 1)) : (mode !== 'preview' ? true : false);
    const corners = s.corners || [];
    const objects = s.objects || [];
    const gi = `rf${Math.round(w)}${terrain ? 't' : ''}`;
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio={(terrain && !aerial) ? 'xMidYMid slice' : (aerial ? 'none' : 'xMidYMid meet')}>
        <defs>
          <linearGradient id={gi+'l'} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor={accent} stopOpacity="0.45"/><stop offset="1" stopColor={accent}/>
          </linearGradient>
          {terrain && <radialGradient id={gi+'bg'} cx="50%" cy="38%" r="78%">
            <stop offset="0" stopColor="#10211f"/><stop offset="1" stopColor="#070a0a"/>
          </radialGradient>}
          <filter id={gi+'g'}><feGaussianBlur stdDeviation="3"/></filter>
        </defs>
        {terrain && !aerial && <>
          <rect width={w} height={h} fill={`url(#${gi}bg)`}/>
          <g opacity="0.55">
            <path d={`M-10 ${h*0.72} Q ${w*0.3} ${h*0.52} ${w*0.55} ${h*0.8} T ${w+10} ${h*0.72} V ${h+10} H -10 Z`} fill="#0c1916"/>
            <ellipse cx={w*0.74} cy={h*0.26} rx={w*0.3} ry={h*0.22} fill="#0e1d1a" opacity="0.7"/>
          </g>
          <g stroke="#1b2826" strokeWidth="1">
            {[0.24,0.5,0.74].map((f,i)=><line key={i} x1="0" y1={h*f} x2={w} y2={h*f}/>)}
            {[0.28,0.62].map((f,i)=><line key={'v'+i} x1={w*f} y1="0" x2={w*f} y2={h}/>)}
          </g>
        </>}
        {/* dim base (whole laid track) */}
        {mode === 'dog' && <polyline points={poly(pts)} fill="none" stroke={accent} strokeOpacity="0.22"
          strokeWidth="2.5" strokeDasharray="1 7" strokeLinecap="round" strokeLinejoin="round"/>}
        {/* glow */}
        {(terrain || aerial) && <polyline points={poly(bright)} fill="none" stroke={accent} strokeWidth={aerial ? 7 : 6} opacity={aerial ? 0.5 : 0.32}
          filter={`url(#${gi}g)`} strokeLinejoin="round" strokeLinecap="round"/>}
        {/* main line */}
        <polyline points={poly(bright)} fill="none" stroke={`url(#${gi}l)`} strokeWidth={(terrain||aerial) ? 3.8 : 3}
          strokeLinejoin="round" strokeLinecap="round" className={live ? 'flow-line' : ''}/>
        {/* corners (Winkel) — typed: R rechter, L linker, S Spitzwinkel */}
        {corners.map((cn, i) => { const p = pts[cn.idx]; if (!p) return null; const shown = mode !== 'dog' || cn.idx <= headFrac*(N-1);
          const TCOL = { right: accent, left: accent, spitz: '#ffb547' };
          const TLET = { right: 'R', left: 'L', spitz: 'S' };
          const col = TCOL[cn.type] || accent; const let_ = TLET[cn.type] || (i+1);
          return <g key={'c'+i} opacity={shown ? 1 : 0.3}>
            <circle cx={X(p)} cy={Y(p)} r="8.5" fill="none" stroke={col} strokeOpacity="0.7" strokeWidth="1.5"/>
            {showLabels && <text x={X(p)} y={Y(p)+3.2} fontSize="8.5" fontWeight="800" fill={col} textAnchor="middle" fontFamily="Archivo">{let_}</text>}
          </g>; })}
        {/* Abriss (track breaks) */}
        {(s.breaks||[]).map((bi, i) => { const a = pts[bi], b = pts[bi+1]; if (!a || !b) return null;
          const shown = mode !== 'dog' || bi <= headFrac*(N-1);
          const mx = (X(a)+X(b))/2, my = (Y(a)+Y(b))/2;
          return <g key={'br'+i} opacity={shown ? 1 : 0.3}>
            <circle cx={mx} cy={my} r="15" fill="#ff5d6c" opacity="0.1"/>
            <line x1={X(a)-(Y(b)-Y(a))*0.5} y1={Y(a)+(X(b)-X(a))*0.5} x2={X(a)+(Y(b)-Y(a))*0.5} y2={Y(a)-(X(b)-X(a))*0.5} stroke="#ff5d6c" strokeWidth="2" strokeLinecap="round"/>
            <circle cx={mx} cy={my} r="8.5" fill="#160a0c" stroke="#ff5d6c" strokeWidth="1.6"/>
            <text x={mx} y={my+3.2} fontSize="8.5" fontWeight="800" fill="#ff5d6c" textAnchor="middle" fontFamily="Archivo">A</text>
          </g>; })}
        {/* objects */}
        {objects.map((o, i) => { const p = pts[o.idx]; if (!p) return null; const f = objFound(o.idx); const col = (MATERIALS[o.material]||MATERIALS.stoff).c;
          return <g key={'o'+i} transform={`translate(${X(p)},${Y(p)})`}>
            {f && terrain && <circle r="11" fill={col} opacity="0.16"/>}
            <rect x="-4.6" y="-4.6" width="9.2" height="9.2" rx="1.6" transform="rotate(45)"
              fill={f ? col : 'none'} stroke={col} strokeWidth="1.7" fillOpacity={f ? 1 : 0}/>
          </g>; })}
        {/* start flag */}
        {showStart && <g transform={`translate(${X(pts[0])},${Y(pts[0])})`}>
          <circle r="6.5" fill={accent}/><circle r="11" fill="none" stroke={accent} strokeOpacity="0.4" strokeWidth="1.4"/>
        </g>}
        {/* head */}
        {(mode === 'dog' || live) && head && (aerial ? (
          <g transform={`translate(${X(head)},${Y(head)})`}>
            {/* Apple-Maps-style location puck: teal halo + blue dot */}
            <circle r="19" fill="#15e6c3" opacity="0.22" className="pulse-dot"/>
            <circle r="11" fill="#1f8f7e" opacity="0.5"/>
            <circle r="8.5" fill="#fff"/>
            <circle r="6" fill="#2f9bff"/>
          </g>
        ) : (
          <g transform={`translate(${X(head)},${Y(head)})`}>
            <circle r={terrain ? 20 : 14} fill={accent} opacity="0.14" className="pulse-dot"/>
            <circle r="9" fill={accent} opacity="0.25"/>
            <circle r="5.5" fill="#fff" stroke={accent} strokeWidth="2.5"/>
          </g>
        ))}
      </svg>
    );
  }

  const TrackSketch = (p) => <RouteFigure {...p} terrain={false}/>;
  const GpsMap = (p) => <RouteFigure {...p} terrain={true}/>;

  // ── AerialMap — stylized satellite/aerial basemap (Apple-Maps-Satellit look) ──
  function AerialMap({ w = 360, h = 480, seed = 3 }) {
    const rnd = rng((seed || 1) * 131 + 7);
    // building blocks
    const blocks = []; for (let i = 0; i < 16; i++) blocks.push({ x: rnd()*w, y: rnd()*h, bw: 26+rnd()*70, bh: 26+rnd()*64, r: rnd()*0.5, t: rnd() });
    const trees = []; for (let i = 0; i < 26; i++) trees.push({ x: rnd()*w, y: rnd()*h, r: 5+rnd()*13 });
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="am-ground" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5b5f55"/><stop offset="1" stopColor="#474b41"/>
          </linearGradient>
          <linearGradient id="am-water" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3a7b78"/><stop offset="1" stopColor="#27595c"/>
          </linearGradient>
          <filter id="am-soft"><feGaussianBlur stdDeviation="1.1"/></filter>
          <filter id="am-blur"><feGaussianBlur stdDeviation="4"/></filter>
        </defs>
        <rect width={w} height={h} fill="url(#am-ground)"/>
        {/* water in a corner */}
        <path d={`M${w*0.66} -10 L ${w+10} -10 L ${w+10} ${h*0.42} Q ${w*0.84} ${h*0.34} ${w*0.66} -10 Z`} fill="url(#am-water)"/>
        {/* park / greenery */}
        <g filter="url(#am-blur)" opacity="0.85">
          <ellipse cx={w*0.2} cy={h*0.82} rx={w*0.3} ry={h*0.16} fill="#46603c"/>
          <ellipse cx={w*0.8} cy={h*0.7} rx={w*0.22} ry={h*0.12} fill="#425a39"/>
        </g>
        {/* roads — light asphalt network */}
        <g stroke="#85887c" strokeLinecap="round" filter="url(#am-soft)">
          <line x1="-10" y1={h*0.3} x2={w+10} y2={h*0.22} strokeWidth="22"/>
          <line x1={w*0.42} y1="-10" x2={w*0.58} y2={h+10} strokeWidth="18"/>
          <line x1="-10" y1={h*0.62} x2={w+10} y2={h*0.74} strokeWidth="16"/>
          <line x1={w*0.1} y1={h+10} x2={w*0.34} y2="-10" strokeWidth="13"/>
        </g>
        <g stroke="#9a9d90" strokeWidth="2" strokeDasharray="7 9" opacity="0.5">
          <line x1="-10" y1={h*0.3} x2={w+10} y2={h*0.22}/>
          <line x1={w*0.42} y1="-10" x2={w*0.58} y2={h+10}/>
        </g>
        {/* buildings */}
        <g filter="url(#am-soft)">
          {blocks.map((b, i) => (
            <rect key={i} x={b.x} y={b.y} width={b.bw} height={b.bh} rx={b.r*5}
              fill={b.t > 0.5 ? '#3c3f38' : '#54574c'} opacity="0.92"/>
          ))}
        </g>
        {/* trees */}
        <g opacity="0.7">{trees.map((t, i) => <circle key={i} cx={t.x} cy={t.y} r={t.r} fill="#3d5836"/>)}</g>
        {/* vignette + cool grade */}
        <rect width={w} height={h} fill="#0a1412" opacity="0.12"/>
        <radialGradient id="am-vig" cx="50%" cy="50%" r="75%">
          <stop offset="0.6" stopColor="#000" stopOpacity="0"/><stop offset="1" stopColor="#000" stopOpacity="0.4"/>
        </radialGradient>
        <rect width={w} height={h} fill="url(#am-vig)"/>
      </svg>
    );
  }

  // ── ScoreRing ──
  function ScoreRing({ value = 92, max = 100, size = 132, stroke = 11, label, accent = ACC(), sub }) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - value / max);
    return (
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size}>
          <defs><linearGradient id={`sr${size}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={accent}/><stop offset="1" stopColor="#00c9d6"/></linearGradient></defs>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke}/>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`url(#sr${size})`} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size/2} ${size/2})`}
            style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)', filter: `drop-shadow(0 0 6px ${accent}66)` }}/>
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="display num" style={{ fontSize: size*0.32, lineHeight: 1 }}>{value}</div>
          {label && <div className="label-cap" style={{ marginTop: 5 }}>{label}</div>}
          {sub && <div style={{ fontSize: 11, color: accent, fontWeight: 700, marginTop: 2 }}>{sub}</div>}
        </div>
      </div>
    );
  }

  // ── LineChart ──
  function LineChart({ data = [82,86,84,90,88,93,91,94], w = 300, h = 96, accent = ACC(), labels }) {
    const min = Math.min(...data) - 3, max = Math.max(...data) + 2;
    const X = i => 8 + i * (w - 16) / (data.length - 1);
    const Y = v => h - 14 - (v - min) / (max - min) * (h - 28);
    const line = data.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
    return (
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs><linearGradient id="lc-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={accent} stopOpacity="0.28"/><stop offset="1" stopColor={accent} stopOpacity="0"/></linearGradient></defs>
        <polygon points={`${X(0)},${h-14} ${line} ${X(data.length-1)},${h-14}`} fill="url(#lc-area)"/>
        <polyline points={line} fill="none" stroke={accent} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
        {data.map((v,i)=><circle key={i} cx={X(i)} cy={Y(v)} r={i===data.length-1?4:2.5} fill={i===data.length-1?accent:'#0d0e10'} stroke={accent} strokeWidth="1.6"/>)}
        {labels && data.map((v,i)=><text key={'l'+i} x={X(i)} y={h-2} fontSize="8" fill="rgba(255,255,255,0.34)" textAnchor="middle" fontFamily="Archivo" fontWeight="600">{labels[i]}</text>)}
      </svg>
    );
  }

  // ── LegBars ──
  function LegBars({ rows, accent = ACC() }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {rows.map((r, i) => {
          const pct = Math.round(r.score / r.max * 100);
          const col = pct >= 90 ? accent : pct >= 75 ? '#7fe6b0' : '#ffb547';
          return (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.78)' }}>{r.name}</span>
                <span className="num" style={{ fontSize: 12.5, fontWeight: 700 }}>{r.score}<span style={{ color: 'rgba(255,255,255,0.34)' }}>/{r.max}</span></span>
              </div>
              <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <div style={{ width: pct + '%', height: '100%', borderRadius: 4, background: col, boxShadow: `0 0 8px ${col}77`, transition: 'width .8s cubic-bezier(.2,.8,.2,1)' }}/>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  window.Viz = { TrackSketch, GpsMap, RouteFigure, AerialMap, ScoreRing, LineChart, LegBars, makeSample, MATERIALS, MAT_ORDER };
})();
