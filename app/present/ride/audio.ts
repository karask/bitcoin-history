/**
 * The ride's sound.
 *
 * Quiet, finite arrival chimes with silence between events.
 * Created only on a user gesture, and torn down completely on dispose.
 */

import type { CategoryId } from "@/lib/event-schema";

/** Root frequency per district, low enough to sit under speech. */
const DISTRICT_ROOT: Record<CategoryId, number> = {
  origins: 55.0,       // A1
  protocol: 61.74,     // B1
  mining: 49.0,        // G1
  adoption: 65.41,     // C2
  infrastructure: 58.27, // A#1
  finance: 73.42,      // D2
  policy: 51.91,       // G#1
  crisis: 46.25,       // F#1
};

/** Arrival chimes, one interval per district, so a category is recognisable by ear. */
const CHIME_INTERVALS: Record<CategoryId, number[]> = {
  origins: [1, 1.5],
  protocol: [1, 1.335, 2],
  mining: [1, 1.2],
  adoption: [1, 1.25, 1.5],
  infrastructure: [1, 1.5, 2],
  finance: [1, 1.26, 1.498],
  policy: [1, 1.335],
  crisis: [1, 1.19],
};

export type RideAudio = {
  /** Velocity 0–2ish and the current district; called every frame. */
  setMotion: (speed: number, grade: number) => void;
  setDistrict: (category: CategoryId) => void;
  /** Fired once on arrival at a station. */
  arrive: (category: CategoryId, significance: "landmark" | "major" | "context") => void;
  setEnabled: (enabled: boolean) => Promise<void>;
  isEnabled: () => boolean;
  setVolume: (volume: number) => void;
  testTone: () => void;
  dispose: () => void;
};

export function createRideAudio(onInterrupted?: () => void): RideAudio {
  const Constructor = globalThis.AudioContext ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) throw new Error("This browser does not support Web Audio. Try a current browser.");
  const context = new Constructor();
  const isRunning = () => context.state === "running";

  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, context.currentTime);
  master.connect(context.destination);

  // A little space, so the ride does not sound like it is happening inside a box.
  const reverb = context.createConvolver();
  {
    const seconds = 1.2;
    const length = Math.floor(context.sampleRate * seconds);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let index = 0; index < length; index += 1) {
        data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 2.6;
      }
    }
    reverb.buffer = impulse;
  }
  const wet = context.createGain();
  wet.gain.value = 0.12;
  reverb.connect(wet);
  wet.connect(master);

  let enabled = false;
  let disposed = false;
  let volume = 0.7;

  const testTone = () => {
    if (!enabled || disposed || context.state !== "running") return;
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const at = context.currentTime + 0.04 + index * 0.18;
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = "sine"; oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.10, at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      oscillator.connect(gain); gain.connect(master);
      oscillator.start(at); oscillator.stop(at + 0.4);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  };
  context.onstatechange = () => {
    if (!disposed && enabled && context.state !== "running") {
      enabled = false;
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setValueAtTime(0, context.currentTime);
      onInterrupted?.();
    }
  };


  return {
    // Retain the ride controller API; travelling is deliberately silent.
    setMotion: () => {},
    setDistrict: () => {},
    arrive: (category, significance) => {
      if (!enabled || disposed) return;
      const now = context.currentTime;
      const root = DISTRICT_ROOT[category] ?? DISTRICT_ROOT.origins;
      const intervals = CHIME_INTERVALS[category] ?? [1, 1.5];
      const level = significance === "landmark" ? 0.065 : significance === "major" ? 0.045 : 0.028;
      intervals.forEach((interval, index) => {
        const at = now + index * 0.11;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        // Soft sine notes in a comfortable midrange.
        oscillator.frequency.setValueAtTime(root * 8 * interval, at);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(level, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.7);
        oscillator.connect(gain);
        gain.connect(master);
        gain.connect(reverb);
        oscillator.start(at);
        oscillator.stop(at + 1.8);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    },
    setEnabled: async (next) => {
      if (disposed) throw new Error("Audio was closed. Click Sound to retry.");
      if (next && context.state !== "running") {
        let timer = 0;
        try {
          await Promise.race([
            context.resume(),
            new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error("The browser blocked audio. Click Sound to retry, and check site sound permissions.")), 3000); }),
          ]);
        } finally { window.clearTimeout(timer); }
        if (!isRunning()) throw new Error("Audio is not running. Check this browser's sound permissions and retry.");
      }
      const wasEnabled = enabled;
      enabled = next;
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(next ? volume * 0.65 : 0, context.currentTime, 0.04);
      if (next && !wasEnabled) testTone();
    },
    isEnabled: () => enabled && context.state === "running",
    testTone,
    setVolume: value => {
      volume = Math.max(0, Math.min(1, value));
      if (!disposed) master.gain.setTargetAtTime(enabled ? volume * 0.65 : 0, context.currentTime, 0.04);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      context.onstatechange = null;
      enabled = false;
      if (context.state !== "closed") void context.close().catch(() => {});
    },
  };
}
