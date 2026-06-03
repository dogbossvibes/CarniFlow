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
} as const;

export type ColorKey = keyof typeof C;
