// Voices the gameplay trailer with the local PocketTTS sidecar (127.0.0.1:8767, the same one
// the aichess.guru Guru voice uses): each narration line is synthesized sentence by sentence
// from the sidecar's SSE "beat" stream (base64 float32 PCM), joined with short breaths, and
// written as a 48 kHz 16-bit mono wav per line into the folder given.
// Run with: bun scripts/trailer-voice.ts <out dir>

import { mkdirSync } from "node:fs";

const TTS_URL = "http://127.0.0.1:8767";
const FFMPEG = "/home/shaun/.local/ffbin/ffmpeg";
const OUT = process.argv[2] ?? "trailer";

// the trailer's narration, one entry per shot (the clip each line plays over is in the name)
export const LINES: { name: string; text: string; emotion: string }[] = [
  { name: "00-evolution", text: "It started as blue squares and red dots on a grey path. Then came painted worlds, our own art, and real 3D.", emotion: "thoughtful" },
  { name: "01-intro", text: "This is Swarm Siege. Five worlds. Fifty levels. And a swarm that learns from every move you make.", emotion: "thoughtful" },
  { name: "02-build", text: "Build turrets on the glowing pads. Every upgrade is a new design, and every level three turret unlocks its world's power.", emotion: "encouraging" },
  { name: "03-swarm", text: "But the swarm fights back. Spiders bite, owls dive from the sky, and the night anaconda rises straight out of the river.", emotion: "concerned" },
  { name: "04-forest", text: "In the forest, the Elderwood Colossus tears roots out of the ground.", emotion: "concerned" },
  { name: "05-snow", text: "In the Cold World, the Ice Dragon chains your turrets in ice.", emotion: "concerned" },
  { name: "06-desert", text: "The Mummy King rises from his pyramid, lashing cursed bandages.", emotion: "concerned" },
  { name: "07-water", text: "Damyaan, Serpent Lord of the Ocean, drags your defences under.", emotion: "concerned" },
  { name: "08-cyber", text: "And in the Cyber Arena, a car races in, and transforms into the Transformer Overlord.", emotion: "concerned" },
  { name: "09-versus", text: "Challenge a friend online, or take on the AI, one versus one. Who survives the most waves?", emotion: "encouraging" },
  { name: "10-arena", text: "And in Arena Stakes, two fighters battle while investors bet diamonds on the winner. Swarm Siege. Play now.", emotion: "encouraging" },
];

function parseSse(body: string): { pcm: Buffer; sampleRate: number } {
  const chunks: Buffer[] = [];
  let sampleRate = 24000;
  for (const frame of body.split(/\r?\n\r?\n/)) {
    let event = "";
    let data = "";
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (event !== "beat" || !data) continue;
    const parsed: { beat?: { pcm?: string; sampleRate?: number } } = JSON.parse(data);
    if (!parsed.beat?.pcm) continue;
    chunks.push(Buffer.from(parsed.beat.pcm, "base64"));
    if (typeof parsed.beat.sampleRate === "number") sampleRate = parsed.beat.sampleRate;
  }
  return { pcm: Buffer.concat(chunks), sampleRate };
}

async function synth(text: string, emotion: string): Promise<{ pcm: Buffer; sampleRate: number }> {
  const res = await fetch(`${TTS_URL}/tts-stream-chunks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, emotion }) });
  if (!res.ok) throw new Error(`tts ${res.status}`);
  return parseSse(await res.text());
}

mkdirSync(OUT, { recursive: true });
for (const line of LINES) {
  const sentences = line.text.match(/[^.?!]+[.?!]+/g) ?? [line.text];
  const parts: Buffer[] = [];
  let rate = 24000;
  for (const s of sentences) {
    const r = await synth(s.trim(), line.emotion);
    rate = r.sampleRate;
    parts.push(r.pcm, Buffer.alloc(Math.round(rate * 0.22) * 4));
  }
  const pcm = Buffer.concat(parts);
  const raw = `${OUT}/${line.name}.f32`;
  await Bun.write(raw, pcm);
  const enc = Bun.spawnSync([FFMPEG, "-y", "-loglevel", "error", "-f", "f32le", "-ar", String(rate), "-ac", "1", "-i", raw, "-ar", "48000", "-c:a", "pcm_s16le", `${OUT}/${line.name}.wav`]);
  if (enc.exitCode !== 0) throw new Error(enc.stderr.toString());
  console.log(`${line.name}: ${(pcm.length / 4 / rate).toFixed(1)}s`);
}
