import { swipeActionOpacity } from '../SwipeableTrainingItem';

jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));

// Regression: die rote Lösch-Aktion liegt hinter der Karte und schaute im
// Ruhezustand an den (anders gerundeten) Kartenecken als roter Bogen hervor.
describe('swipeActionOpacity', () => {
  it('hides both delete actions while the card is at rest', () => {
    expect(swipeActionOpacity(0, 'left')).toBe(0);
    expect(swipeActionOpacity(0, 'right')).toBe(0);
  });

  it('ignores sub-pixel jitter around the rest position', () => {
    expect(swipeActionOpacity(0.3, 'left')).toBe(0);
    expect(swipeActionOpacity(-0.3, 'right')).toBe(0);
  });

  it('shows the left action only when the card is dragged to the right', () => {
    expect(swipeActionOpacity(12, 'left')).toBe(1);
    expect(swipeActionOpacity(12, 'right')).toBe(0);
  });

  it('shows the right action only when the card is dragged to the left', () => {
    expect(swipeActionOpacity(-12, 'right')).toBe(1);
    expect(swipeActionOpacity(-12, 'left')).toBe(0);
  });

  it('keeps the action visible while fully open', () => {
    expect(swipeActionOpacity(96, 'left')).toBe(1);
    expect(swipeActionOpacity(-96, 'right')).toBe(1);
  });
});
