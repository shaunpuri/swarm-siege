import type { Biome, Vec } from "@/types";

// The effects drawn over a final boss's entrance (k: 0..1 through it), in logical screen
// pixels at the boss's spawn point. Everything is a pure function of k, so it needs no state.
//   Desert, following the Mummy King's sheet: golden glow and light rays through the cracks
//   (0-1s), the pyramid bursting into flying stones (1s), a sandstorm that fills the area
//   (1.5-2.5s) and settles (2.5-3s) to reveal him.
//   Grassland: root cracks spread from the stump, an emerald pulse rings out, leaves swirl up
//   around the waking Colossus.
//   Cold World: the dragon's shadow sweeps in, then a frost shockwave and ice shards on landing.
//   Aqua Realm: a whirlpool spins open on the sea floor and bursts into bubbles.

const TAU = Math.PI * 2;

// fixed pseudo random numbers per index, so particles keep their paths frame to frame
export function hash(i: number, salt: number): number {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// rises from 0 to 1 over [a, b]
function ramp(k: number, a: number, b: number): number {
  return clamp01((k - a) / (b - a));
}

function glow(ctx: CanvasRenderingContext2D, p: Vec, r: number, color: string, alpha: number): void {
  if (alpha <= 0) return;
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
  g.addColorStop(0, `rgba(${color},${alpha})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, TAU);
  ctx.fill();
}

function desert(ctx: CanvasRenderingContext2D, p: Vec, k: number, t: number): void {
  const core = { x: p.x, y: p.y - 70 };
  // golden light from inside the pyramid, rays through the cracks
  glow(ctx, core, 120, "253,224,71", 0.5 * ramp(k, 0, 0.25) * (1 - ramp(k, 0.3, 0.45)));
  if (k > 0.1 && k < 0.3) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (hash(i, 1) - 0.5) * 2.4;
      const len = 120 + hash(i, 2) * 140;
      ctx.strokeStyle = `rgba(253,230,138,${0.35 * ramp(k, 0.1, 0.2)})`;
      ctx.lineWidth = 6 + hash(i, 3) * 8;
      ctx.beginPath();
      ctx.moveTo(core.x, core.y);
      ctx.lineTo(core.x + Math.cos(a) * len, core.y + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.restore();
  }
  // the burst: stones fly out and fall back
  const burst = k - 0.25;
  if (burst > 0 && burst < 0.35) {
    const s = burst * 4;
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI * (0.1 + 0.8 * hash(i, 4));
      const v = 160 + hash(i, 5) * 260;
      const x = core.x + Math.cos(a) * v * s;
      const y = core.y + Math.sin(a) * v * s + 260 * s * s;
      const size = 5 + hash(i, 6) * 12;
      ctx.fillStyle = `rgba(${150 + hash(i, 7) * 60},${100 + hash(i, 8) * 40},60,${1 - burst / 0.35})`;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(s * 6 * (hash(i, 9) - 0.5));
      ctx.fillRect(-size / 2, -size / 2, size, size * 0.8);
      ctx.restore();
    }
    glow(ctx, core, 220 * s + 40, "254,240,138", 0.7 * (1 - s));
  }
  // the sandstorm: rolls in, peaks at 1.5-2.5s, settles by 3s
  const storm = ramp(k, 0.3, 0.42) * (1 - ramp(k, 0.62, 0.78));
  if (storm > 0) {
    ctx.fillStyle = `rgba(214,170,110,${0.35 * storm})`;
    ctx.fillRect(0, 0, 1280, 720);
    for (let i = 0; i < 46; i++) {
      const ring = 40 + hash(i, 10) * 300;
      const a = hash(i, 11) * TAU + t * (0.8 + hash(i, 12)) * (i % 2 ? 1 : -1);
      const x = p.x + Math.cos(a) * ring * 1.3;
      const y = p.y - 40 + Math.sin(a) * ring * 0.55;
      glow(ctx, { x, y }, 50 + hash(i, 13) * 70, "222,184,135", 0.45 * storm);
    }
  }
}

function grassland(ctx: CanvasRenderingContext2D, p: Vec, k: number, t: number): void {
  // root cracks spreading from the stump
  const crack = ramp(k, 0, 0.5);
  ctx.strokeStyle = `rgba(74,222,128,${0.7 * (1 - ramp(k, 0.8, 1))})`;
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + hash(i, 1) * 0.5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    let x = p.x;
    let y = p.y;
    for (let j = 1; j <= 5; j++) {
      const r = (j / 5) * 120 * crack;
      x = p.x + Math.cos(a + (hash(i * 7 + j, 2) - 0.5) * 0.5) * r;
      y = p.y + Math.sin(a + (hash(i * 7 + j, 3) - 0.5) * 0.5) * r * 0.5;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // emerald pulse ring
  const pulse = ramp(k, 0.35, 0.9);
  if (pulse > 0 && pulse < 1) {
    ctx.strokeStyle = `rgba(52,211,153,${0.8 * (1 - pulse)})`;
    ctx.lineWidth = 8 * (1 - pulse) + 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 40 + pulse * 220, (40 + pulse * 220) * 0.45, 0, 0, TAU);
    ctx.stroke();
  }
  glow(ctx, { x: p.x, y: p.y - 60 }, 140, "74,222,128", 0.4 * Math.sin(Math.PI * k));
  // leaves swirling up
  for (let i = 0; i < 30; i++) {
    const life = (k * 1.6 + hash(i, 4)) % 1;
    const a = hash(i, 5) * TAU + t * 3;
    const r = 30 + life * 90;
    ctx.fillStyle = `rgba(${100 + hash(i, 6) * 80},${200 + hash(i, 7) * 50},90,${(1 - life) * 0.9 * (1 - ramp(k, 0.85, 1))})`;
    ctx.beginPath();
    ctx.ellipse(p.x + Math.cos(a) * r, p.y - life * 180, 5, 2.5, a, 0, TAU);
    ctx.fill();
  }
}

// the Ice Dragon's sheet, 4 seconds: blizzard and a rune circle (0-1s), the ground cracks and
// ice shards burst out as the claws emerge (1-2s), the head rises and the wings unfold in a
// frost burst (2-3s), a full roar with a flash, then the blizzard settles (3-4s)
function snow(ctx: CanvasRenderingContext2D, p: Vec, k: number, t: number): void {
  const blizzard = ramp(k, 0, 0.15) * (1 - ramp(k, 0.8, 1));
  if (blizzard > 0) {
    ctx.fillStyle = `rgba(203,213,225,${0.22 * blizzard})`;
    ctx.fillRect(0, 0, 1280, 720);
    for (let i = 0; i < 70; i++) {
      const a = hash(i, 1) * TAU + t * (1.5 + hash(i, 2));
      const r = 30 + hash(i, 3) * 220;
      ctx.fillStyle = `rgba(255,255,255,${0.75 * blizzard})`;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * r * 1.3, p.y - 40 + Math.sin(a) * r * 0.5, 1.5 + hash(i, 4) * 2.5, 0, TAU);
      ctx.fill();
    }
  }
  // rune circle glowing under the snow
  const rune = ramp(k, 0.08, 0.2) * (1 - ramp(k, 0.4, 0.55));
  if (rune > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(56,189,248,${0.8 * rune})`;
    ctx.lineWidth = 3;
    for (const r of [70, 52]) {
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.42, 0, 0, TAU);
      ctx.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + t * 0.6;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(a) * 52, p.y + Math.sin(a) * 52 * 0.42);
      ctx.lineTo(p.x + Math.cos(a + 0.5) * 70, p.y + Math.sin(a + 0.5) * 70 * 0.42);
      ctx.stroke();
    }
    glow(ctx, p, 110, "56,189,248", 0.35 * rune);
    ctx.restore();
  }
  // cracks spreading over the ice
  const crack = ramp(k, 0.25, 0.4);
  if (crack > 0) {
    ctx.strokeStyle = `rgba(125,211,252,${0.9 * (1 - ramp(k, 0.85, 1))})`;
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + hash(i, 5);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      for (let j = 1; j <= 4; j++) {
        const r = (j / 4) * 130 * crack;
        ctx.lineTo(p.x + Math.cos(a + (hash(i * 5 + j, 6) - 0.5) * 0.6) * r, p.y + Math.sin(a + (hash(i * 5 + j, 7) - 0.5) * 0.6) * r * 0.45);
      }
      ctx.stroke();
    }
  }
  // ice shards bursting up and out
  const shards = k - 0.35;
  if (shards > 0 && shards < 0.3) {
    const s = shards / 0.3;
    for (let i = 0; i < 16; i++) {
      const a = hash(i, 8) * TAU;
      const r = 30 + s * (80 + hash(i, 9) * 90);
      const x = p.x + Math.cos(a) * r;
      const y = p.y + Math.sin(a) * r * 0.45 - Math.sin(Math.PI * s) * (40 + hash(i, 10) * 50);
      const h = 14 + hash(i, 11) * 22;
      ctx.fillStyle = `rgba(186,230,253,${1 - s})`;
      ctx.beginPath();
      ctx.moveTo(x, y - h);
      ctx.lineTo(x - 5, y);
      ctx.lineTo(x + 5, y);
      ctx.fill();
    }
  }
  // frost burst as the wings unfold, and the roar's flash
  const wave = ramp(k, 0.6, 0.85);
  if (wave > 0 && wave < 1) {
    ctx.strokeStyle = `rgba(224,242,254,${1 - wave})`;
    ctx.lineWidth = 10 * (1 - wave) + 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 60 + wave * 280, (60 + wave * 280) * 0.42, 0, 0, TAU);
    ctx.stroke();
  }
  glow(ctx, { x: p.x, y: p.y - 80 }, 260, "224,242,254", 0.6 * Math.max(0, 1 - Math.abs(k - 0.75) / 0.06));
}

function water(ctx: CanvasRenderingContext2D, p: Vec, k: number, t: number): void {
  // a whirlpool spins open, then bursts into bubbles as Damyaan rises
  const open = ramp(k, 0, 0.4) * (1 - ramp(k, 0.75, 1));
  ctx.lineWidth = 3;
  for (let arm = 0; arm < 4; arm++) {
    ctx.strokeStyle = `rgba(165,243,252,${0.55 * open})`;
    ctx.beginPath();
    for (let j = 0; j <= 40; j++) {
      const f = j / 40;
      const a = arm * (TAU / 4) + f * 5 + t * 4;
      const r = f * 150 * open;
      const x = p.x + Math.cos(a) * r;
      const y = p.y + Math.sin(a) * r * 0.45;
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  glow(ctx, p, 160, "34,211,238", 0.4 * open);
  for (let i = 0; i < 40; i++) {
    const life = (k * 1.4 + hash(i, 1)) % 1;
    const x = p.x + (hash(i, 2) - 0.5) * 160 + Math.sin(t * 3 + i) * 6;
    const y = p.y - life * 260;
    const r = 2 + hash(i, 3) * 6;
    ctx.strokeStyle = `rgba(224,247,255,${(1 - life) * 0.8 * ramp(k, 0.3, 0.5)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
  }
}

export function drawBossIntro(ctx: CanvasRenderingContext2D, biome: Biome, at: Vec, k: number, t: number): void {
  if (biome === "desert") desert(ctx, at, k, t);
  else if (biome === "grassland") grassland(ctx, at, k, t);
  else if (biome === "snow") snow(ctx, at, k, t);
  else if (biome === "water") water(ctx, at, k, t);
}

