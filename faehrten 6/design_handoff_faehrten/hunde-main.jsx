// ANYVO Hunde — canvas composition
const W = 384, H = 832;

function HFrame({ variant, initial }) {
  return (
    <IOSDevice dark width={W} height={H}>
      <window.Hunde.HundeApp variant={variant} initial={initial} />
    </IOSDevice>
  );
}

function HRoot() {
  return (
    <DesignCanvas>
      <DCSection id="final" title="Hunde · Final (gewählt)" subtitle="Liste A + Detail A — Foto-Hero, Steckbrief, Mikrochip, Gesundheit, Trainingskurve">
        <DCArtboard id="final-list" label="Liste A ★ gewählt" width={W} height={H} style={{ background: '#000' }}><HFrame variant="rich" initial="list" /></DCArtboard>
        <DCArtboard id="final-detail" label="Detail A ★ gewählt" width={W} height={H} style={{ background: '#000' }}><HFrame variant="rich" initial="detail" /></DCArtboard>
      </DCSection>
      <DCSection id="alt" title="Alternativen" subtitle="Nicht gewählt — als Referenz">
        <DCArtboard id="list-compact" label="Liste B · Kompakt" width={W} height={H} style={{ background: '#000' }}><HFrame variant="compact" initial="list" /></DCArtboard>
        <DCArtboard id="detail-compact" label="Detail B · Tabs" width={W} height={H} style={{ background: '#000' }}><HFrame variant="compact" initial="detail" /></DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<HRoot />);
