# Toner

A private music teaching and helper app for guitar and voice. It listens while you play or sing, tells you what you did, explains why it sounds the way it does, and (later) suggests where to go next.

This is phase 1: the shared foundations plus the tools you can use today.

- **Tuner**: tunings grouped by style (standard, rock and metal drop tunings, slide and blues open tunings, folk and fingerstyle, jazz and experimental), custom tunings typed as letters, bass and ukulele profiles, A4 calibration, auto / chromatic / per-string targets, needle or strobe display, and a plucked or drone reference tone per string. It follows a note as it fades and keeps the last reading on screen (dimmed) after the string stops.
- **Practice** (metronome): tap tempo, any time signature with groupings such as 2+2+3, a per-beat accent editor, subdivisions with swing, a speed trainer that steps the tempo every few bars, silent bars for testing your own time, strumming practice (the beat display becomes a lane of down, up, chuck, knock and bass strokes, every bar of a longer pattern on screen), and chord changes: pick a progression (or type one in roman numerals) and the chart lights the chord now with diagrams for the chord now and the one coming, optionally sounding the chords through the strumming pattern. Stopped, tap any chord (or step with Previous and Next) to see and hear it, swap its fingering (remembered per tuning), and start from there. Sound and lights share the audio clock.
- **Library**: chords and scales with Z12 facts (notes, steps, prime form, interval content, symmetry, function from home) on the semitone clock and the circle of fifths (with a ring marking notes in the key, borrowed from the parallel mode, or outside), ranked fingerings for the current tuning and capo, the whole neck, modes and diatonic chords; every chord from home with its roman numeral, sortable from inside (home) to outside (tense, chromatic); a chord progression library (pop, blues, jazz, flamenco, Irish and Celtic, folk) to hear or practise; a strumming pattern library (40 patterns from campfire to funk, flamenco rumba and soleá, jigs and reels, polska and rachenitsa); a find-by-notes clock; and a transposer that suggests the easiest capo.
- **Tunes**: folk tune collections to browse, search by title or tune type, and read laid out in Toner's own way: each bar a lane of notes coloured by pitch class and numbered from the tune's home, chord symbols above, the notes the tune uses sized by how long they sound, and the repeats and endings spelled out as an arrangement. Play it back at any speed with the current bar lit. Every tune shows its source, transcriber and licence, with the original ABC one tap away. The first collection is O'Neill's Music of Ireland (1903).
- **Latency test**: plays clicks and listens for them, to measure the device's round-trip delay, and saves it for this device so play-along timing can subtract it.

## How notes are named

The engine is Z12 throughout: a pitch class is a number 0 to 11 and a chord is a root plus stacked steps, such as `7⟨4 3 3⟩`. What you see is a swappable rendering, chosen in the header:

- **Numbers from home** (default): home is 0, everything else counts semitones up from it.
- **Numbers, C = 0**.
- **Letters**: conventional names and chord symbols.

With either number mode, "+ letters" adds letter names alongside where there is room.

Colours come from a scheme (`apps/web/src/visual/schemes.ts`). The visual language is still being designed, so every view asks the scheme for colours rather than hard-coding them; a new design is a new entry there.

## Layout

```
packages/theory      Instrument-neutral theory engine (TypeScript, pure, tested)
                     pitch, pcset (D12 symmetries), chords, scales, key and function,
                     tonnetz (P/L/R), voice leading, notation, rhythm, song format, note events,
                     progressions written in roman numerals from home, ABC notation in
packages/instrument  The only code that knows about strings: tunings, fretboard, fingerings, strumming patterns
crates/dsp           Rust pitch detector (YIN), built to WebAssembly with a tiny C ABI
apps/web             React PWA: tuner, metronome, library, tunes, latency test
apps/web/public/tunes  Imported tune collections (ABC), their licences and sources.json
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

## Tune collections

`node scripts/import-tunes.mjs` downloads each collection listed in the script (pinned and hash-checked), writes it to `apps/web/public/tunes/<id>.abc` headed by its licence notice, copies the licence text into `tunes/LICENSES/`, and records the source, licence and attribution in `tunes/sources.json`, which the app shows with every tune. It needs `unzip`. The app reads the ABC itself at runtime with `parseAbc` (`packages/theory/src/abc.ts`), which turns a tune into the song format: strains become sections, repeats and first and second endings become the arrangement, chord symbols become chords, and the melody becomes a part in play order.

Only collections whose terms allow publishing on a public, non-commercial site belong here:

| Collection | Licence | Status |
|---|---|---|
| O'Neill's Music of Ireland (O'Neill's Project ABC, via music21) | GPL v2 or later | Included |
| British Folk Database (BFDB) | CC BY-NC 4.0 | Allowed; not yet imported |
| Mutopia Project | Public domain or CC BY / BY-SA per piece | Allowed; LilyPond, needs its own reader |
| PDMX | Public domain / CC0 scores, CC BY 4.0 dataset | Allowed; MusicXML, needs its own reader |
| The Session | ODbL plus a ban on any use with large language models | Left out: it would rule out LLM features and AI-assisted work on the data |
| Essen Folksong Collection | Non-commercial permission given to music21 only | Left out until permission is asked |
| Nottingham Music Database, Meertens Tune Collections | No licence published | Left out until permission is asked |

The song format gained one optional field for this: `Bar.beats`, the length of a bar that is not a full bar of its time signature, such as a pickup.

