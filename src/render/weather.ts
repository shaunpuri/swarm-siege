import type { Biome } from "@/types";
import { makeRng } from "@/game/rng";

// Weather over the map so no world looks static. Cold World: snow falling at an angle with
// gusts that blow drifts of powder sideways across the screen. Desert: sand grains streaming
// in the wind and dust devils spinning across the dunes. Cyber Arena: thin neon rain and
// glints off the rooftops. Particles are drawn over everything except the HUD.

type Flake = { x: number; y: number; vy: number; size: number; drift: number; depth: number };
type Streak = { x: number; y: number; len: number; life: number; max: number };
type Devil = { x: number; y: number; vx: number; life: number; max: number; size: number };

export type Weather = {
  kind: "snow" | "sand" | "rain";
  rng: () => number;
  t: number;
  flakes: Flake[];
  streaks: Streak[];
  devils: Devil[];
  nextGust: number;
  gust: number;
  nextDevil: number;
};

const W = 1280;
const H = 720;

export function createWeather(biome: Biome, seed: number): Weather | null {
  const kind = biome === "snow" ? "snow" : biome === "desert" ? "sand" : biome === "cyber" ? "rain" : null;
  if (!kind) return null;
  const rng = makeRng(seed * 7 + 3);
  const count = kind === "snow" ? 260 : kind === "sand" ? 160 : 180;
  const flakes = Array.from({ length: count }, () => ({
    x: rng() * W,
    y: rng() * H,
    vy: kind === "rain" ? 520 + rng() * 260 : kind === "snow" ? 30 + rng() * 45 : 6 + rng() * 10,
    size: kind === "snow" ? 1.6 + rng() * 2.8 : kind === "sand" ? 0.8 + rng() * 1.4 : 0.8,
    drift: rng() * 6.28,
    depth: 0.4 + rng() * 0.6,
  }));
  return { kind, rng, t: 0, flakes, streaks: [], devils: [], nextGust: 2, gust: 0, nextDevil: 4 };
}

function wind(w: Weather): number {
  const base = w.kind === "snow" ? 30 : w.kind === "sand" ? 110 : 60;
  return base * (1 + w.gust * 2.2) + Math.sin(w.t * 0.5) * base * 0.3;
}

export function updateWeather(w: Weather, dt: number): void {
  w.t += dt;
  // gusts come and go: wind ramps up for a couple of seconds, then dies down
  w.nextGust -= dt;
  if (w.nextGust <= 0) {
    w.gust = 1;
    w.nextGust = 5 + w.rng() * 6;
  }
  w.gust = Math.max(0, w.gust - dt * 0.45);
  const wx = wind(w);
  for (const f of w.flakes) {
    f.y += f.vy * f.depth * dt;
    f.x += (wx * f.depth + Math.sin(w.t * 1.3 + f.drift) * (w.kind === "rain" ? 0 : 14)) * dt;
    if (f.y > H + 10) {
      f.y = -10;
      f.x = w.rng() * W - 100;
    }
    if (f.x > W + 20) f.x = -20;
  }
  // blowing powder / sand sheets during gusts
  if (w.kind !== "rain" && w.rng() < dt * (2 + w.gust * 14)) {
    w.streaks.push({ x: -150 + w.rng() * W, y: 60 + w.rng() * (H - 80), len: 80 + w.rng() * 160, life: 0, max: 1 + w.rng() });
  }
  for (const s of w.streaks) {
    s.life += dt;
    s.x += wx * 3 * dt;
  }
  w.streaks = w.streaks.filter((s) => s.life < s.max);
  if (w.kind === "sand") {
    w.nextDevil -= dt;
    if (w.nextDevil <= 0) {
      w.devils.push({ x: -40, y: 120 + w.rng() * 480, vx: 50 + w.rng() * 40, life: 0, max: 9 + w.rng() * 4, size: 18 + w.rng() * 14 });
      w.nextDevil = 8 + w.rng() * 8;
    }
    for (const d of w.devils) {
      d.life += dt;
      d.x += d.vx * dt;
      d.y += Math.sin(w.t * 0.8 + d.size) * 10 * dt;
    }
    w.devils = w.devils.filter((d) => d.life < d.max && d.x < W + 60);
  }
}

function drawDevil(ctx: CanvasRenderingContext2D, d: Devil, t: number): void {
  const fade = Math.min(1, d.life, d.max - d.life);
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    const r = d.size * (0.3 + k);
    const a = t * 6 + i;
    ctx.fillStyle = `rgba(214,170,110,${0.16 * fade * (1 - k * 0.6)})`;
    ctx.beginPath();
    ctx.ellipse(d.x + Math.cos(a) * r * 0.25, d.y - k * d.size * 2.2, r, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawWeather(ctx: CanvasRenderingContext2D, w: Weather): void {
  const wx = wind(w);
  if (w.kind === "sand") for (const d of w.devils) drawDevil(ctx, d, w.t);
  for (const s of w.streaks) {
    const fade = Math.min(1, s.life * 3, (s.max - s.life) * 2);
    const g = ctx.createLinearGradient(s.x, s.y, s.x + s.len, s.y);
    const c = w.kind === "snow" ? "255,255,255" : "222,184,120";
    // blown snow casts a faint blue shade just below the streak so it reads on white ground
    if (w.kind === "snow") {
      ctx.strokeStyle = `rgba(80,110,160,${0.14 * fade})`;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y + 4);
      ctx.quadraticCurveTo(s.x + s.len / 2, s.y - 4, s.x + s.len, s.y + 7);
      ctx.stroke();
    }
    g.addColorStop(0, `rgba(${c},0)`);
    g.addColorStop(0.5, `rgba(${c},${0.22 * fade})`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.strokeStyle = g;
    ctx.lineWidth = w.kind === "snow" ? 6 : 4;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.quadraticCurveTo(s.x + s.len / 2, s.y - 8, s.x + s.len, s.y + 3);
    ctx.stroke();
  }
  for (const f of w.flakes) {
    if (w.kind === "rain") {
      ctx.strokeStyle = `rgba(196,181,253,${0.35 * f.depth})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x - (wx / f.vy) * 14, f.y - 14 * f.depth);
      ctx.stroke();
    } else if (w.kind === "snow") {
      // a faint cool edge keeps white flakes visible against the white snowfields
      ctx.fillStyle = `rgba(255,255,255,${0.6 + 0.4 * f.depth})`;
      ctx.strokeStyle = `rgba(70,100,140,${0.35 * f.depth})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size * f.depth, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(230,196,140,${0.45 * f.depth})`;
      ctx.fillRect(f.x, f.y, f.size * 2.4, f.size);
    }
  }
}
