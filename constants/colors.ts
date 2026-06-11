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

  // Fährtenmodul-Palette (Spec) — eigene Tokens, brechen bestehende C.* nicht.
  trackBg:        '#050505',
  trackSurface:   '#0D0D0D',
  trackCard:      '#111111',
  trackCardAlt:   '#161616',
  trackBorder:    'rgba(255,255,255,0.08)',
  trackPrimary:   '#00F5D4',
  trackPrimaryDk: '#00BFA6',
  trackGlow:      'rgba(0,245,212,0.35)',
  trackText:      '#FFFFFF',
  trackTextSec:   '#8B8B8B',
  trackTextMut:   '#5F5F5F',
  trackWarning:   '#FFB020',
  trackDanger:    '#FF4D4D',
  trackBlue:      '#4DA3FF',
  trackPurple:    '#9B5CFF',
} as const;

export type ColorKey = keyof typeof C;
