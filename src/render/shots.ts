import type { Biome, Projectile, Vec } from "@/types";

// Shots that follow each turret sheet's attack animation panels. In the worlds a turret's
// design follows its upgrade level, so the shot does too:
//   Forest   Mud Mortar lobs a mud glob in a high arc; Wildwood Repeater fires wooden arrows
//            with a green leaf trail; Worldroot Guardian lashes roots along the ground
//   Cold     Frost Mortar lobs a crystal ice bomb; Ice Machine Gun sprays ice bullets; Ice
//            Cannon fires a big ricocheting crystal shard
//   Desert   Sun Reflector holds a golden beam of sunlight; Flame Cannon pours a flame stream;
//            Cactus Sand Mortar lobs spiky cactus pods trailing sand
//   Aqua     Tide Launcher lobs a water orb; Current Repeater fires water bolts; Abyssal
//            Cannon fires a ricocheting water blast
//   Cyber    Electric Arc fires a crackling arc shot; Drone Swarm sends a drone that drops a
//            purple bomb; Quantum Singularity holds an oscillating wave beam
// Each also names the burst it makes when it lands (src/render/impacts.ts). Drawn with canvas
// shapes in logical pixels; `muzzle` is how high the turret's barrel sits.

import { drawDrone } from "@/render/drone";

export type Style = "lob" | "arrow" | "roots" | "beam" | "flame" | "rapid" | "shard" | "arcbolt" | "drone" | "wave";
export type Impact = "mud" | "leaf" | "ice" | "gold" | "fire" | "sand" | "water" | "spark" | "purple";
export type Look = { style: Style; core: string; glow: string; size: number; impact: Impact };

const L = (style: Style, core: string, glow: string, size: number, impact: Impact): Look => ({ style, core, glow, size, impact });

// per world, the three designs (upgrade levels 1, 2, 3)
const LOOKS: Record<Biome, [Look, Look, Look]> = {
  grassland: [L("lob", "#7c4a1e", "146,90,40", 10, "mud"), L("arrow", "#a16207", "134,239,172", 14, "leaf"), L("roots", "#6b4423", "74,222,128", 9, "leaf")],
  snow: [L("lob", "#dbeafe", "96,165,250", 10, "ice"), L("rapid", "#e0f2fe", "56,189,248", 8, "ice"), L("shard", "#dbeafe", "59,130,246", 13, "ice")],
  desert: [L("beam", "#fde68a", "250,204,21", 6, "gold"), L("flame", "#fb923c", "249,115,22", 10, "fire"), L("lob", "#4d7c0f", "234,179,8", 11, "sand")],
  water: [L("lob", "#a5f3fc", "34,211,238", 10, "water"), L("rapid", "#67e8f9", "6,182,212", 8, "water"), L("shard", "#e0f7ff", "14,165,233", 14, "water")],
  cyber: [L("arcbolt", "#e0f2fe", "56,189,248", 10, "spark"), L("drone", "#e879f9", "192,38,211", 10, "purple"), L("wave", "#f5d0fe", "168,85,247", 7, "purple")],
};

export function lookFor(biome: Biome, level: number): Look | undefined {
  return LOOKS[biome][Math.max(0, Math.min(2, level - 1))];
}

export function shotLook(p: Projectile, biome: Biome): Look | null {
  if (!p.family) return null;
  return LOOKS[biome][Math.max(0, Math.min(2, p.design))] ?? null;
}

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// how far along its flight a shot is, 0..1
function progress(p: Projectile): number {
  const done = dist(p.start, p.pos);
  const left = dist(p.pos, p.target);
  return done + left < 1 ? 1 : done / (done + left);
}

// a lobbed shot's height above the ground at progress k (from the barrel up into its arc)
function lobHeight(p: Projectile, k: number, muzzle: number): number {
  return muzzle * (1 - k) + Math.sin(Math.PI * k) * (60 + dist(p.start, p.target) * 0.22);
}

function glowDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function lit(ctx: CanvasRenderingContext2D, draw: () => void): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  draw();
  ctx.restore();
}

// ---- lobbed shots: mud glob, ice bomb, cactus pod, water orb

function lobBody(ctx: CanvasRenderingContext2D, look: Look, at: Vec, s: number, t: number): void {
  ctx.fillStyle = look.core;
  ctx.beginPath();
  if (look.impact === "ice") {
    // a faceted crystal bomb
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + t * 4;
      const r = i % 2 === 0 ? s : s * 0.7;
      ctx.lineTo(at.x + Math.cos(a) * r, at.y + Math.sin(a) * r);
    }
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.moveTo(at.x - s * 0.3, at.y - s * 0.5);
    ctx.lineTo(at.x + s * 0.2, at.y - s * 0.1);
    ctx.lineTo(at.x - s * 0.1, at.y + s * 0.2);
    ctx.fill();
    return;
  }
  if (look.impact === "sand") {
    // a spiky cactus pod, tumbling
    ctx.ellipse(at.x, at.y, s * 0.8, s * 0.62, t * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fef08a";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + t * 6;
      ctx.beginPath();
      ctx.moveTo(at.x + Math.cos(a) * s * 0.7, at.y + Math.sin(a) * s * 0.55);
      ctx.lineTo(at.x + Math.cos(a) * s * 1.15, at.y + Math.sin(a) * s * 0.95);
      ctx.stroke();
    }
    return;
  }
  // a wet mud glob (wobbling) or a glowing water orb
  const wob = look.impact === "mud" ? Math.sin(t * 18) * 0.12 : 0;
  ctx.ellipse(at.x, at.y, s * (0.8 + wob), s * (0.8 - wob), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = look.impact === "mud" ? "rgba(255,230,190,0.35)" : "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(at.x - s * 0.25, at.y - s * 0.3, s * 0.25, 0, Math.PI * 2);
  ctx.fill();
}

function drawLob(ctx: CanvasRenderingContext2D, look: Look, p: Projectile, muzzle: number, t: number): void {
  const k = progress(p);
  const s = look.size;
  const h = lobHeight(p, k, muzzle);
  // its shadow on the ground, smaller the higher it flies
  const shade = Math.max(0.3, 1 - h / 200);
  ctx.fillStyle = `rgba(0,0,0,${0.3 * shade})`;
  ctx.beginPath();
  ctx.ellipse(p.pos.x, p.pos.y, 7 * shade, 3.5 * shade, 0, 0, Math.PI * 2);
  ctx.fill();
  // the trail along the arc behind it (drips of mud, ice glitter, blown sand, water)
  const along = { x: p.target.x - p.start.x, y: p.target.y - p.start.y };
  for (let i = 5; i >= 1; i--) {
    const kk = Math.max(0, k - i * 0.035);
    const x = p.start.x + along.x * kk;
    const y = p.start.y + along.y * kk - lobHeight(p, kk, muzzle);
    lit(ctx, () => glowDot(ctx, x, y, s * (1.3 - i * 0.15), look.glow, 0.5 - i * 0.08));
  }
  const at = { x: p.pos.x, y: p.pos.y - h };
  lit(ctx, () => glowDot(ctx, at.x, at.y, s * 2.2, look.glow, 0.55));
  lobBody(ctx, look, at, s, t);
}

// ---- direct shots

function drawArrow(ctx: CanvasRenderingContext2D, look: Look, at: Vec, angle: number, t: number): void {
  const s = look.size;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  // the green leaf trail, fluttering
  lit(ctx, () => {
    const g = ctx.createLinearGradient(at.x - dx * s * 3.5, at.y - dy * s * 3.5, at.x, at.y);
    g.addColorStop(0, `rgba(${look.glow},0)`);
    g.addColorStop(1, `rgba(${look.glow},0.8)`);
    ctx.strokeStyle = g;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(at.x - dx * s * 3.5 - dy * Math.sin(t * 20) * 4, at.y - dy * s * 3.5 + dx * Math.sin(t * 20) * 4);
    ctx.quadraticCurveTo(at.x - dx * s * 1.6 + dy * 4, at.y - dy * s * 1.6 - dx * 4, at.x, at.y);
    ctx.stroke();
  });
  for (let i = 1; i <= 2; i++) {
    ctx.fillStyle = "#4ade80";
    ctx.beginPath();
    ctx.ellipse(at.x - dx * s * (1.4 + i), at.y - dy * s * (1.4 + i) + Math.sin(t * 16 + i) * 3, 3, 1.5, t * 8 + i, 0, Math.PI * 2);
    ctx.fill();
  }
  // the wooden shaft and carved leaf-shaped head
  ctx.strokeStyle = look.core;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(at.x - dx * s * 1.4, at.y - dy * s * 1.4);
  ctx.lineTo(at.x, at.y);
  ctx.stroke();
  ctx.fillStyle = "#86efac";
  ctx.beginPath();
  ctx.moveTo(at.x + dx * 7, at.y + dy * 7);
  ctx.lineTo(at.x + Math.cos(angle + 2.3) * 4, at.y + Math.sin(angle + 2.3) * 4);
  ctx.lineTo(at.x - dx * 2, at.y - dy * 2);
  ctx.lineTo(at.x + Math.cos(angle - 2.3) * 4, at.y + Math.sin(angle - 2.3) * 4);
  ctx.fill();
}

// the Worldroot Guardian's root: it runs along the ground from the tree to the enemy, arching
// a little, thick at the tree and tapering to a glowing tip
function drawRoots(ctx: CanvasRenderingContext2D, look: Look, p: Projectile, t: number): void {
  drawRootSpan(ctx, look, { x: p.start.x, y: p.start.y + 6 }, { x: p.pos.x, y: p.pos.y - 6 }, p.id, t);
}

// one root from the tree (from) to its tip (to); also used as it pulls back after a strike
export function drawRootSpan(ctx: CanvasRenderingContext2D, look: Look, from: Vec, to: Vec, seed: number, t: number): void {
  const len = dist(from, to);
  if (len < 2) return;
  const nx = -(to.y - from.y) / len;
  const ny = (to.x - from.x) / len;
  const steps = 14;
  const point = (s: number): Vec => {
    const wave = Math.sin(s * 9 - t * 10 + seed) * 6 * s;
    return { x: from.x + (to.x - from.x) * s + nx * wave, y: from.y + (to.y - from.y) * s + ny * wave - Math.sin(Math.PI * s) * 16 };
  };
  ctx.lineCap = "round";
  for (let i = 0; i < steps; i++) {
    const a = point(i / steps);
    const b = point((i + 1) / steps);
    const w = look.size * (1 - (i / steps) * 0.8);
    ctx.strokeStyle = "rgba(40,24,12,0.9)";
    ctx.lineWidth = w + 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = i % 3 === 0 ? "#8b5a2b" : look.core;
    ctx.lineWidth = w;
    ctx.stroke();
  }
  // moss flecks and the magic tip
  for (let i = 2; i < steps; i += 4) {
    const a = point(i / steps);
    ctx.fillStyle = "#4ade80";
    ctx.beginPath();
    ctx.ellipse(a.x + 2, a.y - 2, 2.5, 1.3, i, 0, Math.PI * 2);
    ctx.fill();
  }
  lit(ctx, () => glowDot(ctx, to.x, to.y, 16, look.glow, 0.85));
}

function drawBeam(ctx: CanvasRenderingContext2D, look: Look, from: Vec, at: Vec, t: number): void {
  lit(ctx, () => {
    ctx.lineCap = "round";
    ctx.strokeStyle = `rgba(${look.glow},0.55)`;
    ctx.lineWidth = look.size * 2.2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(at.x, at.y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,251,235,0.95)";
    ctx.lineWidth = look.size * 0.45;
    ctx.stroke();
    // glowing motes drifting along the beam
    for (let i = 0; i < 5; i++) {
      const s = (t * 1.7 + i / 5) % 1;
      glowDot(ctx, from.x + (at.x - from.x) * s, from.y + (at.y - from.y) * s + Math.sin(t * 9 + i) * 3, 5, look.glow, 0.8);
    }
    glowDot(ctx, from.x, from.y, 14, look.glow, 0.9);
    glowDot(ctx, at.x, at.y, 18, look.glow, 0.9);
  });
}

function drawFlame(ctx: CanvasRenderingContext2D, look: Look, from: Vec, at: Vec, t: number): void {
  // a continuous stream: white-hot at the nozzle, orange, then dark red smoke at its end
  lit(ctx, () => {
    const n = 12;
    for (let i = n; i >= 0; i--) {
      const s = i / n;
      const x = from.x + (at.x - from.x) * s;
      const y = from.y + (at.y - from.y) * s + Math.sin(t * 40 + i * 1.7) * 2.5 * s - s * s * 8;
      const r = look.size * (0.5 + s * 1.3) * (0.9 + 0.2 * Math.sin(t * 30 + i));
      glowDot(ctx, x, y, r * 1.8, s < 0.25 ? "255,240,200" : s < 0.7 ? look.glow : "220,38,38", 0.75 - s * 0.35);
    }
  });
  for (let i = 0; i < 4; i++) {
    const s = (t * 2.3 + i / 4) % 1;
    ctx.fillStyle = "rgba(254,215,170,0.9)";
    ctx.fillRect(from.x + (at.x - from.x) * s + Math.sin(t * 50 + i) * 6, from.y + (at.y - from.y) * s - 6 - s * 10, 2, 2);
  }
}

function drawRapid(ctx: CanvasRenderingContext2D, look: Look, at: Vec, angle: number): void {
  const s = look.size;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const back = { x: at.x - dx * s * 3, y: at.y - dy * s * 3 };
  lit(ctx, () => {
    const g = ctx.createLinearGradient(back.x, back.y, at.x, at.y);
    g.addColorStop(0, `rgba(${look.glow},0)`);
    g.addColorStop(1, `rgba(${look.glow},0.9)`);
    ctx.strokeStyle = g;
    ctx.lineWidth = s * 0.7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(back.x, back.y);
    ctx.lineTo(at.x, at.y);
    ctx.stroke();
    glowDot(ctx, at.x, at.y, s * 1.6, look.glow, 0.7);
  });
  // a sharp ice bullet or water bolt, pointed along its flight
  ctx.fillStyle = look.core;
  ctx.beginPath();
  ctx.moveTo(at.x + dx * s, at.y + dy * s);
  ctx.lineTo(at.x - dy * s * 0.35, at.y + dx * s * 0.35);
  ctx.lineTo(at.x - dx * s * 0.6, at.y - dy * s * 0.6);
  ctx.lineTo(at.x + dy * s * 0.35, at.y - dx * s * 0.35);
  ctx.fill();
}

function drawShard(ctx: CanvasRenderingContext2D, look: Look, at: Vec, angle: number, t: number): void {
  const s = look.size;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  lit(ctx, () => {
    glowDot(ctx, at.x, at.y, s * 2.6, look.glow, 0.7);
    // trailing streaks: shards of ice, or the swirl of the water blast
    for (let i = 1; i <= 3; i++) {
      const off = look.impact === "water" ? Math.sin(t * 25 + i * 2) * s * 0.6 : (i - 2) * s * 0.4;
      ctx.strokeStyle = `rgba(${look.glow},${0.75 - i * 0.18})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(at.x - dx * s * (1 + i) - dy * off, at.y - dy * s * (1 + i) + dx * off);
      ctx.lineTo(at.x - dx * s * 0.5, at.y - dy * s * 0.5);
      ctx.stroke();
    }
  });
  ctx.fillStyle = look.core;
  ctx.beginPath();
  if (look.impact === "water") {
    ctx.arc(at.x, at.y, s * 0.75, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // a long faceted crystal
    ctx.moveTo(at.x + dx * s * 1.3, at.y + dy * s * 1.3);
    ctx.lineTo(at.x - dy * s * 0.45 + dx * s * 0.2, at.y + dx * s * 0.45 + dy * s * 0.2);
    ctx.lineTo(at.x - dx * s * 0.9, at.y - dy * s * 0.9);
    ctx.lineTo(at.x + dy * s * 0.45 + dx * s * 0.2, at.y - dx * s * 0.45 + dy * s * 0.2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath();
  ctx.arc(at.x + dx * s * 0.2 - dy * s * 0.15, at.y + dy * s * 0.2 + dx * s * 0.15, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawArcBolt(ctx: CanvasRenderingContext2D, look: Look, at: Vec, angle: number, t: number): void {
  const s = look.size;
  const back = { x: at.x - Math.cos(angle) * s * 3.5, y: at.y - Math.sin(angle) * s * 3.5 };
  lit(ctx, () => {
    // the crackling trail, re-jagged every frame, with a forked spark or two
    ctx.strokeStyle = `rgba(${look.glow},0.95)`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(back.x, back.y);
    for (let i = 1; i <= 6; i++) {
      const k = i / 6;
      const j = Math.sin(t * 70 + i * 7.3) * s * 0.45 * (1 - k);
      ctx.lineTo(back.x + (at.x - back.x) * k - Math.sin(angle) * j, back.y + (at.y - back.y) * k + Math.cos(angle) * j);
    }
    ctx.stroke();
    for (let i = 0; i < 2; i++) {
      const a = angle + Math.PI + (i === 0 ? 0.8 : -0.8) + Math.sin(t * 40 + i) * 0.3;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(at.x, at.y);
      ctx.lineTo(at.x + Math.cos(a) * s * 0.9, at.y + Math.sin(a) * s * 0.9);
      ctx.stroke();
    }
    glowDot(ctx, at.x, at.y, s * 1.8, look.glow, 0.9);
  });
  ctx.fillStyle = look.core;
  ctx.beginPath();
  ctx.ellipse(at.x, at.y, s * 0.7, s * 0.3, angle, 0, Math.PI * 2);
  ctx.fill();
}

// the Quantum Singularity's beam: a steady sine wave running from the core to the target,
// held at full height in the middle and pinned at both ends
function drawWave(ctx: CanvasRenderingContext2D, look: Look, from: Vec, at: Vec, t: number): void {
  const len = dist(from, at);
  if (len < 2) return;
  const nx = -(at.y - from.y) / len;
  const ny = (at.x - from.x) / len;
  const path = (): void => {
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const s = i / 40;
      const amp = Math.sin(Math.PI * s) * look.size * 1.3;
      const w = Math.sin(s * (len / 28) * Math.PI * 2 - t * 18) * amp;
      const x = from.x + (at.x - from.x) * s + nx * w;
      const y = from.y + (at.y - from.y) * s + ny * w;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  };
  lit(ctx, () => {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    path();
    ctx.strokeStyle = `rgba(${look.glow},0.5)`;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = look.core;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(125,211,252,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(at.x, at.y);
    ctx.stroke();
    glowDot(ctx, from.x, from.y, 14, look.glow, 0.9);
    glowDot(ctx, at.x, at.y, 16 + Math.sin(t * 30) * 3, look.glow, 0.95);
  });
}

// draws a world shot where it is in its flight (it works out its own height above the ground)
export function drawShot(ctx: CanvasRenderingContext2D, look: Look, p: Projectile, muzzle: number, t: number): void {
  const from = { x: p.start.x, y: p.start.y - muzzle * 0.85 };
  const at = { x: p.pos.x, y: p.pos.y - muzzle * 0.7 };
  const angle = Math.atan2(p.target.y - p.pos.y, p.target.x - p.pos.x);
  switch (look.style) {
    case "lob":
      return drawLob(ctx, look, p, muzzle, t);
    case "arrow":
      return drawArrow(ctx, look, at, angle, t);
    case "roots":
      return drawRoots(ctx, look, p, t);
    case "beam":
      return drawBeam(ctx, look, from, at, t);
    case "flame":
      return drawFlame(ctx, look, from, at, t);
    case "rapid":
      return drawRapid(ctx, look, at, angle);
    case "shard":
      return drawShard(ctx, look, at, angle, t);
    case "arcbolt":
      return drawArcBolt(ctx, look, at, angle, t);
    case "drone":
      return drawDrone(ctx, look, p, muzzle, t);
    case "wave":
      return drawWave(ctx, look, from, at, t);
  }
}

// the flash at a turret's muzzle as it fires, in the colour of its own shots (strength 0..1)
export function drawMuzzle(ctx: CanvasRenderingContext2D, biome: Biome, level: number, at: Vec, strength: number): void {
  const look = LOOKS[biome][Math.max(0, Math.min(2, level - 1))];
  // roots and drones leave from the ground or the dock, not a barrel
  if (!look || strength <= 0 || look.style === "roots" || look.style === "drone") return;
  lit(ctx, () => {
    glowDot(ctx, at.x, at.y, 26 * strength + 6, look.glow, 0.85 * strength);
    glowDot(ctx, at.x, at.y, 8 * strength + 2, "255,255,255", 0.9 * strength);
  });
}
