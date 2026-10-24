import type { Storm, Vec } from "@/types";
import { STORM_GATHER } from "@/game/storms";

// The level 3 storms, drawn like their sheet panels: first the turret glows and the storm
// gathers around it (a vortex of sand, water or snow), then it hits the target area, dense at
// first and thinner with every enemy it hits, and finally drifts away.
//   Sandstorm   a rolling cloud of sand with streaks of blown grit and tumbling stones
//   Ocean Storm a swirling dome of water with spiral currents and rising bubbles
//   Snowstorm   a tall white whirl of snow with flakes spiralling round it

type Palette = { glow: string; body: string; streak: string };

const PALETTE: Record<Storm["kind"], Palette> = {
  sandstorm: { glow: "234,179,8", body: "214,170,110", streak: "253,230,170" },
  ocean: { glow: "34,211,238", body: "56,189,248", streak: "186,245,255" },
  snowstorm: { glow: "147,197,253", body: "235,245,255", streak: "255,255,255" },
};

function rnd(i: number): number {
  const x = Math.sin(i * 91.7 + 13.1) * 43758.5453;
  return x - Math.floor(x);
}

function glowDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// the vortex building round the turret before the storm goes out (k: 0..1 through it)
function drawGather(ctx: CanvasRenderingContext2D, s: Storm, k: number, t: number): void {
  const p = PALETTE[s.kind];
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  glowDot(ctx, s.from.x, s.from.y - 24, 30 + k * 30, p.glow, 0.5 + k * 0.4);
  ctx.strokeStyle = `rgba(${p.streak},${0.3 + k * 0.5})`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const r = 50 * (1 - k * 0.5) + i * 8;
    const a0 = t * 7 + i * 1.6;
    ctx.beginPath();
    ctx.ellipse(s.from.x, s.from.y - 10 - i * 7, r, r * 0.45, 0, a0, a0 + 2.2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSand(ctx: CanvasRenderingContext2D, s: Storm, a: number, t: number): void {
  const p = PALETTE.sandstorm;
  // billowing clouds orbiting the eye
  for (let i = 0; i < 16; i++) {
    const r = s.radius * (0.25 + rnd(i) * 0.75);
    const ang = t * (0.9 + rnd(i + 30)) + rnd(i + 60) * 6.28;
    const x = s.pos.x + Math.cos(ang) * r;
    const y = s.pos.y + Math.sin(ang) * r * 0.5 - 14 - rnd(i + 90) * 20;
    const size = 22 + rnd(i + 120) * 26;
    ctx.fillStyle = `rgba(${p.body},${0.32 * a})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  // streaks of grit and tumbling stones
  ctx.strokeStyle = `rgba(${p.streak},${0.7 * a})`;
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 12; i++) {
    const r = s.radius * (0.3 + rnd(i + 7) * 0.8);
    const ang = t * 2.4 + i * 0.52;
    ctx.beginPath();
    ctx.ellipse(s.pos.x, s.pos.y - 12 - (i % 3) * 10, r, r * 0.45, 0, ang, ang + 0.7);
    ctx.stroke();
  }
  ctx.fillStyle = `rgba(120,80,40,${0.85 * a})`;
  for (let i = 0; i < 10; i++) {
    const ang = t * 3 + i * 0.63;
    const r = s.radius * (0.2 + rnd(i + 200) * 0.7);
    ctx.fillRect(s.pos.x + Math.cos(ang) * r, s.pos.y + Math.sin(ang) * r * 0.5 - 20 - Math.abs(Math.sin(t * 6 + i)) * 18, 3, 3);
  }
}

function drawOcean(ctx: CanvasRenderingContext2D, s: Storm, a: number, t: number): void {
  const p = PALETTE.ocean;
  // the dome of swirling water
  const g = ctx.createRadialGradient(s.pos.x, s.pos.y - 30, 4, s.pos.x, s.pos.y - 10, s.radius);
  g.addColorStop(0, `rgba(186,245,255,${0.35 * a})`);
  g.addColorStop(0.7, `rgba(${p.body},${0.22 * a})`);
  g.addColorStop(1, `rgba(${p.body},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(s.pos.x, s.pos.y - 10, s.radius, s.radius * 0.7, 0, Math.PI, 0);
  ctx.ellipse(s.pos.x, s.pos.y - 10, s.radius, s.radius * 0.45, 0, 0, Math.PI);
  ctx.fill();
  // spiral currents
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `rgba(${p.streak},${0.6 * a})`;
  ctx.lineWidth = 2.2;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    for (let j = 0; j <= 24; j++) {
      const u = j / 24;
      const ang = t * 2.2 + i * 1.256 + u * 4;
      const r = s.radius * (0.15 + u * 0.8);
      const x = s.pos.x + Math.cos(ang) * r;
      const y = s.pos.y - 8 + Math.sin(ang) * r * 0.45 - u * 10;
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
  // bubbles rising through it
  ctx.strokeStyle = `rgba(224,250,255,${0.85 * a})`;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) {
    const rise = (t * 0.6 + rnd(i)) % 1;
    const x = s.pos.x + (rnd(i + 40) - 0.5) * s.radius * 1.6 + Math.sin(t * 3 + i) * 4;
    const y = s.pos.y - rise * 70;
    ctx.beginPath();
    ctx.arc(x, y, 2 + rnd(i + 80) * 3, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawSnow(ctx: CanvasRenderingContext2D, s: Storm, a: number, t: number): void {
  const p = PALETTE.snowstorm;
  // a tall whirl: rings of snow stacked up the column, narrowing toward the top
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  glowDot(ctx, s.pos.x, s.pos.y - 30, s.radius, p.glow, 0.35 * a);
  ctx.restore();
  for (let i = 0; i < 8; i++) {
    const h = i * 12;
    const r = s.radius * (1 - i * 0.07);
    const ang = t * (3 + i * 0.3) + i;
    ctx.strokeStyle = `rgba(${p.body},${(0.75 - i * 0.05) * a})`;
    ctx.lineWidth = 6 - i * 0.4;
    ctx.beginPath();
    ctx.ellipse(s.pos.x, s.pos.y - h, r, r * 0.4, 0, ang, ang + 3.6);
    ctx.stroke();
  }
  // flakes spiralling round it
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  for (let i = 0; i < 26; i++) {
    const ang = t * (2 + rnd(i)) + rnd(i + 50) * 6.28;
    const r = s.radius * (0.2 + rnd(i + 100) * 0.9);
    const x = s.pos.x + Math.cos(ang) * r;
    const y = s.pos.y + Math.sin(ang) * r * 0.4 - rnd(i + 150) * 90;
    ctx.beginPath();
    ctx.arc(x, y, 1.5 + rnd(i + 170) * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawStorm(ctx: CanvasRenderingContext2D, s: Storm, t: number): void {
  if (s.age < STORM_GATHER) {
    drawGather(ctx, s, s.age / STORM_GATHER, t);
    return;
  }
  const k = (s.age - STORM_GATHER) / Math.max(0.01, s.life - STORM_GATHER);
  // dense at first, thinner after every hit; fades in and drifts away at the end
  const thin = 1 - 0.65 * (s.hits / s.maxHits);
  const a = thin * Math.min(1, k * 6) * Math.min(1, (1 - k) * 4);
  // a shadow on the ground under it
  ctx.fillStyle = `rgba(0,0,0,${0.18 * a})`;
  ctx.beginPath();
  ctx.ellipse(s.pos.x, s.pos.y + 4, s.radius, s.radius * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  if (s.kind === "sandstorm") drawSand(ctx, s, a, t);
  else if (s.kind === "ocean") drawOcean(ctx, s, a, t);
  else drawSnow(ctx, s, a, t);
}

// the charge glow round a level 3 storm turret as its storm comes ready again (last 2 s)
export function drawStormReady(ctx: CanvasRenderingContext2D, kind: Storm["kind"], at: Vec, special: number, t: number): void {
  if (special > 2) return;
  const k = 1 - special / 2;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  glowDot(ctx, at.x, at.y - 20, 18 + k * 16 + Math.sin(t * 8) * 3, PALETTE[kind].glow, 0.15 + k * 0.35);
  ctx.restore();
}
