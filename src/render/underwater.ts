import { makeRng } from "@/game/rng";

// Ambient life for the Aqua Realm, where the whole map is under the sea: streams of bubbles
// rising from vents in the sea floor, schools of small fish gliding across, and jellyfish
// pulsing slowly upward. Nothing flows like a river; everything drifts and rises.

type Bubble = { x: number; y: number; r: number; speed: number; wobble: number };
type Fish = { x: number; y: number; vx: number; phase: number; size: number; color: string };
type Jelly = { x: number; y: number; phase: number; size: number; hue: string };

export type Sea = {
  rng: () => number;
  t: number;
  vents: { x: number; y: number }[];
  bubbles: Bubble[];
  fish: Fish[];
  jellies: Jelly[];
  nextSchool: number;
};

const FISH_COLORS = ["#fbbf24", "#fb923c", "#38bdf8", "#f472b6", "#a3e635", "#e2e8f0"];
const JELLY_HUES = ["rgba(216,180,254,", "rgba(147,197,253,", "rgba(249,168,212,"];

export function createSea(seed: number): Sea {
  const rng = makeRng(seed);
  const vents = Array.from({ length: 9 }, () => ({ x: 60 + rng() * 1160, y: 200 + rng() * 480 }));
  const jellies = Array.from({ length: 5 }, () => ({ x: rng() * 1280, y: 120 + rng() * 560, phase: rng() * 6, size: 10 + rng() * 10, hue: JELLY_HUES[Math.floor(rng() * JELLY_HUES.length)] ?? "rgba(216,180,254," }));
  return { rng, t: 0, vents, bubbles: [], fish: [], jellies, nextSchool: 1 };
}

function spawnSchool(s: Sea): void {
  const fromLeft = s.rng() < 0.5;
  const y = 90 + s.rng() * 540;
  const color = FISH_COLORS[Math.floor(s.rng() * FISH_COLORS.length)] ?? "#38bdf8";
  const speed = (35 + s.rng() * 30) * (fromLeft ? 1 : -1);
  const n = 5 + Math.floor(s.rng() * 7);
  for (let i = 0; i < n; i++) {
    s.fish.push({ x: (fromLeft ? -30 : 1310) - Math.sign(speed) * (s.rng() * 90), y: y + (s.rng() - 0.5) * 50, vx: speed, phase: s.rng() * 6, size: 3 + s.rng() * 2.5, color });
  }
}

export function updateSea(s: Sea, dt: number): void {
  s.t += dt;
  // bubbles rise in streams from the vents, plus a few stray ones anywhere
  for (const v of s.vents) {
    if (s.rng() < dt * 2.2) s.bubbles.push({ x: v.x + (s.rng() - 0.5) * 8, y: v.y, r: 1.5 + s.rng() * 3, speed: 28 + s.rng() * 30, wobble: s.rng() * 6 });
  }
  if (s.rng() < dt * 3) s.bubbles.push({ x: s.rng() * 1280, y: 720, r: 1 + s.rng() * 2, speed: 20 + s.rng() * 20, wobble: s.rng() * 6 });
  for (const b of s.bubbles) {
    b.y -= b.speed * dt;
    b.x += Math.sin(s.t * 2.5 + b.wobble) * 8 * dt;
  }
  s.bubbles = s.bubbles.filter((b) => b.y > -10);

  s.nextSchool -= dt;
  if (s.nextSchool <= 0) {
    spawnSchool(s);
    s.nextSchool = 5 + s.rng() * 6;
  }
  for (const f of s.fish) {
    f.x += f.vx * dt;
    f.y += Math.sin(s.t * 1.5 + f.phase) * 6 * dt;
  }
  s.fish = s.fish.filter((f) => f.x > -150 && f.x < 1430);

  // jellyfish pulse upward and wrap back to the sea floor
  for (const j of s.jellies) {
    const push = Math.max(0, Math.sin(s.t * 1.6 + j.phase));
    j.y -= (4 + push * 14) * dt;
    j.x += Math.sin(s.t * 0.4 + j.phase) * 4 * dt;
    if (j.y < 60) j.y = 700;
  }
}

function drawJelly(ctx: CanvasRenderingContext2D, j: Jelly, t: number): void {
  const squeeze = 1 + Math.sin(t * 1.6 + j.phase) * 0.15;
  const w = j.size * squeeze;
  const h = j.size * 0.8 / squeeze;
  ctx.fillStyle = `${j.hue}0.45)`;
  ctx.beginPath();
  ctx.ellipse(j.x, j.y, w, h, 0, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = `${j.hue}0.35)`;
  ctx.lineWidth = 1.2;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(j.x + i * w * 0.35, j.y);
    ctx.quadraticCurveTo(j.x + i * w * 0.35 + Math.sin(t * 2 + i) * 4, j.y + j.size, j.x + i * w * 0.3, j.y + j.size * 1.8);
    ctx.stroke();
  }
}

export function drawSea(ctx: CanvasRenderingContext2D, s: Sea): void {
  for (const j of s.jellies) drawJelly(ctx, j, s.t);
  for (const f of s.fish) {
    const dir = f.vx > 0 ? 1 : -1;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.ellipse(f.x, f.y, f.size * 1.6, f.size * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    const tail = Math.sin(s.t * 12 + f.phase) * f.size * 0.4;
    ctx.beginPath();
    ctx.moveTo(f.x - dir * f.size * 1.4, f.y);
    ctx.lineTo(f.x - dir * f.size * 2.6, f.y - f.size * 0.8 + tail);
    ctx.lineTo(f.x - dir * f.size * 2.6, f.y + f.size * 0.8 + tail);
    ctx.closePath();
    ctx.fill();
  }
  for (const b of s.bubbles) {
    ctx.strokeStyle = "rgba(224,247,255,0.65)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(b.x - b.r * 0.45, b.y - b.r * 0.55, b.r * 0.4, b.r * 0.4);
  }
}

// swimming enemies leave a trail of small bubbles; points are their swim positions on screen
export function trailBubbles(s: Sea, points: { x: number; y: number }[], dt: number): void {
  for (const p of points) {
    if (s.rng() < dt * 6) s.bubbles.push({ x: p.x + (s.rng() - 0.5) * 14, y: p.y, r: 1 + s.rng() * 2, speed: 25 + s.rng() * 20, wobble: s.rng() * 6 });
  }
}
