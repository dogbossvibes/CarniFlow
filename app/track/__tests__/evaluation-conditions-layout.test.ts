import { readFileSync } from 'fs';

const source = () => readFileSync('app/track/[id].tsx', 'utf8');

describe('Track evaluation conditions layout', () => {
  it('constrains condition text inside its own column', () => {
    const src = source();

    expect(src).toContain('<View style={s.condText}>');
    expect(src).toContain('condText:  { flex: 1, minWidth: 0 }');
    expect(src).toContain('condItem:  { width: \'46%\', flexGrow: 1, flexShrink: 1, minWidth: 0');
  });

  it('allows long weather values to wrap without overlapping the next condition item', () => {
    const src = source();

    expect(src).toContain('<Text style={s.condValue} numberOfLines={2} ellipsizeMode="tail">{cnd.value}</Text>');
    expect(src).toContain('lineHeight: 18');
    expect(src).toContain('flexShrink: 1');
  });

  it('keeps condition data, icons and order unchanged', () => {
    const src = source();

    expect(src).toContain("label: 'Wetter',     value: weatherCond");
    expect(src).toContain("label: 'Temperatur', value: `${temp.toFixed(1)} °C`");
    expect(src).toContain("label: 'Wind',       value: `${Math.round(wind)} km/h`");
    expect(src).toContain("label: 'Feuchte',    value: `${Math.round(humidity)} %`");
    expect(src).toContain("icon: 'partly-sunny-outline'");
    expect(src).toContain("icon: 'thermometer-outline'");
  });
});
