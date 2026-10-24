import type { Sfx } from "@/types";

// All sounds are synthesised with WebAudio: no asset files, nothing to load.
// Rapid sounds are throttled so 15 turrets firing do not turn into noise.

type Voice = { wave: OscillatorType | "noise"; from: number; to: number; dur: number; vol: number; gap: number };

const VOICES: Record<Sfx, Voice[]> = {
  shoot: [{ wave: "square", from: 520, to: 180, dur: 0.07, vol: 0.05, gap: 0.06 }],
  rapid: [{ wave: "square", from: 900, to: 500, dur: 0.035, vol: 0.03, gap: 0.05 }],
  boom: [{ wave: "noise", from: 900, to: 120, dur: 0.25, vol: 0.12, gap: 0.08 }],
  bigboom: [
    { wave: "noise", from: 600, to: 60, dur: 0.7, vol: 0.25, gap: 0.15 },
    { wave: "sine", from: 90, to: 30, dur: 0.6, vol: 0.25, gap: 0.15 },
  ],
  laser: [{ wave: "sawtooth", from: 1400, to: 300, dur: 0.2, vol: 0.06, gap: 0.08 }],
  flame: [{ wave: "noise", from: 2500, to: 800, dur: 0.18, vol: 0.04, gap: 0.12 }],
  kill: [{ wave: "triangle", from: 300, to: 80, dur: 0.12, vol: 0.06, gap: 0.04 }],
  coin: [{ wave: "triangle", from: 1200, to: 1800, dur: 0.08, vol: 0.05, gap: 0.05 }],
  build: [
    { wave: "triangle", from: 400, to: 800, dur: 0.12, vol: 0.1, gap: 0 },
    { wave: "noise", from: 1500, to: 400, dur: 0.12, vol: 0.05, gap: 0 },
  ],
  upgrade: [
    { wave: "triangle", from: 500, to: 1000, dur: 0.15, vol: 0.1, gap: 0 },
    { wave: "sine", from: 1000, to: 1600, dur: 0.25, vol: 0.07, gap: 0 },
  ],
  sell: [{ wave: "triangle", from: 900, to: 400, dur: 0.18, vol: 0.08, gap: 0 }],
  hurt: [{ wave: "sawtooth", from: 220, to: 70, dur: 0.35, vol: 0.14, gap: 0.2 }],
  towerDown: [{ wave: "noise", from: 400, to: 50, dur: 0.6, vol: 0.2, gap: 0.2 }],
  evolve: [
    { wave: "sawtooth", from: 110, to: 220, dur: 0.6, vol: 0.09, gap: 0.5 },
    { wave: "square", from: 165, to: 330, dur: 0.6, vol: 0.05, gap: 0.5 },
  ],
  boss: [
    { wave: "sawtooth", from: 70, to: 45, dur: 1.4, vol: 0.2, gap: 1 },
    { wave: "noise", from: 300, to: 80, dur: 1.2, vol: 0.12, gap: 1 },
  ],
  vine: [{ wave: "sawtooth", from: 60, to: 140, dur: 0.5, vol: 0.12, gap: 0.3 }],
  slash: [{ wave: "noise", from: 4000, to: 1500, dur: 0.1, vol: 0.12, gap: 0.03 }],
  power: [{ wave: "sine", from: 300, to: 1200, dur: 0.3, vol: 0.12, gap: 0.1 }],
  win: [
    { wave: "triangle", from: 523, to: 523, dur: 0.2, vol: 0.12, gap: 0 },
    { wave: "triangle", from: 784, to: 1046, dur: 0.6, vol: 0.12, gap: 0 },
  ],
  lose: [{ wave: "sawtooth", from: 300, to: 60, dur: 1.2, vol: 0.15, gap: 0 }],
  wave: [{ wave: "square", from: 220, to: 440, dur: 0.3, vol: 0.07, gap: 0.3 }],
  // a level 3 storm: a rising roar of wind
  storm: [
    { wave: "noise", from: 300, to: 1400, dur: 1.1, vol: 0.12, gap: 0.6 },
    { wave: "sine", from: 80, to: 160, dur: 1.0, vol: 0.08, gap: 0.6 },
  ],
  // a boss falls: a deep boom, then a rising victory chord
  bossDown: [
    { wave: "noise", from: 500, to: 40, dur: 0.9, vol: 0.25, gap: 1 },
    { wave: "sine", from: 70, to: 25, dur: 0.8, vol: 0.25, gap: 1 },
    { wave: "triangle", from: 392, to: 784, dur: 0.9, vol: 0.1, gap: 1 },
  ],
};

let audio: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let muted = false;
const lastPlayed = new Map<string, number>();

export function unlockAudio(): void {
  if (audio) {
    if (audio.state === "suspended") void audio.resume();
    return;
  }
  try {
    audio = new AudioContext();
    noise = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  } catch {
    audio = null;
  }
}

export function toggleMute(): boolean {
  muted = !muted;
  return muted;
}

function playVoice(ctx: AudioContext, v: Voice): void {
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(v.vol, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + v.dur);
  gain.connect(ctx.destination);
  if (v.wave === "noise") {
    if (!noise) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(v.from, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, v.to), now + v.dur);
    src.connect(filter);
    filter.connect(gain);
    src.start(now);
    src.stop(now + v.dur);
    return;
  }
  const osc = ctx.createOscillator();
  osc.type = v.wave;
  osc.frequency.setValueAtTime(v.from, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, v.to), now + v.dur);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + v.dur);
}

export function play(name: Sfx): void {
  if (!audio || muted) return;
  const voices = VOICES[name];
  const gap = voices[0]?.gap ?? 0;
  const now = audio.currentTime;
  if (now - (lastPlayed.get(name) ?? -1) < gap) return;
  lastPlayed.set(name, now);
  for (const v of voices) playVoice(audio, v);
}
