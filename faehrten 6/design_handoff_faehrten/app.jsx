// ANYVO Fährten — app router + sample data
(function () {
  const { useState } = React;
  const F = window.Flow, O = window.Overviews, V = window.Viz;

  const DATA = {
    dogs: [
      { id: 'akira', name: 'Akira', breed: 'Malinois', level: 'FH 1', c1: '#15e6c3', c2: '#0a9e94' },
      { id: 'balou', name: 'Balou', breed: 'DSH', level: 'IGP-FH', c1: '#8ad7ff', c2: '#3a7bd1' },
    ],
    wx: { temp: 12, wind: '8 km/h', windDir: 'NW', soil: 72, humid: 81 },
    stats: { total: 38, avg: 94, streak: 6, best: 96 },
    history: [
      { surface: 'Acker', date: 'Gestern', length: 600, angles: 3, objects: 3, age: '1 h', score: 94, seed: 3 },
      { surface: 'Wiese', date: 'Mi', length: 800, angles: 4, objects: 4, age: '2 h', score: 89, seed: 11 },
      { surface: 'Wald', date: 'Mo', length: 400, angles: 2, objects: 2, age: '45 min', score: 96, seed: 5 },
      { surface: 'Acker', date: '27. Sep', length: 700, angles: 3, objects: 3, age: '3 h', score: 91, seed: 8 },
      { surface: 'Mischung', date: '24. Sep', length: 1000, angles: 5, objects: 4, age: '2 h', score: 88, seed: 14 },
    ],
  };
  // a realistic pre-recorded session used for demos / deep-linked screens
  const sampleSession = () => ({ ...V.makeSample(3), surface: 'Acker', laidAt: Date.now() - 18 * 60 * 1000, dogId: 'akira' });

  function FaehrtenApp({ variant = 'Map', initial = 'overview' }) {
    const [screen, setScreen] = useState(initial);
    const [dogId, setDogId] = useState('akira');
    const [session, setSession] = useState(sampleSession);
    const dog = DATA.dogs.find(d => d.id === dogId);
    const nav = (s) => setScreen(s);
    const shared = { dog, dogs: DATA.dogs, onDog: setDogId, wx: DATA.wx, history: DATA.history, stats: DATA.stats, session, setSession, nav };

    let body;
    if (screen === 'overview') { const Ov = O[variant] || O.Map; body = <Ov {...shared}/>; }
    else if (screen === 'legen') body = <F.Legen {...shared}/>;
    else if (screen === 'liegezeit') body = <F.Liegezeit {...shared}/>;
    else if (screen === 'ausarbeiten') body = <F.Ausarbeiten {...shared}/>;
    else if (screen === 'auswertung') body = <F.Auswertung {...shared}/>;
    else if (screen === 'historie') body = <F.Historie {...shared}/>;
    return body;
  }

  window.FaehrtenApp = FaehrtenApp;
  window.ANYVO_DATA = DATA;
})();
