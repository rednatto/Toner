/** Messages between the input worklet and the main thread. */

export interface InputConfig {
  /** Samples analysed per pitch estimate. */
  frameSize: number;
  /** Samples between estimates. */
  hop: number;
  minHz: number;
  maxHz: number;
  /** YIN absolute threshold. */
  threshold: number;
  /** RMS below which input counts as silence. */
  gate: number;
  /** Peak level that counts as an attack, for onset detection. */
  onsetLevel: number;
  /** Minimum seconds between onsets. */
  onsetHoldoff: number;
}

export const DEFAULT_INPUT_CONFIG: InputConfig = {
  frameSize: 2048,
  hop: 512,
  minHz: 60,
  maxHz: 1500,
  threshold: 0.15,
  gate: 0.004,
  onsetLevel: 0.2,
  onsetHoldoff: 0.15,
};

export type WorkletOut =
  | { type: 'pitch'; time: number; freq: number; clarity: number; level: number }
  | { type: 'onset'; time: number; strength: number }
  | { type: 'error'; message: string };

export type WorkletIn = { type: 'config'; config: Partial<InputConfig> };
