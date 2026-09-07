/**
 * The ride's sound.
 *
 * Everything here is generated — no samples to ship — and everything is driven by the
 * same track data the visuals use: rumble follows velocity, the tick follows Bitcoin's
 * ten-minute block cadence, and the bed is keyed to the district you are passing through.
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
    const seconds = 2.2;
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
  wet.gain.value = 0.32;
  reverb.connect(wet);
  wet.connect(master);

  // ---------------------------------------------------------------- the bed
  const bedGain = context.createGain();
  bedGain.gain.value = 0.35;
  const bedFilter = context.createBiquadFilter();
  bedFilter.type = "lowpass";
  bedFilter.frequency.value = 1600;
  bedFilter.Q.value = 0.8;
  bedGain.connect(bedFilter);
  bedFilter.connect(master);
  bedFilter.connect(reverb);

  // Put the bed in the audible midrange, not mainly below small speakers' range.
  const bedVoices = [4, 8, 12].map((harmonic, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = index === 0 ? "sine" : "triangle";
    oscillator.frequency.value = DISTRICT_ROOT.origins * harmonic;
    const gain = context.createGain();
    gain.gain.value = index === 0 ? 0.6 : index === 1 ? 0.18 : 0.08;
    oscillator.connect(gain);
    gain.connect(bedGain);
    oscillator.start();
    return { oscillator, harmonic };
  });

  // ---------------------------------------------------------------- rumble
  // Filtered noise standing in for wheels on rail; brightness tracks speed.
  const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  {
    const data = noiseBuffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < data.length; index += 1) {
      // Brown noise: heavier and less hissy than white.
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[index] = last * 3.2;
    }
  }
  const rumble = context.createBufferSource();
  rumble.buffer = noiseBuffer;
  rumble.loop = true;
  const rumbleFilter = context.createBiquadFilter();
  rumbleFilter.type = "bandpass";
  rumbleFilter.frequency.value = 120;
  rumbleFilter.Q.value = 1.1;
  const rumbleGain = context.createGain();
  rumbleGain.gain.value = 0.0001;
  rumble.connect(rumbleFilter);
  rumbleFilter.connect(rumbleGain);
  rumbleGain.connect(master);
  rumble.start();

  // ---------------------------------------------------------------- block tick
  // One click per block at Bitcoin's ten-minute target, compressed to ride time.
  let tickTimer = 0;
  const tick = () => {
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(2100, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(now);
    oscillator.stop(now + 0.09);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  };

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
      gain.gain.exponentialRampToValueAtTime(0.28, at + 0.012);
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
      window.clearInterval(tickTimer);
      onInterrupted?.();
    }
  };

  const startTicking = () => {
    window.clearInterval(tickTimer);
    // Ten minutes of block time per 2.4 seconds of ride time.
    tickTimer = window.setInterval(() => { if (enabled && !disposed) tick(); }, 2400);
  };

  return {
    setMotion: (speed, grade) => {
      if (!enabled || disposed) return;
      const now = context.currentTime;
      // Faster travel brightens and thickens the rumble.
      rumbleFilter.frequency.setTargetAtTime(90 + speed * 130, now, 0.25);
      rumbleGain.gain.setTargetAtTime(Math.min(0.16, 0.012 + speed * 0.055), now, 0.3);
      // A steep drop opens the bed's filter: the world gets brighter as you fall.
      bedFilter.frequency.setTargetAtTime(1300 + Math.max(0, -grade) * 500, now, 0.5);
    },
    setDistrict: (category) => {
      if (disposed) return;
      const root = DISTRICT_ROOT[category] ?? DISTRICT_ROOT.origins;
      const now = context.currentTime;
      for (const voice of bedVoices) {
        voice.oscillator.frequency.setTargetAtTime(root * voice.harmonic, now, 1.4);
      }
    },
    arrive: (category, significance) => {
      if (!enabled || disposed) return;
      const now = context.currentTime;
      const root = DISTRICT_ROOT[category] ?? DISTRICT_ROOT.origins;
      const intervals = CHIME_INTERVALS[category] ?? [1, 1.5];
      const level = significance === "landmark" ? 0.13 : significance === "major" ? 0.09 : 0.055;
      intervals.forEach((interval, index) => {
        const at = now + index * 0.11;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        // Four octaves above the bed's root, so the chime sits clear of it.
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
      if (next) { startTicking(); if (!wasEnabled) testTone(); }
      else window.clearInterval(tickTimer);
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
      window.clearInterval(tickTimer);
      try {
        for (const voice of bedVoices) voice.oscillator.stop();
        rumble.stop();
      } catch {
        // Already stopped; nothing to unwind.
      }
      if (context.state !== "closed") void context.close().catch(() => {});
    },
  };
}
