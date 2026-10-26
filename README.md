# Toner

A private music teaching and helper app for guitar and voice. It listens while you play or sing, tells you what you did, explains why it sounds the way it does, and (later) suggests where to go next.

This is phase 1: the shared foundations plus three tools you can use today.

- **Tuner**: tunings grouped by style (standard, rock and metal drop tunings, slide and blues open tunings, folk and fingerstyle, jazz and experimental), custom tunings typed as letters, bass and ukulele profiles, A4 calibration, auto / chromatic / per-string targets, needle or strobe display, and a plucked or drone reference tone per string.
- **Metronome**: tap tempo, any time signature with groupings such as 2+2+3, a per-beat accent editor, subdivisions with swing, a speed trainer that steps the tempo every few bars, silent bars for testing your own time, and strumming practice: pick a pattern (or write your own) and the beat display becomes a lane of down, up, chuck, knock and bass strokes, with stroke sounds. Sound and lights share the audio clock.
- **Library**: chords and scales with Z12 facts (notes, steps, prime form, interval content, symmetry, function from home), ranked fingerings for the current tuning and capo, the whole neck, modes and diatonic chords, a strumming pattern library (23 patterns from campfire to funk sixteenths, Bo Diddley and bossa), a find-by-notes clock, and a transposer that suggests the easiest capo.
- **Latency test**: plays clicks and listens for them, to measure the device's round-trip delay before the play-along guide is built.

## How notes are named

The engine is Z12 throughout: a pitch class is a number 0 to 11 and a chord is a root plus stacked steps, such as `7⟨4 3 3⟩`. What you see is a swappable rendering, chosen in the header:

- **Numbers from home** (default): home is 0, everything else counts semitones up from it.
- **Numbers, C = 0**.
- **Letters**: conventional names and chord symbols.

Colours come from a scheme (`apps/web/src/visual/schemes.ts`). The visual language is still being designed, so every view asks the scheme for colours rather than hard-coding them; a new design is a new entry there.

## Layout

```
packages/theory      Instrument-neutral theory engine (TypeScript, pure, tested)
                     pitch, pcset (D12 symmetries), chords, scales, key and function,
                     tonnetz (P/L/R), voice leading, notation, rhythm, song format, note events
packages/instrument  The only code that knows about strings: tunings, fretboard, fingerings, strumming patterns
crates/dsp           Rust pitch detector (YIN), built to WebAssembly with a tiny C ABI
apps/web             React PWA: tuner, metronome, library, latency test
```

The audio path is: microphone (echo cancellation, noise suppression and auto gain off) → AudioWorklet → Rust YIN in WASM on the audio thread → pitch and onset events on the AudioContext clock → the page. The same clock schedules the metronome, so later features can line up what you played with what was expected.

## Develop

Needs Node 22 and Rust with the `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`).

```sh
npm install
npm run dev          # builds dsp.wasm, then starts Vite
npm test             # theory, instrument and app logic tests
npm run test:rust    # pitch detector tests
npm run typecheck
npm run build        # production build in apps/web/dist
```

The microphone needs HTTPS or localhost. To try it on a phone, deploy (below) or use a tunnel.

## Deploy

`.github/workflows/pages.yml` publishes to GitHub Pages on every push to `main` once Pages is set to "GitHub Actions" in the repository settings. Every CI run also uploads the built app as an artifact.

## Song format

`packages/theory/src/song.ts` defines the Toner song format: sections of bars of chords (root 0 to 11 plus a quality id), optional timed-note parts in beats, tempo, time signature, home and mode. Instrument details (tuning, capo, string and fret for a tab note) are optional hints only. `validateSong`, `parseSong`, `transposeSong` and `chordTimeline` work on it.
