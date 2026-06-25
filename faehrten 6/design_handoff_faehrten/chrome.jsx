// ANYVO Fährten — shared chrome
(function () {
  const I = window.Icon;

  // Top sub-header for the Fährten area
  function SubHeader({ title = 'FÄHRTEN', onBack, dog, dogs, onDog, right }) {
    return (
      <div style={{ paddingTop: 56, paddingLeft: 18, paddingRight: 18, paddingBottom: 12, flexShrink: 0,
        background: 'linear-gradient(180deg,#000 60%, rgba(0,0,0,0))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {onBack ? (
            <button onClick={onBack} className="btn-ghost" style={{ width: 38, height: 38, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--line-strong)', color: '#fff', cursor: 'pointer' }}>
              <I.chevL w={18}/>
            </button>
          ) : (
            <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--acc-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--acc)' }}>
              <I.route w={18}/>
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div className="display" style={{ fontSize: 21, letterSpacing: '0.02em' }}>{title}</div>
          </div>
          {dogs && <DogSwitch dog={dog} dogs={dogs} onDog={onDog}/>}
          {right}
        </div>
      </div>
    );
  }

  function DogSwitch({ dog, dogs, onDog }) {
    const [open, setOpen] = React.useState(false);
    const d = dogs.find(x => x.id === dog) || dogs[0];
    return (
      <div style={{ position: 'relative' }}>
        <button onClick={() => setOpen(o => !o)} className="glass" style={{ display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px 6px 6px', borderRadius: 999, cursor: 'pointer', color: '#fff' }}>
          <Avatar dog={d} size={28}/>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{d.name}</span>
          <I.chevD w={14}/>
        </button>
        {open && (
          <div className="glass" style={{ position: 'absolute', top: 44, right: 0, zIndex: 40, borderRadius: 16,
            padding: 6, width: 168, boxShadow: '0 20px 50px -10px rgba(0,0,0,0.7)' }}>
            {dogs.map(x => (
              <button key={x.id} onClick={() => { onDog(x.id); setOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 8px', borderRadius: 11,
                  background: x.id === dog ? 'var(--acc-dim)' : 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <Avatar dog={x} size={30}/>
                <div style={{ textAlign: 'left', flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{x.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{x.breed} · {x.level}</div>
                </div>
                {x.id === dog && <span style={{ color: 'var(--acc)' }}><I.check w={15}/></span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function Avatar({ dog, size = 30 }) {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: `linear-gradient(135deg, ${dog.c1}, ${dog.c2})`, position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.12)' }}>
        <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: size*0.4, color: '#05231d' }}>{dog.name[0]}</span>
      </div>
    );
  }

  function BottomNav({ active = 'Training' }) {
    const items = [
      { k: 'Start', icon: I.home }, { k: 'Hunde', icon: I.paw },
      { k: 'Training', icon: I.dumbbell }, { k: 'Hub', icon: I.grid }, { k: 'Profil', icon: I.user },
    ];
    return (
      <div style={{ flexShrink: 0, position: 'relative', paddingBottom: 24, paddingTop: 10,
        background: '#000', borderTop: '1px solid var(--line)' }}>
        {active === 'Start' && <div style={{ position: 'absolute', inset: 0, top: 0, pointerEvents: 'none',
          background: 'radial-gradient(80% 120% at 12% 100%, rgba(21,230,195,0.16), transparent 60%)' }}/>}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '0 6px' }}>
          {items.map(it => {
            const on = it.k === active;
            return (
              <div key={it.k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                color: on ? 'var(--acc)' : 'var(--faint)', position: 'relative', padding: '2px 4px' }}>
                <it.icon w={22}/>
                <span style={{ fontSize: 10, fontWeight: on ? 700 : 600, letterSpacing: '0.01em' }}>{it.k}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Section label row
  function SectionLabel({ children, action, onAction }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 11px' }}>
        <span className="eyebrow">{children}</span>
        {action && <button onClick={onAction} style={{ background: 'none', border: 'none', color: 'var(--acc)',
          fontFamily: 'Archivo', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
          {action} <I.chevR w={13}/></button>}
      </div>
    );
  }

  // Weather strip
  function WeatherStrip({ wx, compact }) {
    const items = [
      { icon: I.temp, v: wx.temp + '°', l: 'Temp' },
      { icon: I.wind, v: wx.wind, l: wx.windDir },
      { icon: I.drop, v: wx.soil + '%', l: 'Boden' },
      { icon: I.leaf, v: wx.humid + '%', l: 'Luft' },
    ];
    return (
      <div style={{ display: 'flex', gap: compact ? 8 : 10 }}>
        {items.map((it, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--acc)', opacity: 0.85 }}><it.icon w={16}/></span>
            <span className="num" style={{ fontSize: compact ? 14 : 16, fontWeight: 800 }}>{it.v}</span>
            <span className="label-cap" style={{ fontSize: 8.5 }}>{it.l}</span>
          </div>
        ))}
      </div>
    );
  }

  // Stepper
  function Stepper({ value, set, min = 0, max = 6, suffix }) {
    const btn = (txt, fn, dis) => (
      <button onClick={fn} disabled={dis} style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--line-strong)',
        background: dis ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)', color: dis ? 'var(--ghost)' : '#fff',
        fontSize: 18, fontWeight: 700, cursor: dis ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{txt}</button>
    );
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {btn('−', () => set(Math.max(min, value - 1)), value <= min)}
        <span className="num" style={{ fontSize: 19, fontWeight: 800, minWidth: 22, textAlign: 'center' }}>{value}{suffix}</span>
        {btn('+', () => set(Math.min(max, value + 1)), value >= max)}
      </div>
    );
  }

  // Pill stat (small)
  function MiniStat({ value, label, accent }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="display num" style={{ fontSize: 24, color: accent ? 'var(--acc)' : '#fff' }}>{value}</span>
        <span className="label-cap" style={{ fontSize: 8.5 }}>{label}</span>
      </div>
    );
  }

  window.Chrome = { SubHeader, DogSwitch, Avatar, BottomNav, SectionLabel, WeatherStrip, Stepper, MiniStat };
})();
