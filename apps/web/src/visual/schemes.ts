/**
 * Colour schemes for pitch classes. This is a placeholder layer: the visual
 * language is still being designed, so every view asks the active scheme for
 * colours instead of hard-coding them, and a new scheme is one entry here.
 */
import { mod12, type PitchClass } from '@toner/theory';

export interface ColourScheme {
  id: string;
  name: string;
  description: string;
  /** Fill colour for a pitch class, given the current home. */
  pc(pc: PitchClass, home: PitchClass): string;
}

export const SCHEMES: ColourScheme[] = [
  {
    id: 'fifths',
    name: 'Fifths from home',
    description: 'Hue walks the circle of fifths starting at home, so neighbours in a key share warm or cool families.',
    pc: (pc, home) => `oklch(0.76 0.14 ${(mod12((pc - home) * 7) * 30 + 75) % 360})`,
  },
  {
    id: 'chromatic',
    name: 'Chromatic wheel',
    description: 'Hue walks the semitones from home, like a colour wheel laid on the Z12 clock.',
    pc: (pc, home) => `oklch(0.76 0.14 ${(mod12(pc - home) * 30 + 75) % 360})`,
  },
  {
    id: 'plain',
    name: 'Plain',
    description: 'No pitch colour: home is gold, everything else is neutral.',
    pc: (pc, home) => (mod12(pc - home) === 0 ? 'oklch(0.83 0.13 85)' : 'oklch(0.72 0.02 270)'),
  },
];

export function scheme(id: string): ColourScheme {
  return SCHEMES.find((s) => s.id === id) ?? SCHEMES[0]!;
}
