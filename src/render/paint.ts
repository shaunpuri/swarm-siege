import type { Vec } from "@/types";

// Small canvas painting helpers shared by the world effects (storms, enemy attacks, deaths).

export function glowDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number): void {
  if (r <= 0 || a <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// draws with additive blending (glows, energy)
export function lit(ctx: CanvasRenderingContext2D, draw: () => void): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  draw();
  ctx.restore();
}

// a steady pseudo random number 0..1 for (seed, i)
export function rnd(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// a flat ring on the ground (a shockwave), radius r
export function groundRing(ctx: CanvasRenderingContext2D, at: Vec, r: number, rgb: string, a: number, width: number): void {
  if (a <= 0) return;
  ctx.strokeStyle = `rgba(${rgb},${a})`;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.ellipse(at.x, at.y, r, r * 0.45, 0, 0, Math.PI * 2);
  ctx.stroke();
}

// crystals (or spikes, or roots) bursting up from the ground in a ring of radius r
export function spikes(ctx: CanvasRenderingContext2D, at: Vec, r: number, n: number, height: number, color: string, seed: number): void {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd(seed, i) * 0.4;
    const x = at.x + Math.cos(a) * r;
    const y = at.y + Math.sin(a) * r * 0.45;
    const h = height * (0.6 + rnd(seed, i + 9) * 0.6);
    const lean = (rnd(seed, i + 19) - 0.5) * h * 0.5;
    ctx.beginPath();
    ctx.moveTo(x - 3.5, y);
    ctx.lineTo(x + lean, y - h);
    ctx.lineTo(x + 3.5, y);
    ctx.fill();
  }
}

// bits thrown out and up from a point and falling back (k: 0..1 through it)
export function thrown(ctx: CanvasRenderingContext2D, at: Vec, k: number, n: number, reach: number, color: string, size: number, seed: number): void {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = rnd(seed, i) * Math.PI * 2;
    const r = reach * (0.5 + rnd(seed, i + 20) * 0.5) * k;
    const up = Math.sin(Math.PI * Math.min(1, k * 1.2)) * reach * 0.6 * rnd(seed, i + 40);
    ctx.beginPath();
    ctx.arc(at.x + Math.cos(a) * r, at.y + Math.sin(a) * r * 0.5 - up, size * (1 - k * 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
}

// a jagged electric line from a to b
export function zap(ctx: CanvasRenderingContext2D, a: Vec, b: Vec, rgb: string, alpha: number, t: number, jag: number): void {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1) return;
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  ctx.strokeStyle = `rgba(${rgb},${alpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  for (let i = 1; i < 6; i++) {
    const k = i / 6;
    const j = Math.sin(t * 70 + i * 7.3) * jag;
    ctx.lineTo(a.x + (b.x - a.x) * k + nx * j, a.y + (b.y - a.y) * k + ny * j);
  }
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}
