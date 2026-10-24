import type { Biome, Vec } from "@/types";
import type { CreatureEntrance } from "@/config/bosses";
import { hash } from "@/render/bossintro";

// Effects for each creature's arrival (k: 0..1 through it), at its spawn point in logical
// screen pixels: ripples where something emerges from water, dirt clods where it digs out, a
// growing shadow and a landing ring under whatever drops or swoops in, a swirl of snow or sand
// gathering into a Snowman or Sandman, and a shimmer as something fades or warps in.

const TAU = Math.PI * 2;

const DUST: Record<Biome, string> = { grassland: "120,83,48", snow: "226,232,240", desert: "214,170,110", water: "186,230,253", cyber: "167,139,250" };
const SHIMMER: Record<Biome, string> = { grassland: "134,239,172", snow: "186,230,253", desert: "253,224,71", water: "103,232,249", cyber: "34,211,238" };

function ripples(ctx: CanvasRenderingContext2D, p: Vec, k: number, color: string): void {
  for (let i = 0; i < 3; i++) {
    const r = ((k * 1.5 + i / 3) % 1) * 70;
    ctx.strokeStyle = `rgba(${color},${0.6 * (1 - r / 70) * (1 - k * 0.6)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.4, 0, 0, TAU);
    ctx.stroke();
  }
}

function clods(ctx: CanvasRenderingContext2D, p: Vec, k: number, color: string): void {
  for (let i = 0; i < 12; i++) {
    const life = (k * 1.8 + hash(i, 1)) % 1;
    const a = hash(i, 2) * TAU;
    const x = p.x + Math.cos(a) * 30 * life;
    const y = p.y - Math.sin(Math.PI * life) * 34 + Math.sin(a) * 8 * life;
    ctx.fillStyle = `rgba(${color},${(1 - life) * 0.9})`;
    ctx.fillRect(x - 2.5, y - 2.5, 5, 4);
  }
  ctx.fillStyle = `rgba(30,20,10,${0.35 * (1 - k * 0.5)})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, 26, 10, 0, 0, TAU);
  ctx.fill();
}

function landing(ctx: CanvasRenderingContext2D, p: Vec, k: number, color: string): void {
  ctx.fillStyle = `rgba(15,23,42,${0.12 + 0.3 * k})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, 14 + 22 * k, (14 + 22 * k) * 0.4, 0, 0, TAU);
  ctx.fill();
  const land = Math.max(0, (k - 0.85) / 0.15);
  if (land > 0) {
    ctx.strokeStyle = `rgba(${color},${1 - land})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 20 + land * 60, (20 + land * 60) * 0.4, 0, 0, TAU);
    ctx.stroke();
  }
}

function swirl(ctx: CanvasRenderingContext2D, p: Vec, k: number, t: number, color: string): void {
  for (let i = 0; i < 24; i++) {
    const a = hash(i, 3) * TAU + t * 5;
    const r = (1 - k) * (20 + hash(i, 4) * 40) + 6;
    ctx.fillStyle = `rgba(${color},${0.8 * (1 - k * 0.7)})`;
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(a) * r, p.y - 24 + Math.sin(a) * r * 0.5 - hash(i, 5) * 30 * k, 2 + hash(i, 6) * 2, 0, TAU);
    ctx.fill();
  }
}

function shimmer(ctx: CanvasRenderingContext2D, p: Vec, k: number, t: number, color: string): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 6; i++) {
    const y = p.y - ((i / 6 + t * 1.5) % 1) * 60;
    ctx.strokeStyle = `rgba(${color},${0.5 * (1 - k)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x - 22, y);
    ctx.lineTo(p.x + 22, y);
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(p.x, p.y - 25, 0, p.x, p.y - 25, 45);
  g.addColorStop(0, `rgba(${color},${0.45 * (1 - k)})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(p.x - 45, p.y - 70, 90, 90);
  ctx.restore();
}

export function drawArrival(ctx: CanvasRenderingContext2D, way: CreatureEntrance, biome: Biome, p: Vec, k: number, t: number): void {
  if (way === "emerge") ripples(ctx, p, k, biome === "grassland" || biome === "water" ? "186,230,253" : DUST[biome]);
  else if (way === "burrow") clods(ctx, p, k, DUST[biome]);
  else if (way === "swoop" || way === "drop") landing(ctx, p, k, DUST[biome]);
  else if (way === "form") swirl(ctx, p, k, t, DUST[biome]);
  else shimmer(ctx, p, k, t, SHIMMER[biome]);
}

// the Grassland anaconda sliding out of the river (water spot -> where it is now): a wet trail
// up the bank, splashes thrown off it and water dripping from its scales
export function drawWake(ctx: CanvasRenderingContext2D, water: Vec, at: Vec, t: number): void {
  const len = Math.hypot(at.x - water.x, at.y - water.y);
  if (len < 2) {
    // still in the river: the water bulges and splashes round its head
    for (let i = 0; i < 6; i++) {
      const life = (t * 1.6 + hash(i, 5)) % 1;
      const a = hash(i, 6) * TAU;
      ctx.fillStyle = `rgba(224,250,255,${0.85 * (1 - life)})`;
      ctx.beginPath();
      ctx.arc(water.x + Math.cos(a) * 18 * life, water.y - Math.sin(Math.PI * life) * 22, 2.2, 0, TAU);
      ctx.fill();
    }
    return;
  }
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(30,58,70,0.28)";
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(water.x, water.y);
  ctx.lineTo(at.x, at.y);
  ctx.stroke();
  ctx.strokeStyle = "rgba(186,230,253,0.35)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
  for (let i = 0; i < 8; i++) {
    const life = (t * 2 + hash(i, 7)) % 1;
    const s = hash(i, 8);
    const x = water.x + (at.x - water.x) * s + (hash(i, 9) - 0.5) * 16;
    const y = water.y + (at.y - water.y) * s - 6 + life * 10;
    ctx.fillStyle = `rgba(207,250,254,${0.8 * (1 - life)})`;
    ctx.fillRect(x - 1, y - 1, 2, 3);
  }
}
