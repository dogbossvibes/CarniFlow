import { parseVoiceCommand } from '@/features/voice/services/voiceCommandParser';

describe('parseVoiceCommand – Winkel & Figuren', () => {
  const angle = (text: string) => {
    const cmd = parseVoiceCommand(text);
    return cmd?.type === 'ADD_MARKER' ? cmd.angleKind : undefined;
  };

  it('Spitzwinkel mit Richtung', () => {
    expect(angle('spitzwinkel links')).toBe('spitz_links');
    expect(angle('spitzwinkel rechts')).toBe('spitz_rechts');
    expect(angle('spitz nach rechts')).toBe('spitz_rechts');
  });

  it('Spitzwinkel ohne Richtung bleibt Legacy-spitz', () => {
    expect(angle('spitzwinkel')).toBe('spitz');
  });

  it('rechter / linker Winkel', () => {
    expect(angle('winkel rechts')).toBe('rechts');
    expect(angle('linkswinkel')).toBe('links');
  });

  it('Absatz und Abriss', () => {
    expect(angle('absatz')).toBe('absatz');
    expect(angle('abriss')).toBe('abriss');
  });
});
