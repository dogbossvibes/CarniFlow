/** @type {import('tailwindcss').Config} */
// ANYVO — Tailwind/NativeWind Theme. Design-Tokens 1:1 aus
// design_handoff_faehrten/anyvo.css (Fährten-Bereich, Mint #15e6c3).
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './features/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Fährten-Tokens (anyvo.css)
        ft: {
          bg:            '#000000',
          surface:       '#0d0e10',
          surface2:      '#141518',
          surface3:      '#1b1d21',
          line:          'rgba(255,255,255,0.075)',
          'line-strong': 'rgba(255,255,255,0.14)',
          acc:           '#15e6c3',
          'acc-2':       '#00c9d6',
          'acc-dim':     'rgba(21,230,195,0.13)',
          'acc-glow':    'rgba(21,230,195,0.45)',
          'acc-text':    '#04201b',
          warn:          '#ffb547',
          bad:           '#ff5d6c',
          text:          '#ffffff',
          muted:         'rgba(255,255,255,0.56)',
          faint:         'rgba(255,255,255,0.34)',
          glass:         'rgba(20,22,25,0.62)',
          'glass-line':  'rgba(255,255,255,0.09)',
        },
        // Material-Marker (Stoff/Holz/Leder/Plastik/Diverses) — tunable.
        mat: {
          stoff:    '#15e6c3',
          holz:     '#c08457',
          leder:    '#a9744f',
          plastik:  '#4da3ff',
          diverses: '#9b5cff',
        },
      },
      borderRadius: {
        ft: '26px',
        'ft-md': '20px',
        'ft-sm': '14px',
      },
    },
  },
  plugins: [],
};
