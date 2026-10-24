import type { Game, Vec } from "@/types";
import { distToPolyline } from "@/game/geometry";
import { makeRng } from "@/game/rng";
import { createSea, drawSea, updateSea } from "@/render/underwater";
import type { Sea } from "@/render/underwater";
import { createWeather, drawWeather, updateWeather } from "@/render/weather";
import type { Weather } from "@/render/weather";

// Ambient life drawn over the painted map so the valley never looks frozen: bird flocks
// crossing the sky with shadows on the ground, bees and butterflies over the meadows away
// from the roads, and leaves and wind streaks carried by the breeze. Purely visual; runs on
// real time.


type Bird = { x: number; y: number; vx: number; vy: number; phase: number; size: number; white: boolean };
type Flyer = { anchor: Vec; phase: number; speed: number; radius: number; butterfly: boolean; color: string };
type Drift = { x: number; y: number; vx: number; vy: number; rot: number; spin: number; life: number; max: number; color: string; streak: boolean };

export type Ambient = {
  // neon city: flying cars, hover drones and rising sparks instead of birds, insects and leaves
  neon: boolean;
  // Aqua Realm: bubbles, fish and jellyfish replace everything above the water
  sea: Sea | null;
  // Cold World snowfall, Desert sand, Cyber Arena neon rain
  weather: Weather | null;
  rng: () => number;
  t: number;
  birds: Bird[];
  flyers: Flyer[];
  drifts: Drift[];
  nextFlock: number;
  nextLeaf: number;
  nextStreak: number;
};

const BUTTERFLY_COLORS = ["#fb923c", "#facc15", "#93c5fd", "#f9a8d4", "#ffffff"];
const LEAF_COLORS = ["#65a30d", "#84cc16", "#a3e635", "#ca8a04"];
const NEON_COLORS = ["#f472b6", "#22d3ee", "#a78bfa", "#38bdf8", "#e879f9"];

function pick(list: string[], rng: () => number): string {
  return list[Math.floor(rng() * list.length)] ?? "#ffffff";
}

// open grass at least 70px from every road, where insects can hover
function meadows(game: Game, rng: () => number): Vec[] {
  const out: Vec[] = [];
  for (let tries = 0; tries < 400 && out.length < 8; tries++) {
    const p = { x: 40 + rng() * 1200, y: 70 + rng() * 600 };
    if (game.routes.some((r) => distToPolyline(p, r.points) < 70)) continue;
    if (game.pads.some((pad) => Math.hypot(pad.pos.x - p.x, pad.pos.y - p.y) < 50)) continue;
    out.push(p);
  }
  return out;
}

export function createAmbient(game: Game, seed: number): Ambient {
  const rng = makeRng(seed);
  const neon = game.level.biome === "cyber";
  const flyers: Flyer[] = [];
  for (const anchor of meadows(game, rng)) {
    flyers.push({ anchor, phase: rng() * 10, speed: 0.6 + rng() * 0.5, radius: 22 + rng() * 18, butterfly: true, color: pick(neon ? NEON_COLORS : BUTTERFLY_COLORS, rng) });
    for (let i = 0; i < 2; i++) flyers.push({ anchor, phase: rng() * 10, speed: 1.6 + rng(), radius: 10 + rng() * 10, butterfly: false, color: neon ? pick(NEON_COLORS, rng) : "#facc15" });
  }
  const sea = game.level.biome === "water" ? createSea(seed) : null;
  const weather = createWeather(game.level.biome, seed);
  return { neon, sea, weather, rng, t: 0, birds: [], flyers: sea ? [] : flyers, drifts: [], nextFlock: 2, nextLeaf: 0, nextStreak: 1 };
}

function wind(t: number): number {
  return 26 + 18 * Math.sin(t * 0.31) + 8 * Math.sin(t * 1.3);
}

function spawnFlock(a: Ambient): void {
  const fromLeft = a.rng() < 0.6;
  const y = 60 + a.rng() * 420;
  const n = 3 + Math.floor(a.rng() * 4);
  const white = a.rng() < 0.3;
  const speed = 70 + a.rng() * 40;
  for (let i = 0; i < n; i++) {
    // loose V formation
    const row = Math.ceil(i / 2);
    const side = i % 2 === 0 ? 1 : -1;
    a.birds.push({
      x: (fromLeft ? -40 : 1320) - (fromLeft ? row * 22 : -row * 22),
      y: y + row * 12 * side,
      vx: fromLeft ? speed : -speed,
      vy: (a.rng() - 0.5) * 12,
      phase: a.rng() * 6,
      size: white ? 7 : 5.5 + a.rng() * 2,
      white,
    });
  }
}

export function updateAmbient(a: Ambient, dt: number): void {
  a.t += dt;
  if (a.weather) updateWeather(a.weather, dt);
  if (a.sea) {
    updateSea(a.sea, dt);
    return;
  }
  const w = wind(a.t);
  a.nextFlock -= dt;
  if (a.nextFlock <= 0) {
    spawnFlock(a);
    a.nextFlock = 7 + a.rng() * 9;
  }
  for (const b of a.birds) {
    b.x += b.vx * dt;
    b.y += b.vy * dt + Math.sin(a.t * 1.3 + b.phase) * 6 * dt;
    b.phase += dt * (b.white ? 7 : 11);
  }
  a.birds = a.birds.filter((b) => b.x > -120 && b.x < 1400);

  a.nextLeaf -= dt;
  if (a.nextLeaf <= 0) {
    a.nextLeaf = 0.18 + a.rng() * 0.25;
    a.drifts.push({ x: -20 + a.rng() * 1300, y: a.rng() * 680, vx: w, vy: a.neon ? -(14 + a.rng() * 18) : 8 + a.rng() * 10, rot: a.rng() * 6, spin: (a.rng() - 0.5) * 6, life: 0, max: 4 + a.rng() * 3, color: pick(a.neon ? NEON_COLORS : LEAF_COLORS, a.rng), streak: false });
  }
  a.nextStreak -= dt;
  if (a.nextStreak <= 0) {
    a.nextStreak = 0.9 + a.rng() * 1.4;
    a.drifts.push({ x: a.rng() * 1100, y: 60 + a.rng() * 600, vx: w * 4, vy: 0, rot: 0, spin: 0, life: 0, max: 1.6, color: a.neon ? pick(NEON_COLORS, a.rng) : "#ffffff", streak: true });
  }
  for (const d of a.drifts) {
    d.life += dt;
    d.x += (d.streak ? d.vx : w + Math.sin(a.t * 2 + d.rot) * 12) * dt;
    d.y += d.vy * dt + Math.sin(a.t * 3 + d.rot) * 10 * dt;
    d.rot += d.spin * dt;
  }
  a.drifts = a.drifts.filter((d) => d.life < d.max);

}

function drawBird(ctx: CanvasRenderingContext2D, b: Bird): void {
  const flap = Math.sin(b.phase) * b.size * 0.7;
  const dir = b.vx > 0 ? 1 : -1;
  // shadow far below: the birds fly high over the valley
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.beginPath();
  ctx.ellipse(b.x + 30 * dir, b.y + 110, b.size, b.size * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = b.white ? "#f8fafc" : "#1f2430";
  ctx.lineWidth = b.white ? 2.2 : 1.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(b.x - b.size, b.y - flap);
  ctx.quadraticCurveTo(b.x - b.size * 0.4, b.y - flap * 0.2 - 2, b.x, b.y);
  ctx.quadraticCurveTo(b.x + b.size * 0.4, b.y - flap * 0.2 - 2, b.x + b.size, b.y - flap);
  ctx.stroke();
}

// neon city: a hover car with a light trail, glowing cabin and a soft shadow far below
function drawCar(ctx: CanvasRenderingContext2D, b: Bird): void {
  const dir = b.vx > 0 ? 1 : -1;
  const s = b.size * 1.6;
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(b.x + 30 * dir, b.y + 120, s * 1.3, s * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  const trail = ctx.createLinearGradient(b.x - dir * s * 9, b.y, b.x, b.y);
  trail.addColorStop(0, "rgba(236,72,153,0)");
  trail.addColorStop(1, b.white ? "rgba(34,211,238,0.65)" : "rgba(236,72,153,0.65)");
  ctx.strokeStyle = trail;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(b.x - dir * s * 9, b.y + 1);
  ctx.lineTo(b.x - dir * s, b.y + 1);
  ctx.stroke();
  ctx.fillStyle = "#1e1b2e";
  ctx.beginPath();
  ctx.ellipse(b.x, b.y, s * 1.3, s * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = b.white ? "#67e8f9" : "#f472b6";
  ctx.fillRect(b.x - s * 0.4, b.y - s * 0.45, s * 0.8, s * 0.3);
  ctx.fillStyle = Math.sin(b.phase * 2) > 0 ? "#fde047" : "#ef4444";
  ctx.fillRect(b.x + dir * s * 1.1, b.y - 1, 2, 2);
}

function flyerPos(f: Flyer, t: number): Vec {
  const k = t * f.speed + f.phase;
  return {
    x: f.anchor.x + Math.cos(k) * f.radius + Math.sin(k * 2.7) * f.radius * 0.3,
    y: f.anchor.y + Math.sin(k * 1.3) * f.radius * 0.55 - 8,
  };
}

// neon city: hover drones with blinking lights, and glowing data sparks circling them
function drawDrone(ctx: CanvasRenderingContext2D, f: Flyer, t: number): void {
  const p = flyerPos(f, t);
  if (!f.butterfly) {
    ctx.fillStyle = f.color;
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 9 + f.phase);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  ctx.fillStyle = "#111827";
  ctx.fillRect(p.x - 5, p.y - 1.5, 10, 3);
  ctx.fillStyle = "rgba(148,163,184,0.7)";
  const spin = Math.abs(Math.sin(t * 30 + f.phase)) * 3 + 1;
  ctx.fillRect(p.x - 7 - spin / 2, p.y - 3, spin, 1);
  ctx.fillRect(p.x + 7 - spin / 2, p.y - 3, spin, 1);
  ctx.fillStyle = Math.sin(t * 6 + f.phase) > 0 ? f.color : "#ef4444";
  ctx.fillRect(p.x - 1, p.y + 1.5, 2, 2);
}

function drawFlyer(ctx: CanvasRenderingContext2D, f: Flyer, t: number): void {
  const p = flyerPos(f, t);
  if (f.butterfly) {
    const open = Math.abs(Math.sin(t * 13 + f.phase)) * 4 + 0.6;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.ellipse(p.x - open * 0.6, p.y, open, 3.2, -0.4, 0, Math.PI * 2);
    ctx.ellipse(p.x + open * 0.6, p.y, open, 3.2, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1c1917";
    ctx.fillRect(p.x - 0.6, p.y - 2.5, 1.2, 5);
    return;
  }
  const jitter = Math.sin(t * 40 + f.phase) * 0.8;
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y - 2 + jitter, 2.6, 1.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#facc15";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + jitter, 2.2, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1c1917";
  ctx.fillRect(p.x - 0.4, p.y - 1.4 + jitter, 0.9, 2.8);
}

export function drawAmbient(ctx: CanvasRenderingContext2D, a: Ambient): void {
  if (a.weather) drawWeather(ctx, a.weather);
  if (a.sea) {
    drawSea(ctx, a.sea);
    return;
  }
  const t = a.t;
  for (const d of a.drifts) {
    const fade = Math.min(1, d.life * 2, (d.max - d.life) * 2);
    if (d.streak) {
      ctx.globalAlpha = (a.neon ? 0.35 : 0.16) * fade;
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.quadraticCurveTo(d.x + 40, d.y - 8, d.x + 90, d.y + 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.2, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const f of a.flyers) (a.neon ? drawDrone : drawFlyer)(ctx, f, t);
  for (const b of a.birds) (a.neon ? drawCar : drawBird)(ctx, b);
}
