// Anzeige-Helfer für Termine.

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

// „HEUTE" / „MORGEN" / „Mo, 12.06." aus einem Tages-Key (YYYY-MM-DD).
export function dayHeadingFromKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0)  return 'HEUTE';
  if (diff === 1)  return 'MORGEN';
  if (diff === -1) return 'GESTERN';
  return `${WD[date.getDay()]}, ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.`;
}

export function relativeDayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((that.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}
