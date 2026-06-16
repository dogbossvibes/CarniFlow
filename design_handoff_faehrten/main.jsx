const { useTweaks, TweaksPanel, TweakSection, TweakSlider, TweakToggle, TweakColor } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#15e6c3",
  "radius": 26,
  "glow": true
}/*EDITMODE-END*/;

const W = 384, H = 832;

function Frame({ variant, initial }) {
  return (
    <IOSDevice dark width={W} height={H}>
      <FaehrtenApp variant={variant} initial={initial} />
    </IOSDevice>
  );
}

function Root() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  window.__ACC = t.accent;
  const r = document.documentElement.style;
  r.setProperty('--acc', t.accent);
  r.setProperty('--r-lg', t.radius + 'px');
  React.useEffect(() => {
    document.body.classList.toggle('no-glow', !t.glow);
  }, [t.glow]);

  return (
    <React.Fragment>
      <DesignCanvas>
        <DCSection id="overview" title="Fährten · Übersicht (Variante C)" subtitle="Gewählt: Karte zuerst — jeder Screen ist klickbar bis in den Flow">
          <DCArtboard id="map" label="C · Karte zuerst ★ gewählt" width={W} height={H} style={{ background: '#000' }}><Frame variant="Map" initial="overview" /></DCArtboard>
          <DCArtboard id="hero" label="A · Hero (Alt)" width={W} height={H} style={{ background: '#000' }}><Frame variant="Hero" initial="overview" /></DCArtboard>
          <DCArtboard id="bento" label="B · Bento (Alt)" width={W} height={H} style={{ background: '#000' }}><Frame variant="Bento" initial="overview" /></DCArtboard>
          <DCArtboard id="editorial" label="D · Editorial (Alt)" width={W} height={H} style={{ background: '#000' }}><Frame variant="Editorial" initial="overview" /></DCArtboard>
        </DCSection>
        <DCSection id="flow" title="Kompletter Flow" subtitle="Planen → Live → Auswertung → Logbuch">
          <DCArtboard id="planen" label="Fährte planen" width={W} height={H} style={{ background: '#000' }}><Frame variant="Map" initial="planen" /></DCArtboard>
          <DCArtboard id="live" label="Live-Tracking" width={W} height={H} style={{ background: '#000' }}><Frame variant="Map" initial="live" /></DCArtboard>
          <DCArtboard id="auswertung" label="Auswertung" width={W} height={H} style={{ background: '#000' }}><Frame variant="Map" initial="auswertung" /></DCArtboard>
          <DCArtboard id="logbuch" label="Logbuch" width={W} height={H} style={{ background: '#000' }}><Frame variant="Map" initial="historie" /></DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel>
        <TweakSection label="Marke" />
        <TweakColor label="Akzentfarbe" value={t.accent}
          options={['#15e6c3', '#3a93ff', '#ffb547', '#a78bff', '#ff5d8f']}
          onChange={(v) => setTweak('accent', v)} />
        <TweakSection label="Form" />
        <TweakSlider label="Karten-Radius" value={t.radius} min={12} max={34} unit="px"
          onChange={(v) => setTweak('radius', v)} />
        <TweakToggle label="Neon-Glow" value={t.glow}
          onChange={(v) => setTweak('glow', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
