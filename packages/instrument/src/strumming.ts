/**
 * Strumming patterns for strummed string instruments.
 *
 * A pattern is a grid of steps: `subdivision` steps per beat, for one or more
 * bars. Each step holds a stroke (or a rest, where the hand keeps moving but
 * misses the strings). Patterns are written as text, one token per step:
 *
 *   D  down strum          U  up strum
 *   X  chuck (muted down)  x  chuck on the way up
 *   K  knock on the body   B  bass note (thumb or pick on the root)
 *   -  rest: the hand moves but does not touch the strings
 *
 * Add `>` before a token to accent it (">D"), and `|` between bars for
 * readability (ignored). Example: the campfire pattern is "D - D U - U D U".
 */
import type { TimeSignature } from '@toner/theory';

export type Stroke = 'D' | 'U' | 'X' | 'x' | 'K' | 'B' | '-';

export interface Step {
  stroke: Stroke;
  accent?: boolean;
}

export interface StrumPattern {
  id: string;
  name: string;
  style: string;
  timeSignature: TimeSignature;
  /** Steps per beat: 1 quarters, 2 eighths, 3 triplets, 4 sixteenths. */
  subdivision: 1 | 2 | 3 | 4;
  steps: Step[];
  /** 0..1 swing of the off-beat eighth, for shuffles. */
  swing?: number;
  /** A comfortable practice tempo to start at. */
  bpm: number;
  notes?: string;
}

export const STROKE_INFO: Record<Stroke, { name: string; symbol: string }> = {
  D: { name: 'down strum', symbol: '↓' },
  U: { name: 'up strum', symbol: '↑' },
  X: { name: 'chuck (muted down)', symbol: '✕' },
  x: { name: 'chuck on the way up', symbol: '✕' },
  K: { name: 'knock on the body', symbol: '●' },
  B: { name: 'bass note', symbol: 'B' },
  '-': { name: 'rest (keep the hand moving)', symbol: '·' },
};

const STROKES = new Set<string>(Object.keys(STROKE_INFO));

/** Parse pattern text into steps. Returns an error message for bad tokens. */
export function parseStrum(text: string): { steps: Step[] } | { error: string } {
  const tokens = text.replace(/\|/g, ' ').split(/\s+/).filter(Boolean);
  const steps: Step[] = [];
  for (const tok of tokens) {
    const accent = tok.startsWith('>');
    const s = accent ? tok.slice(1) : tok;
    if (!STROKES.has(s)) return { error: `Unknown stroke "${tok}". Use D U X x K B - and > for accents.` };
    steps.push(accent ? { stroke: s as Stroke, accent: true } : { stroke: s as Stroke });
  }
  if (steps.length === 0) return { error: 'Write at least one stroke.' };
  return { steps };
}

/** Text form of a pattern, with a bar line between bars. */
export function formatStrum(p: Pick<StrumPattern, 'steps' | 'subdivision' | 'timeSignature'>): string {
  const perBar = stepsPerBar(p);
  return p.steps
    .map((s, i) => (i > 0 && i % perBar === 0 ? '| ' : '') + (s.accent ? '>' : '') + s.stroke)
    .join(' ');
}

export function stepsPerBar(p: Pick<StrumPattern, 'subdivision' | 'timeSignature'>): number {
  return p.timeSignature.beats * p.subdivision;
}

/** Number of bars the pattern spans (rounded up; a short pattern repeats within the bar). */
export function patternBars(p: Pick<StrumPattern, 'steps' | 'subdivision' | 'timeSignature'>): number {
  return Math.max(1, Math.ceil(p.steps.length / stepsPerBar(p)));
}

/** The step to play at a position, looping the pattern. */
export function stepAt(p: Pick<StrumPattern, 'steps'>, index: number): Step {
  return p.steps[index % p.steps.length]!;
}

/**
 * Which way the strumming hand moves at a step, so rests can show the motion
 * ("down-up" pendulum). Eighth and sixteenth grids alternate down on the grid,
 * up between; quarter and triplet grids alternate step by step.
 */
export function handMotion(index: number): 'down' | 'up' {
  return index % 2 === 0 ? 'down' : 'up';
}

const ts = (beats: number, unit: number): TimeSignature => ({ beats, unit });

function p(id: string, name: string, style: string, time: TimeSignature, subdivision: StrumPattern['subdivision'], text: string, bpm: number, extra: Partial<StrumPattern> = {}): StrumPattern {
  const parsed = parseStrum(text);
  if ('error' in parsed) throw new Error(`${id}: ${parsed.error}`);
  return { id, name, style, timeSignature: time, subdivision, steps: parsed.steps, bpm, ...extra };
}

export const STRUM_PATTERNS: StrumPattern[] = [
  p('quarters', 'Four downs', 'Basics', ts(4, 4), 1, '>D D D D', 80, { notes: 'One down strum per beat. Get chord changes clean first.' }),
  p('eighthsDown', 'Eighths, all down', 'Basics', ts(4, 4), 2, '>D D D D D D D D', 90, { notes: 'Punk and driving rock. Keep the wrist loose.' }),
  p('downUp', 'Down-up eighths', 'Basics', ts(4, 4), 2, '>D U D U D U D U', 80, { notes: 'The hand never stops: down on the beat, up on the "and".' }),
  p('campfire', 'Campfire', 'Pop and folk', ts(4, 4), 2, '>D - D U - U D U', 90, { notes: 'The classic. Miss the strings on the rests but keep the motion.' }),
  p('pop2', 'Pop push', 'Pop and folk', ts(4, 4), 2, '>D - D - D U D U', 95),
  p('popAnticipation', 'Syncopated pop', 'Pop and folk', ts(4, 4), 2, '>D - D U - U - U', 95, { notes: 'The "and" of 3 is held into beat 4.' }),
  p('boomChick', 'Boom-chick', 'Country', ts(4, 4), 1, '>B D B D', 100, { notes: 'Bass note on 1 and 3 (alternate root and fifth), strum on 2 and 4.' }),
  p('boomChickaChick', 'Boom-chicka', 'Country', ts(4, 4), 2, '>B - D U B - D U', 100),
  p('trainBeat', 'Train beat', 'Country', ts(4, 4), 4, '>D x D x D x D x D x D x D x D x', 90, { notes: 'Muted sixteenths with accents give the train rhythm; open up the accented strokes.' }),
  p('chuckBackbeat', 'Chuck backbeat', 'Rock and percussive', ts(4, 4), 2, '>D - X U - U X U', 90, { notes: 'Mute the strings with the strumming palm on 2 and 4 for a snare sound.' }),
  p('knockBackbeat', 'Body knock backbeat', 'Rock and percussive', ts(4, 4), 2, '>D - K U - U K U', 85, { notes: 'Hit the guitar top with the heel of the hand on 2 and 4.' }),
  p('rockAccents', 'Accented eighths', 'Rock and percussive', ts(4, 4), 2, '>D U D U >D U D U', 110),
  p('gallop', 'Gallop', 'Rock and percussive', ts(4, 4), 4, '>D - D D >D - D D >D - D D >D - D D', 90, { notes: 'Eighth then two sixteenths, usually palm-muted.' }),
  p('skank', 'Reggae skank', 'Reggae and ska', ts(4, 4), 1, '- >X - >X', 75, { notes: 'Short, choked chords on 2 and 4 only.' }),
  p('ska', 'Ska upstrokes', 'Reggae and ska', ts(4, 4), 2, '- U - U - U - U', 140, { notes: 'Sharp upstrokes on every "and".' }),
  p('funk16', 'Funk sixteenths', 'Funk', ts(4, 4), 4, '>D - x U - U D - X - x U - U D U', 90, { notes: 'Keep a constant sixteenth motion; most strokes are muted.' }),
  p('waltz', 'Waltz', 'Three and six', ts(3, 4), 1, '>B D D', 90),
  p('waltzEighths', 'Waltz eighths', 'Three and six', ts(3, 4), 2, '>D - D U D U', 90),
  p('sixEight', '6/8 ballad', 'Three and six', ts(6, 8), 1, '>D - U D D U', 120, { notes: 'Two big beats per bar: count 1-2-3 4-5-6.' }),
  p('shuffle', 'Blues shuffle', 'Blues', ts(4, 4), 2, '>D U D U D U D U', 80, { swing: 1, notes: 'Long-short eighths: the up strokes land on the last triplet.' }),
  p('twelveEight', '12/8 slow blues', 'Blues', ts(12, 8), 1, '>D - U D - U D - U D - U', 150),
  p('boDiddley', 'Bo Diddley beat', 'Blues', ts(4, 4), 2, '>D - - D - - >D - | - - D - >D - - -', 100, { notes: 'The 3-2 clave over two bars.' }),
  p('bossa', 'Bossa nova (thumb and fingers)', 'Latin', ts(4, 4), 2, '>B - U B - U B - | B U - B - U B -', 120, { notes: 'Thumb plays the bass; U here is the fingers plucking the chord upwards.' }),
  p('rumba', 'Rumba flamenca', 'Flamenco', ts(4, 4), 2, '>D - U >X - U >X U', 100, { notes: 'The chucks (golpes) on 2 and on the "and" of 3 drive it; play the down strokes as a quick rasgueado when you can.' }),
  p('tangos', 'Tangos', 'Flamenco', ts(4, 4), 2, 'K - >D U >D U >D U', 100, { notes: 'Beat 1 is a tap on the top; the strums on 2, 3 and 4 carry the weight.' }),
  p('sevillanas', 'Sevillanas', 'Flamenco', ts(3, 4), 2, '>D - K - D U', 120, { notes: 'Accented strum on 1, a golpe on 2, a quick down-up on 3.' }),
  p('solea', 'Soleá compás', 'Flamenco', ts(12, 8), 1, 'D D >D D D >D D >D D >D D >D', 180, { notes: 'The twelve-beat cycle: accents on 3, 6, 8, 10 and 12. Count it out loud before playing. Alegrías uses the same accents, faster.' }),
  p('buleria', 'Bulerías (from 12)', 'Flamenco', ts(12, 8), 1, '>D D D >D D D >D D >D D >D D', 240, { notes: 'The soleá accents counted from 12: the cycle starts on its strongest beat.' }),
  p('jig', 'Jig', 'Irish and Celtic', ts(6, 8), 1, '>D U D >D U D', 240, { notes: 'Two pulses of three; the second down stroke of each group is light.' }),
  p('slipJig', 'Slip jig', 'Irish and Celtic', ts(9, 8), 1, '>D U D >D U D >D U D', 240, { notes: 'Three pulses of three per bar.' }),
  p('reel', 'Reel', 'Irish and Celtic', ts(4, 4), 2, 'D U >D U D U >D U', 100, { notes: 'Constant down-up with a lift on 2 and 4; keep it light under the melody.' }),
  p('hornpipe', 'Hornpipe', 'Irish and Celtic', ts(4, 4), 2, '>D - D U >D - D U', 80, { swing: 0.6, notes: 'Dotted, swung eighths and a heavier feel than a reel.' }),
  p('polka', 'Polka', 'Irish and Celtic', ts(2, 4), 2, '>B - D U', 120, { notes: 'Oom-pah: bass note, then a quick chord.' }),
  p('carter', 'Carter strum', 'Folk', ts(4, 4), 2, '>B - D U B - D U', 100, { notes: 'Thumb takes the root then the fifth (or the melody on the low strings); the strum fills in.' }),
  p('march', 'March', 'Folk', ts(2, 4), 2, '>D - D U', 110),
  p('cajunWaltz', 'Cajun waltz', 'Folk', ts(3, 4), 2, '>B - D U D U', 120),
  p('polska', 'Polska', 'Folk', ts(3, 4), 2, '>D - D U >D U', 100, { notes: 'Swedish polska: weight on beats 1 and 3, never quite even.' }),
  p('mazurka', 'Mazurka', 'Folk', ts(3, 4), 2, 'D U >D U D U', 110, { notes: 'The accent falls on 2.' }),
  p('rachenitsa', 'Rachenitsa (7/8)', 'Folk', ts(7, 8), 1, '>D U >D U >D U D', 280, { notes: 'Balkan 2+2+3: three uneven pulses per bar.' }),
  p('calypso', 'Calypso', 'Folk', ts(4, 4), 2, '>D - D U - U >D U', 100, { notes: 'The campfire pattern with a push on 4; Caribbean folk and many sea songs.' }),
];

export function strumPattern(id: string): StrumPattern | undefined {
  return STRUM_PATTERNS.find((x) => x.id === id);
}
