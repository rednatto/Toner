/**
 * The note-event format shared by the audio core and the theory engine.
 * Detectors emit these; every feature (tuner, singing coach, play-along,
 * transcription) consumes them. Times are on the AudioContext clock, in seconds.
 */
import type { Pitch } from './pitch.js';

export interface PitchEvent {
  kind: 'pitch';
  time: number;
  /** Detected fundamental in Hz. */
  freq: number;
  /** Fractional pitch on the MIDI scale, using the current A4 reference. */
  pitch: Pitch;
  /** 0..1: how periodic the signal is (1 − YIN aperiodicity). */
  clarity: number;
  /** Input level, RMS 0..1. */
  level: number;
}

export interface OnsetEvent {
  kind: 'onset';
  time: number;
  /** Strength of the attack, 0..1. */
  strength: number;
}

export interface SilenceEvent {
  kind: 'silence';
  time: number;
  level: number;
}

export type NoteEvent = PitchEvent | OnsetEvent | SilenceEvent;
