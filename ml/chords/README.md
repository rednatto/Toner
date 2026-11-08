# Chord model: plan and data format

The Listen page's baseline names chords by matching a pitch-class profile against harmonic templates (`apps/web/src/listen/chroma.ts`). It needs no training, but it only knows physics in general, not this guitar, this mic or this room. This folder is where a small learned model will live if the baseline turns out too weak on real playing.

## Deciding whether to train

1. On the Listen page, open **Record takes** and record two or more takes of each chord you practise (the default list covers the open chords plus `N`, "no chord").
2. Press **Score the baseline**. It runs the same detector the live view uses over every take and reports how many takes it read as the right chord overall, the share of right frames, and the most common mix-ups.
3. Rules of thumb (also shown on the page): 90%+ takes and 80%+ frames is good enough for practice feedback, so tune the smoothing instead. Under 70%, train.

On synthetic strums (`apps/web/src/listen/chroma.test.ts`) the baseline gets about 96% of major and minor triads and 87% once sevenths are in the vocabulary. Its typical mistake is reading a plain triad as its major or minor seventh, because a string's own overtones (the third's 3rd harmonic is the major seventh) put the seventh into the sound. Real takes will be harder than synthetic ones.

## Export format

**Export zip** writes:

```
labels.json
takes/<root>-<quality>/<id>.wav   one folder per label; N/ for "no chord"
```

Every WAV is mono 16-bit PCM at the browser's sample rate (usually 48 kHz), recorded with echo cancellation, noise suppression and auto gain turned off. `labels.json`:

```json
{
  "format": "toner-chord-takes",
  "version": 1,
  "takes": [
    {
      "id": "2026-11-08T19-20-01-123Z-ab12",
      "chord": { "root": 9, "quality": "min" },   // null for "no chord"
      "symbol": "Am",
      "frets": [null, 0, 2, 2, 1, 0],              // low to high, null = muted
      "tuning": [40, 45, 50, 55, 59, 64],          // open strings, MIDI
      "capo": 0,
      "style": "strum",                            // strum | four | pick | soft | room
      "sampleRate": 48000,
      "seconds": 3,
      "device": "USB Audio Device",
      "recordedAt": "2026-11-08T19:20:01.123Z",
      "firstOnset": 0.41,                          // seconds, null if no strum was heard
      "file": "takes/9-min/2026-11-08T19-20-01-123Z-ab12.wav"
    }
  ]
}
```

Roots are Z12 pitch classes (C = 0) and qualities are Toner's chord quality ids (`packages/theory/src/chords.ts`), so labels survive any naming or transposition setting.

## The model, when it is time

- **Input**: a constant-Q or log-frequency spectrogram, 36 bins per octave from E2 to about E6, over a 0.25 to 0.5 s context window ending at the frame being labelled. Same hop as the live detector (about 43 ms).
- **Network**: three or four small conv blocks over frequency and time, then a dense layer to 12 × qualities + "no chord". A few tens of thousands of weights, so it runs on the audio thread or in a worker in well under a frame.
- **Augmentation**: pitch-shift takes by ±1 or 2 semitones and relabel the root (this multiplies a small set across all keys), mix in the `N` takes as background, random gain, and small time shifts.
- **Split by session, not by take**, so the score says how it does on a day it has not heard.
- **Ship** as ONNX or plain weight arrays read by a few lines of TypeScript, behind the same `Frame` interface as the baseline so the live view and the scorer can switch between them.

Data comes first: aim for 20 or more takes per chord across shapes and ways of playing before training anything.
