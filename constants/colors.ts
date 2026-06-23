export const C = {
  // Backgrounds
  bg:          '#050505',
  card:        '#111111',
  cardAlt:     '#161616',
  input:       '#161616',

  // Borders
  border:      '#1E1E1E',
  borderLight: '#2A2A2A',
  borderFocus: '#00FFCC',

  // Text
  white:       '#FFFFFF',
  muted:       '#777777',
  subtle:      '#444444',
  placeholder: '#333333',

  // Brand — aquamarine
  accent:     '#00FFCC',
  accentDim:  'rgba(0,255,204,0.10)',
  accentMid:  'rgba(0,255,204,0.30)',
  accentText: '#060606',

  // Glass
  glass:       'rgba(255,255,255,0.03)',
  glassBorder: 'rgba(255,255,255,0.07)',

  // Star / performance rating
  star:       '#00FFCC',
  starDim:    'rgba(0,255,204,0.15)',

  // Semantic
  success:    '#00FFCC',
  successDim: 'rgba(0,255,204,0.12)',
  warning:    '#FFB800',
  warningDim: 'rgba(255,184,0,0.10)',
  danger:     '#FF3B30',
  dangerDim:  'rgba(255,59,48,0.10)',

  // Fährtenmodul-Palette — auf anyvo-Tokens (design_handoff_faehrten/anyvo.css)
  // angeglichen, damit alle Fährten-Screens denselben Mint-Look haben wie der
  // neue Legen/Ausarbeiten-Flow (FT). Eigene Tokens, brechen bestehende C.* nicht.
  trackBg:        '#000000',                 // anyvo --bg
  trackSurface:   '#0d0e10',                 // --surface
  trackCard:      '#141518',                 // --surface-2
  trackCardAlt:   '#1b1d21',                 // --surface-3
  trackBorder:    'rgba(255,255,255,0.075)', // --line
  trackPrimary:   '#15e6c3',                 // --acc (Mint)
  trackPrimaryDk: '#00c9d6',                 // --acc-2
  trackGlow:      'rgba(21,230,195,0.45)',   // --acc-glow
  trackText:      '#ffffff',                 // --text
  trackTextSec:   'rgba(255,255,255,0.56)',  // --muted
  trackTextMut:   'rgba(255,255,255,0.34)',  // --faint
  trackWarning:   '#ffb547',                 // --warn
  trackDanger:    '#ff5d6c',                 // --bad
  trackBlue:      '#4DA3FF',
  trackPurple:    '#9B5CFF',
} as const;

export type ColorKey = keyof typeof C;

// ── Fährten-Tab Design-Tokens (1:1 aus design_handoff_faehrten/anyvo.css) ──
// Eigenes Token-Set für das neue Fährten-Design (Mint #15e6c3), damit der
// Redesign-Flow konsistent ist, ohne bestehende C.track*-Screens zu verändern.
export const FT = {
  bg:         '#000000',
  surface:    '#0d0e10',
  surface2:   '#141518',
  surface3:   '#1b1d21',
  line:       'rgba(255,255,255,0.075)',
  lineStrong: 'rgba(255,255,255,0.14)',
  acc:        '#15e6c3',   // Primär-Akzent (Mint)
  acc2:       '#00c9d6',   // Gradient-Partner
  accDim:     'rgba(21,230,195,0.13)',
  accGlow:    'rgba(21,230,195,0.45)',
  accText:    '#04201b',   // Text auf Mint-Buttons
  warn:       '#ffb547',
  bad:        '#ff5d6c',
  text:       '#ffffff',
  muted:      'rgba(255,255,255,0.56)',
  faint:      'rgba(255,255,255,0.34)',
  glass:      'rgba(20,22,25,0.62)',
  glassLine:  'rgba(255,255,255,0.09)',
  rLg: 26, rMd: 20, rSm: 14,
} as const;
