import type { Biome, Game, Vec } from "@/types";
import type { Impact, Look } from "@/render/shots";
import { drawRootSpan, shotLook } from "@/render/shots";

// The burst each world shot makes where it lands, from the turret sheets' impact frames: a mud
// splash, leaves and dirt flying, ice crystals bursting up, a golden starburst, a puff of fire,
// a sand cloud, a water splash, electric sparks, a purple energy blast with its shockwave.
// Purely visual and kept out of the game state (the simulation stays as it is): the renderer
// notices a shot is gone and plays its burst where it was last seen. Kept per game, so the two
// boards of a versus match each have their own.

type Seen = { pos: Vec; start: Vec; look: Look; ground: boolean };
type Burst = { pos: Vec; impact: Impact; born: number; seed: number };
// a Worldroot Guardian root pulling back into its tree after it struck
type Retract = { from: Vec; to: Vec; look: Look; born: number; seed: number };
type Tracker = { seen: Map<number, Seen>; bursts: Burst[]; retracts: Retract[] };

const LIFE = 0.55;
const RETRACT_TIME = 0.32;
const trackers = new WeakMap<Game, Tracker>();

function trackerOf(game: Game): Tracker {
  const found = trackers.get(game);
  if (found) return found;
  const made: Tracker = { seen: new Map(), bursts: [], retracts: [] };
  trackers.set(game, made);
  return made;
}

// a steady pseudo random number 0..1 for a burst's particle i
function rnd(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function glowDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// blobs or flecks thrown out and up from the hit, falling back
function thrown(ctx: CanvasRenderingContext2D, b: Burst, k: number, n: number, reach: number, color: string, size: number): void {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = rnd(b.seed, i) * Math.PI * 2;
    const r = reach * (0.5 + rnd(b.seed, i + 20) * 0.5) * k;
    const up = Math.sin(Math.PI * Math.min(1, k * 1.2)) * reach * 0.6 * rnd(b.seed, i + 40);
    ctx.beginPath();
    ctx.arc(b.pos.x + Math.cos(a) * r, b.pos.y + Math.sin(a) * r * 0.5 - up, size * (1 - k * 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
}

// crystals bursting up out of the ground (ice, or the water splash)
function crystals(ctx: CanvasRenderingContext2D, b: Burst, k: number, rgb: string): void {
  const grow = Math.min(1, k * 4);
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (rnd(b.seed, i) - 0.5) * 2.2;
    const h = (14 + rnd(b.seed, i + 9) * 16) * grow;
    const x = b.pos.x + (i - 2.5) * 4;
    ctx.fillStyle = `rgba(${rgb},${0.85 * (1 - k)})`;
    ctx.beginPath();
    ctx.moveTo(x - 3, b.pos.y);
    ctx.lineTo(x + Math.cos(a) * h, b.pos.y + Math.sin(a) * h);
    ctx.lineTo(x + 3, b.pos.y);
    ctx.fill();
  }
}

function sparks(ctx: CanvasRenderingContext2D, b: Burst, k: number, n: number, reach: number, rgb: string): void {
  ctx.strokeStyle = `rgba(${rgb},${1 - k})`;
  ctx.lineWidth = 1.6;
  for (let i = 0; i < n; i++) {
    const a = rnd(b.seed, i) * Math.PI * 2;
    const r0 = reach * k * 0.4;
    const r1 = reach * (0.4 + k * 0.6);
    ctx.beginPath();
    ctx.moveTo(b.pos.x + Math.cos(a) * r0, b.pos.y + Math.sin(a) * r0 * 0.7);
    ctx.lineTo(b.pos.x + Math.cos(a + 0.2) * (r0 + r1) * 0.5, b.pos.y + Math.sin(a + 0.2) * (r0 + r1) * 0.35);
    ctx.lineTo(b.pos.x + Math.cos(a) * r1, b.pos.y + Math.sin(a) * r1 * 0.7);
    ctx.stroke();
  }
}

function drawBurst(ctx: CanvasRenderingContext2D, b: Burst, k: number): void {
  const fade = 1 - k;
  ctx.save();
  switch (b.impact) {
    case "mud":
      ctx.fillStyle = `rgba(92,58,28,${0.55 * fade})`;
      ctx.beginPath();
      ctx.ellipse(b.pos.x, b.pos.y, 12 + k * 30, 6 + k * 13, 0, 0, Math.PI * 2);
      ctx.fill();
      thrown(ctx, b, k, 12, 40, `rgba(124,74,30,${fade})`, 5);
      break;
    case "leaf":
      thrown(ctx, b, k, 6, 22, `rgba(120,80,40,${fade})`, 2.5);
      for (let i = 0; i < 6; i++) {
        const a = rnd(b.seed, i + 3) * Math.PI * 2;
        const r = 26 * k;
        ctx.fillStyle = `rgba(74,222,128,${fade})`;
        ctx.beginPath();
        ctx.ellipse(b.pos.x + Math.cos(a) * r, b.pos.y - 8 + Math.sin(a) * r * 0.6 - Math.sin(Math.PI * k) * 12, 4, 2, a + k * 9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "lighter";
      glowDot(ctx, b.pos.x, b.pos.y - 6, 22 * (0.5 + k), "74,222,128", 0.6 * fade);
      break;
    case "ice":
    case "water": {
      const rgb = b.impact === "ice" ? "191,219,254" : "103,232,249";
      crystals(ctx, b, k, rgb);
      thrown(ctx, b, k, 8, 26, `rgba(${rgb},${fade})`, 2.5);
      ctx.globalCompositeOperation = "lighter";
      glowDot(ctx, b.pos.x, b.pos.y - 8, 30 * (0.6 + k * 0.6), b.impact === "ice" ? "96,165,250" : "34,211,238", 0.7 * fade);
      break;
    }
    case "gold":
      ctx.globalCompositeOperation = "lighter";
      glowDot(ctx, b.pos.x, b.pos.y - 8, 26, "250,204,21", 0.8 * fade);
      sparks(ctx, b, k, 8, 30, "253,230,138");
      thrown(ctx, b, k, 6, 18, `rgba(253,224,171,${fade})`, 2);
      break;
    case "fire":
      ctx.globalCompositeOperation = "lighter";
      glowDot(ctx, b.pos.x, b.pos.y - 10, 18 + k * 16, "249,115,22", 0.75 * fade);
      glowDot(ctx, b.pos.x, b.pos.y - 10, 8 + k * 6, "255,240,200", 0.8 * fade);
      thrown(ctx, b, k, 5, 22, `rgba(254,215,170,${fade})`, 2);
      break;
    case "sand":
      for (let i = 0; i < 5; i++) {
        const a = rnd(b.seed, i) * Math.PI * 2;
        ctx.fillStyle = `rgba(214,170,110,${0.45 * fade})`;
        ctx.beginPath();
        ctx.arc(b.pos.x + Math.cos(a) * 14 * k, b.pos.y - 6 + Math.sin(a) * 6 * k - k * 10, 8 + k * 16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "lighter";
      glowDot(ctx, b.pos.x, b.pos.y - 8, 26, "234,179,8", 0.7 * fade);
      sparks(ctx, b, k, 6, 26, "254,240,138");
      break;
    case "spark":
      ctx.globalCompositeOperation = "lighter";
      glowDot(ctx, b.pos.x, b.pos.y - 6, 20, "56,189,248", 0.8 * fade);
      sparks(ctx, b, k, 7, 24, "186,230,253");
      break;
    case "purple":
      ctx.globalCompositeOperation = "lighter";
      glowDot(ctx, b.pos.x, b.pos.y - 8, 20 + k * 18, "192,38,211", 0.85 * fade);
      ctx.strokeStyle = `rgba(232,121,249,${fade})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(b.pos.x, b.pos.y, 8 + k * 34, 4 + k * 16, 0, 0, Math.PI * 2);
      ctx.stroke();
      sparks(ctx, b, k, 8, 30, "245,208,254");
      break;
  }
  ctx.restore();
}

// call once a frame after the shots are drawn: plays a burst for every world shot that landed
// since the last frame, and draws the bursts still playing
export function drawImpacts(ctx: CanvasRenderingContext2D, game: Game, biome: Biome, muzzle: number): void {
  const tracker = trackerOf(game);
  const t = game.time;
  const live = new Set<number>();
  for (const p of game.projectiles) {
    const look = shotLook(p, biome);
    if (!look) continue;
    live.add(p.id);
    tracker.seen.set(p.id, { pos: { ...p.pos }, start: { ...p.start }, look, ground: look.style === "lob" || look.style === "roots" || look.style === "drone" });
  }
  for (const [id, s] of tracker.seen) {
    if (live.has(id)) continue;
    tracker.seen.delete(id);
    tracker.bursts.push({ pos: s.ground ? s.pos : { x: s.pos.x, y: s.pos.y - muzzle * 0.35 }, impact: s.look.impact, born: t, seed: id });
    if (s.look.style === "roots") tracker.retracts.push({ from: { x: s.start.x, y: s.start.y + 6 }, to: { x: s.pos.x, y: s.pos.y - 6 }, look: s.look, born: t, seed: id });
  }
  // the root slides back along itself into the tree, quickly at first
  tracker.retracts = tracker.retracts.filter((r) => t - r.born < RETRACT_TIME && t >= r.born);
  for (const r of tracker.retracts) {
    const reach = (1 - (t - r.born) / RETRACT_TIME) ** 2;
    drawRootSpan(ctx, r.look, r.from, { x: r.from.x + (r.to.x - r.from.x) * reach, y: r.from.y + (r.to.y - r.from.y) * reach }, r.seed, t);
  }
  tracker.bursts = tracker.bursts.filter((b) => t - b.born < LIFE && t >= b.born);
  for (const b of tracker.bursts) drawBurst(ctx, b, (t - b.born) / LIFE);
}
