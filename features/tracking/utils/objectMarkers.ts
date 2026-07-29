// Gegenstand-Marker: Dübel ist ein Sonderfall (roter Zylinder, KEINE G-Nummer).
// Reine, testbare Helfer — keine neue Gegenstandsarchitektur.

export function isDuebel(material?: string | null): boolean {
  return material === 'duebel';
}

// Sichtbare G-Nummern (G1, G2 …) NUR für normale Gegenstände. Dübel wird
// übersprungen und verschiebt die Nummerierung normaler Gegenstände NICHT.
// Rückgabe: Map<Marker-Index, G-Nummer> (nur für normale Gegenstände gesetzt).
export function objectNumbers(markers: { type: string; material?: string | null }[]): Map<number, number> {
  const map = new Map<number, number>();
  let n = 0;
  markers.forEach((m, i) => {
    if (m.type === 'gegenstand' && !isDuebel(m.material)) map.set(i, ++n);
  });
  return map;
}
