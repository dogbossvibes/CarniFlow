// ANYVO Fährten — data viz primitives
(function () {
  const A = '#15e6c3';
  const ACC = () => (window.__ACC || A);

  // ---- polyline geometry helpers ----
  const BASE = [[0.14,0.86],[0.31,0.20],[0.67,0.27],[0.81,0.62],[0.53,0.83],[0.28,0.56]];
  function track(legs) { return BASE.slice(0, Math.max(2, Math.min(legs + 1, BASE.length))); }
  function px(pts, w, h, pad) {
    const p = pad ?? 0; return pts.map(([x, y]) => [p + x * (w - 2*p), p + y * (h - 2*p)]);
  }
  function lengths(pts) {
    let total = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]);
      seg.push(d); total += d;
    }
    return { seg, total };
  }
  function at(pts, t) { // point at fraction 0..1 of total length
    const { seg, total } = lengths(pts); let want = t * total;
    for (let i = 0; i < seg.length; i++) {
      if (want <= seg[i] || i === seg.length-1) {
        const f = seg[i] ? want/seg[i] : 0;
        return [pts[i][0]+(pts[i+1][0]-pts[i][0])*f, pts[i][1]+(pts[i+1][1]-pts[i][1])*f];
      }
      want -= seg[i];
    }
    return pts[pts.length-1];
  }
  const poly = (pts) => pts.map(p => p.join(',')).join(' ');

  // ──────────────────────────────────────────────
  // TrackSketch — abstract Fährte diagram
  // ──────────────────────────────────────────────
  function TrackSketch({ legs = 3, objects = 3, w = 300, h = 200, progress = 1, accent = ACC(), showLabels = true }) {
    const pts = px(track(legs), w, h, 26);
    const objT = Array.from({ length: objects }, (_, i) => (i + 1) / (objects + 1));
    const drawn = poly(pts);
    const cur = at(pts, progress);
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="ts-line" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor={accent} stopOpacity="0.4"/>
            <stop offset="1" stopColor={accent}/>
          </linearGradient>
        </defs>
        {/* faint full route */}
        <polyline points={drawn} fill="none" stroke={accent} strokeOpacity="0.16"
          strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="2 6"/>
        {/* travelled */}
        <polyline points={drawn} fill="none" stroke="url(#ts-line)" strokeWidth="3"
          strokeLinejoin="round" strokeLinecap="round"
          style={progress < 1 ? { strokeDasharray: 1000, strokeDashoffset: 1000 * (1 - progress) } : {}}/>
        {/* angle markers */}
        {pts.slice(1, -1).map((p, i) => (
          <g key={i}>
            <circle cx={p[0]} cy={p[1]} r="9" fill="none" stroke={accent} strokeOpacity="0.5" strokeWidth="1.4"/>
            {showLabels && <text x={p[0]} y={p[1]+3.5} fontSize="9" fontWeight="700" fill={accent}
              textAnchor="middle" fontFamily="Archivo">{i+1}</text>}
          </g>
        ))}
        {/* objects */}
        {objT.map((t, i) => {
          const o = at(pts, t); const found = progress >= t;
          return <g key={i} transform={`translate(${o[0]},${o[1]}) rotate(45)`}>
            <rect x="-4.5" y="-4.5" width="9" height="9" rx="1.6"
              fill={found ? accent : 'none'} stroke={accent} strokeWidth="1.6"
              fillOpacity={found ? 1 : 0}/>
          </g>;
        })}
        {/* start flag */}
        <g transform={`translate(${pts[0][0]},${pts[0][1]})`}>
          <circle r="6.5" fill={accent}/>
          <circle r="11" fill="none" stroke={accent} strokeOpacity="0.4" strokeWidth="1.4"/>
        </g>
        {/* current pos */}
        {progress < 1 && (
          <g transform={`translate(${cur[0]},${cur[1]})`}>
            <circle r="13" fill={accent} opacity="0.18" className="pulse-dot"/>
            <circle r="5.5" fill={accent} stroke="#04201b" strokeWidth="2"/>
          </g>
        )}
      </svg>
    );
  }

  // ──────────────────────────────────────────────
  // GpsMap — dark terrain map with live track
  // ──────────────────────────────────────────────
  function GpsMap({ legs = 3, objects = 3, progress = 0.45, w = 340, h = 230, live = true, accent = ACC() }) {
    const pts = px(track(legs), w, h, 34);
    const cur = at(pts, progress);
    const objT = Array.from({ length: objects }, (_, i) => (i + 1) / (objects + 1));
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="gm-bg" cx="50%" cy="40%" r="75%">
            <stop offset="0" stopColor="#10211f"/><stop offset="1" stopColor="#070a0a"/>
          </radialGradient>
          <linearGradient id="gm-line" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor={accent} stopOpacity="0.5"/><stop offset="1" stopColor={accent}/>
          </linearGradient>
          <filter id="gm-glow"><feGaussianBlur stdDeviation="3"/></filter>
        </defs>
        <rect width={w} height={h} fill="url(#gm-bg)"/>
        {/* field blobs */}
        <g opacity="0.5">
          <path d={`M${-10} ${h*0.7} Q ${w*0.3} ${h*0.5} ${w*0.55} ${h*0.78} T ${w+10} ${h*0.7} V ${h+10} H -10 Z`} fill="#0c1916"/>
          <ellipse cx={w*0.74} cy={h*0.28} rx={w*0.3} ry={h*0.22} fill="#0e1d1a" opacity="0.7"/>
        </g>
        {/* grid / paths */}
        <g stroke="#1d2a28" strokeWidth="1">
          {[0.22,0.46,0.7,0.92].map((f,i)=><line key={i} x1="0" y1={h*f} x2={w} y2={h*f}/>)}
          {[0.2,0.5,0.78].map((f,i)=><line key={'v'+i} x1={w*f} y1="0" x2={w*f} y2={h}/>)}
        </g>
        <path d={`M0 ${h*0.55} L ${w*0.42} ${h*0.5} L ${w*0.6} ${h*0.85} L ${w} ${h*0.8}`}
          fill="none" stroke="#243531" strokeWidth="6" strokeLinecap="round" opacity="0.7"/>
        {/* track glow + line */}
        <polyline points={poly(pts)} fill="none" stroke={accent} strokeWidth="6" opacity="0.35"
          filter="url(#gm-glow)" strokeLinejoin="round" strokeLinecap="round"
          style={progress<1?{strokeDasharray:1400,strokeDashoffset:1400*(1-progress)}:{}}/>
        <polyline points={poly(pts)} fill="none" stroke="url(#gm-line)" strokeWidth="3.5"
          strokeLinejoin="round" strokeLinecap="round" className={live?'flow-line':''}
          style={progress<1?{strokeDasharray:1400,strokeDashoffset:1400*(1-progress)}:{}}/>
        {/* future route (dotted) */}
        {progress<1 && <polyline points={poly(pts)} fill="none" stroke={accent} strokeOpacity="0.2"
          strokeWidth="2" strokeDasharray="1 7" strokeLinecap="round"/>}
        {/* objects */}
        {objT.map((t,i)=>{ const o=at(pts,t); const f=progress>=t;
          return <g key={i} transform={`translate(${o[0]},${o[1]})`}>
            <circle r="10" fill={f?accent:'#0b1413'} fillOpacity={f?0.18:1} stroke={accent} strokeWidth="1.5" strokeOpacity={f?1:0.5}/>
            <rect x="-3.5" y="-3.5" width="7" height="7" rx="1.2" transform="rotate(45)" fill={f?accent:'none'} stroke={accent} strokeWidth="1.4"/>
          </g>;})}
        {/* start */}
        <g transform={`translate(${pts[0][0]},${pts[0][1]})`}>
          <circle r="7" fill={accent}/><circle r="13" fill="none" stroke={accent} strokeOpacity="0.4"/>
        </g>
        {/* live position */}
        {progress<1 && <g transform={`translate(${cur[0]},${cur[1]})`}>
          <circle r="22" fill={accent} opacity="0.12" className="pulse-dot"/>
          <circle r="9" fill={accent} opacity="0.25"/>
          <circle r="5.5" fill="#fff" stroke={accent} strokeWidth="2.5"/>
        </g>}
      </svg>
    );
  }

  // ──────────────────────────────────────────────
  // ScoreRing
  // ──────────────────────────────────────────────
  function ScoreRing({ value = 92, max = 100, size = 132, stroke = 11, label, accent = ACC(), sub }) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - value / max);
    return (
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size}>
          <defs>
            <linearGradient id={`sr${size}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={accent}/><stop offset="1" stopColor="#00c9d6"/>
            </linearGradient>
          </defs>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke}/>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`url(#sr${size})`} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
            transform={`rotate(-90 ${size/2} ${size/2})`}
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

  // ──────────────────────────────────────────────
  // Sparkline / area chart of progress
  // ──────────────────────────────────────────────
  function LineChart({ data = [82,86,84,90,88,93,91,94], w = 300, h = 96, accent = ACC(), labels }) {
    const min = Math.min(...data) - 3, max = Math.max(...data) + 2;
    const X = i => 8 + i * (w - 16) / (data.length - 1);
    const Y = v => h - 14 - (v - min) / (max - min) * (h - 28);
    const line = data.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
    const area = `M${X(0)},${h-14} L ${line.split(' ').join(' L ')} L ${X(data.length-1)},${h-14} Z`.replace(/,/g,' ').replace('M8 ',`M${X(0)} `);
    return (
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="lc-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={accent} stopOpacity="0.28"/><stop offset="1" stopColor={accent} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon points={`${X(0)},${h-14} ${line} ${X(data.length-1)},${h-14}`} fill="url(#lc-area)"/>
        <polyline points={line} fill="none" stroke={accent} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
        {data.map((v,i)=><circle key={i} cx={X(i)} cy={Y(v)} r={i===data.length-1?4:2.5}
          fill={i===data.length-1?accent:'#0d0e10'} stroke={accent} strokeWidth="1.6"/>)}
        {labels && data.map((v,i)=><text key={'l'+i} x={X(i)} y={h-2} fontSize="8" fill="rgba(255,255,255,0.34)"
          textAnchor="middle" fontFamily="Archivo" fontWeight="600">{labels[i]}</text>)}
      </svg>
    );
  }

  // ──────────────────────────────────────────────
  // LegBars — per-section scoring
  // ──────────────────────────────────────────────
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
                <span className="num" style={{ fontSize: 12.5, fontWeight: 700 }}>
                  {r.score}<span style={{ color: 'rgba(255,255,255,0.34)' }}>/{r.max}</span>
                </span>
              </div>
              <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <div style={{ width: pct + '%', height: '100%', borderRadius: 4, background: col,
                  boxShadow: `0 0 8px ${col}77`, transition: 'width .8s cubic-bezier(.2,.8,.2,1)' }}/>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  window.Viz = { TrackSketch, GpsMap, ScoreRing, LineChart, LegBars };
})();
