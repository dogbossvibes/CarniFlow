import { qrPath } from '../ContactQrCode';

jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Path: 'Path', Rect: 'Rect' }));

describe('qrPath', () => {
  it('produces a square matrix with the three finder patterns', () => {
    const { path, size } = qrPath('anyvo://contacts/add?code=K7M4X2P9Q1AB');
    expect(size).toBeGreaterThanOrEqual(21);
    expect((size - 17) % 4).toBe(0);
    // Jede Finder-Ecke beginnt mit einem 7 Module breiten Balken.
    expect(path).toContain('M0 0h7v1h-7z');
    expect(path).toContain(`M${size - 7} 0h7v1h-7z`);
    expect(path).toContain(`M0 ${size - 7}h7v1h-7z`);
  });
  it('is deterministic and changes with the content', () => {
    expect(qrPath('a').path).toBe(qrPath('a').path);
    expect(qrPath('a').path).not.toBe(qrPath('b').path);
  });
});
