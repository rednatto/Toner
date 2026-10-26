/**
 * Microphone input: opens the mic with all voice processing turned off
 * (echo cancellation, noise suppression and auto gain all distort pitch and
 * timing) and connects it to the analysis worklet.
 */
import { audioContext, resumeAudio } from './context';
import { dspModule } from './dsp';
import workletUrl from './input-worklet.ts?worker&url';
import type { InputConfig, WorkletIn, WorkletOut } from './messages';

const loaded = new WeakSet<AudioContext>();

export interface MicInput {
  node: AudioWorkletNode;
  stream: MediaStream;
  configure(config: Partial<InputConfig>): void;
  stop(): void;
}

export async function openMic(onMessage: (m: WorkletOut) => void, config: Partial<InputConfig> = {}): Promise<MicInput> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot open the microphone (it needs HTTPS).');
  const ctx = await resumeAudio();
  const [module, stream] = await Promise.all([
    dspModule(),
    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    }),
  ]);
  if (!loaded.has(ctx)) {
    await ctx.audioWorklet.addModule(workletUrl);
    loaded.add(ctx);
  }
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'toner-input', {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
    processorOptions: { module, config },
  });
  node.port.onmessage = (ev: MessageEvent<WorkletOut>) => onMessage(ev.data);
  source.connect(node);
  return {
    node,
    stream,
    configure(c) {
      node.port.postMessage({ type: 'config', config: c } satisfies WorkletIn);
    },
    stop() {
      source.disconnect();
      node.port.onmessage = null;
      node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

export { audioContext };
