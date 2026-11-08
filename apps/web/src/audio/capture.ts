/**
 * Raw microphone capture: the same unprocessed mic as the tuner, delivered as
 * timestamped blocks of samples on the AudioContext clock.
 */
import { resumeAudio } from './context';
import workletUrl from './capture-worklet.ts?worker&url';

const loaded = new WeakSet<AudioContext>();

export interface CaptureBlock {
  /** AudioContext time of the first sample. */
  time: number;
  samples: Float32Array;
}

export interface Capture {
  ctx: AudioContext;
  stream: MediaStream;
  /** The input device's label, when the browser shares it. */
  device: string;
  stop(): void;
}

export async function openCapture(onBlock: (b: CaptureBlock) => void): Promise<Capture> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot open the microphone (it needs HTTPS).');
  const ctx = await resumeAudio();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
  });
  if (!loaded.has(ctx)) {
    await ctx.audioWorklet.addModule(workletUrl);
    loaded.add(ctx);
  }
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'toner-capture', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1 });
  node.port.onmessage = (ev: MessageEvent<CaptureBlock>) => onBlock(ev.data);
  source.connect(node);
  return {
    ctx,
    stream,
    device: stream.getAudioTracks()[0]?.label ?? '',
    stop() {
      source.disconnect();
      node.port.onmessage = null;
      node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
