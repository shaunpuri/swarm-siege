// Cuts the narrated gameplay trailer: each narration line (scripts/trailer-voice.ts) plays over
// its shot from the recorded gameplay clips, with a caption naming the world or boss burned in
// (libass), then the shots are joined into one video.
// Run with: bun scripts/trailer.ts <clips dir> <voice dir> <out.mp4> (shot starts are picked
// from the recorded footage, see SHOTS)

import { mkdirSync, statSync, writeFileSync } from "node:fs";

const FFMPEG = "/home/shaun/.local/ffbin/ffmpeg";
const [CLIPS = ".", VOICE = "trailer", OUT = "trailer.mp4"] = process.argv.slice(2);
const WORK = `${VOICE}/cut`;

// each shot: the narration line, the clip it plays over, where in the clip it starts (s), and
// its caption (title, subtitle)
type Shot = { line: string; clip: string; start: number; title: string; sub: string };
const SHOTS: Shot[] = [
  { line: "00-evolution", clip: "evolution.mp4", start: 0, title: "OUR JOURNEY", sub: "from the first prototype to the final game" },
  { line: "01-intro", clip: "gameplay.mp4", start: 3, title: "SWARM SIEGE", sub: "5 worlds | 50 levels | a swarm that adapts" },
  { line: "02-build", clip: "gameplay.mp4", start: 14, title: "BUILD AND UPGRADE", sub: "every level is a new turret design" },
  { line: "03-swarm", clip: "anaconda-closeup.mp4", start: 0, title: "THE SWARM FIGHTS BACK", sub: "spiders, owls and the night anaconda" },
  { line: "04-forest", clip: "boss-grassland.mp4", start: 30, title: "ELDERWOOD COLOSSUS", sub: "Forest World boss" },
  { line: "05-snow", clip: "boss-snow.mp4", start: 22, title: "ICE DRAGON", sub: "Cold World boss" },
  { line: "06-desert", clip: "boss-desert.mp4", start: 17, title: "MUMMY KING", sub: "Desert boss" },
  { line: "07-water", clip: "boss-water.mp4", start: 22, title: "DAMYAAN", sub: "Aqua Realm boss" },
  { line: "08-cyber", clip: "boss-cyber.mp4", start: 20, title: "TRANSFORMER OVERLORD", sub: "Cyber Arena boss" },
  { line: "09-versus", clip: "versus-ai.mp4", start: 6, title: "1 VS 1 ONLINE OR VS AI", sub: "same map, send enemies at your rival" },
  { line: "10-arena", clip: "arena-stakes.mp4", start: 9, title: "ARENA STAKES", sub: "fighters battle, investors bet diamonds | swarm.aichess.guru" },
];

// a narration wav's length: 48 kHz, 16-bit mono after its 44-byte header
function voiceSeconds(line: string): number {
  return (statSync(`${VOICE}/${line}.wav`).size - 44) / (48000 * 2);
}

function run(args: string[]): void {
  const r = Bun.spawnSync([FFMPEG, "-y", "-loglevel", "error", ...args]);
  if (r.exitCode !== 0) throw new Error(r.stderr.toString());
}

// one caption as an ASS subtitle file: a big title with a smaller line under it, top left
function caption(title: string, sub: string, seconds: number): string {
  const end = `0:00:${Math.min(59, seconds - 0.3).toFixed(2).padStart(5, "0")}`;
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,DejaVu Sans,46,&H0060E0FF,&H0060E0FF,&H00200A00,&H80000000,1,0,0,0,100,100,2,0,1,3,2,1,60,40,600,1
Style: Sub,DejaVu Sans,24,&H00FFFFFF,&H00FFFFFF,&H00200A00,&H80000000,0,0,0,0,100,100,1,0,1,2,1,1,62,40,568,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.20,${end},Title,,0,0,0,,{\\fad(250,250)}${title}
Dialogue: 0,0:00:00.35,${end},Sub,,0,0,0,,{\\fad(250,250)}${sub}
`;
}

mkdirSync(WORK, { recursive: true });
const parts: string[] = [];
SHOTS.forEach((shot, i) => {
  const seconds = voiceSeconds(shot.line) + 0.7;
  const ass = `${WORK}/${i}.ass`;
  writeFileSync(ass, caption(shot.title, shot.sub, seconds));
  const part = `${WORK}/${String(i).padStart(2, "0")}.mp4`;
  const fadeOut = Math.max(0, seconds - 0.25).toFixed(2);
  run([
    "-ss", String(shot.start), "-i", `${CLIPS}/${shot.clip}`,
    "-i", `${VOICE}/${shot.line}.wav`,
    "-t", seconds.toFixed(2),
    "-filter_complex", `[0:v]scale=1280:720,fps=30,subtitles=${ass},fade=t=in:st=0:d=0.25,fade=t=out:st=${fadeOut}:d=0.25[v];[1:a]apad,afade=t=in:st=0:d=0.05[a]`,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
    part,
  ]);
  parts.push(part);
  console.log(`shot ${i + 1}/${SHOTS.length}: ${shot.title} (${seconds.toFixed(1)}s)`);
});
writeFileSync(`${WORK}/list.txt`, parts.map((p) => `file '${p}'`).join("\n"));
run(["-f", "concat", "-safe", "0", "-i", `${WORK}/list.txt`, "-c", "copy", OUT]);
console.log(`trailer: ${OUT}`);
