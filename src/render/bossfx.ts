import type { Biome, Enemy, Game, Projectile, Vec } from "@/types";
import { BRUTE_SLAM_RANGE } from "@/game/enemies";
import { glowDot, groundRing, lit, rnd, spikes, thrown, zap } from "@/render/paint";

// Special abilities and bosses, from the sheets' attack and special panels. When an enemy uses
// its ability (game: Enemy.cast) it plays for a second:
//   brute slam  owl's wing gust, Yeti's ice smash, Scorpion King's tail-sting sand shockwave,
//               octopus's tentacle-slam water shockwave, Siege Breaker's red energy slam
//   boss cast   Elderwood Colossus root slam with an emerald pulse, Ice Dragon wing slam
//               (crystals burst up round it), Mummy King curse cast and sand shockwave,
//               Damyaan tidal shockwave and whirlpool, Transformer Overlord energy pulse
// Overlords' ranged bolts get their own look per world (anaconda venom, Ice Golem ice shard,
// Sandman rock shards, eel electric bolt, Phase Wraith energy bolt), and an enraged boss
// burns with a pulsing aura in its world's colour.

const CAST_TIME = 1;

type Tone = { rgb: string; dark: string; spike: string };
const TONE: Record<Biome, Tone> = {
  grassland: { rgb: "74,222,128", dark: "101,67,33", spike: "rgba(101,67,33,A)" },
  snow: { rgb: "147,197,253", dark: "30,64,175", spike: "rgba(191,219,254,A)" },
  desert: { rgb: "234,179,8", dark: "120,80,40", spike: "rgba(180,130,70,A)" },
  water: { rgb: "34,211,238", dark: "8,51,68", spike: "rgba(103,232,249,A)" },
  cyber: { rgb: "239,68,68", dark: "69,10,10", spike: "rgba(248,113,113,A)" },
};

function spikeColor(biome: Biome, a: number): string {
  return TONE[biome].spike.replace("A", String(a));
}

// a brute's area slam, k: 0..1 through it
function drawSlam(ctx: CanvasRenderingContext2D, biome: Biome, at: Vec, k: number, seed: number): void {
  const fade = 1 - k;
  const r = BRUTE_SLAM_RANGE * Math.min(1, k * 1.6);
  const tone = TONE[biome];
  groundRing(ctx, at, r, tone.rgb, fade, 4);
  groundRing(ctx, at, r * 0.7, tone.rgb, fade * 0.5, 2);
  if (biome === "grassland") {
    // the owl's wing gust: feathers whirled outward
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      ctx.fillStyle = `rgba(251,146,60,${fade})`;
      ctx.beginPath();
      ctx.ellipse(at.x + Math.cos(a) * r, at.y + Math.sin(a) * r * 0.45 - 10, 5, 2, a + k * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (biome === "water") {
    ctx.strokeStyle = `rgba(207,250,254,${fade})`;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) {
      const a = rnd(seed, i) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(at.x + Math.cos(a) * r * 0.8, at.y + Math.sin(a) * r * 0.36 - k * 40 * rnd(seed, i + 3), 2 + rnd(seed, i + 6) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    spikes(ctx, at, r * 0.85, 10, 22 * Math.min(1, k * 4), spikeColor(biome, 0.9 * fade), seed);
    thrown(ctx, at, k, 10, 50, `rgba(${tone.dark},${fade})`, 3.5, seed + 1);
  }
  lit(ctx, () => glowDot(ctx, at.x, at.y - 10, 50, tone.rgb, 0.5 * fade));
}

// a boss's special, k: 0..1 through it
function drawBossCast(ctx: CanvasRenderingContext2D, biome: Biome, e: Enemy, k: number, t: number, seed: number): void {
  const fade = 1 - k;
  const at = e.pos;
  const r = 150 * Math.min(1, k * 1.4);
  switch (biome) {
    case "grassland":
      // root slam: roots erupt round it, then the emerald pulse rolls out from its chest
      spikes(ctx, at, 40 + r * 0.6, 12, 40 * Math.min(1, k * 3), spikeColor(biome, fade), seed);
      groundRing(ctx, at, r, "74,222,128", fade, 5);
      lit(ctx, () => glowDot(ctx, at.x, at.y - 60, 60 + k * 50, "74,222,128", 0.7 * fade));
      break;
    case "snow":
      // wing slam: a ring of ice crystals bursts up round the dragon
      spikes(ctx, at, r * 0.8, 14, 40 * Math.min(1, k * 3), spikeColor(biome, 0.9 * fade), seed);
      groundRing(ctx, at, r, "147,197,253", fade, 4);
      lit(ctx, () => glowDot(ctx, at.x, at.y - 20, 80, "147,197,253", 0.5 * fade));
      break;
    case "desert":
      // curse cast: a glowing curse orb over its head, then the sand shockwave
      lit(ctx, () => glowDot(ctx, at.x, at.y - 110, 30 + Math.sin(t * 12) * 4, "251,146,60", 0.9 * fade));
      groundRing(ctx, at, r, "234,179,8", fade, 5);
      thrown(ctx, at, k, 14, 90, `rgba(214,170,110,${fade})`, 4, seed);
      break;
    case "water": {
      // tidal shockwave and a whirlpool round Damyaan
      groundRing(ctx, at, r, "34,211,238", fade, 5);
      ctx.strokeStyle = `rgba(165,243,252,${0.8 * fade})`;
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        for (let j = 0; j <= 30; j++) {
          const u = j / 30;
          const a = t * 4 + i * 2.1 + u * 6;
          const rr = 20 + u * 90;
          if (j === 0) ctx.moveTo(at.x + Math.cos(a) * rr, at.y + Math.sin(a) * rr * 0.45);
          else ctx.lineTo(at.x + Math.cos(a) * rr, at.y + Math.sin(a) * rr * 0.45);
        }
        ctx.stroke();
      }
      break;
    }
    case "cyber":
      // energy pulse from the robot's red core
      lit(ctx, () => {
        glowDot(ctx, at.x, at.y - 90, 40 + k * 40, "239,68,68", 0.8 * fade);
        for (let i = 0; i < 6; i++) zap(ctx, { x: at.x, y: at.y - 90 }, { x: at.x + Math.cos(i) * r * 0.7, y: at.y + Math.sin(i) * r * 0.3 }, "252,165,165", fade, t + i, 12);
      });
      groundRing(ctx, at, r, "239,68,68", fade, 5);
      break;
  }
}

// an enraged boss: a pulsing aura and embers rising off it
function drawRage(ctx: CanvasRenderingContext2D, biome: Biome, e: Enemy, t: number): void {
  const rgb = biome === "grassland" ? "251,113,60" : TONE[biome].rgb;
  const pulse = 0.5 + 0.5 * Math.sin(t * 6);
  lit(ctx, () => {
    glowDot(ctx, e.pos.x, e.pos.y - 50, 70 + pulse * 15, rgb, 0.25 + pulse * 0.15);
    for (let i = 0; i < 8; i++) {
      const rise = (t * 0.8 + rnd(e.id, i)) % 1;
      glowDot(ctx, e.pos.x + (rnd(e.id, i + 9) - 0.5) * 60, e.pos.y - 10 - rise * 110, 4, rgb, 0.9 * (1 - rise));
    }
  });
}

export function drawEnemyCasts(ctx: CanvasRenderingContext2D, game: Game, t: number): void {
  const biome = game.level.biome;
  for (const e of game.enemies) {
    if (e.hp <= 0) continue;
    if (e.boss && e.enraged) drawRage(ctx, biome, e, t);
    const k = (game.time - e.cast) / CAST_TIME;
    if (k < 0 || k >= 1) continue;
    if (e.kind === "brute") drawSlam(ctx, biome, e.pos, k, e.id + Math.floor(e.cast));
    else if (e.kind === "titan") drawBossCast(ctx, biome, e, k, t, e.id + Math.floor(e.cast));
    else if (e.kind === "overlord" && k < 0.35) lit(ctx, () => glowDot(ctx, e.pos.x, e.pos.y - 30, 26, TONE[biome].rgb, 0.8 * (1 - k / 0.35)));
  }
}

// an enemy's ranged bolt at a turret, in its world's look
export function drawEnemyBolt(ctx: CanvasRenderingContext2D, biome: Biome, p: Projectile, t: number): void {
  const at = { x: p.pos.x, y: p.pos.y - 24 };
  const ang = Math.atan2(p.target.y - p.pos.y, p.target.x - p.pos.x);
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const rgb = biome === "cyber" ? "192,38,211" : TONE[biome].rgb;
  lit(ctx, () => {
    for (let i = 1; i <= 4; i++) glowDot(ctx, at.x - dx * i * 8, at.y - dy * i * 8, 10 - i * 1.5, rgb, 0.5 - i * 0.1);
    glowDot(ctx, at.x, at.y, 18, rgb, 0.8);
  });
  if (biome === "water") {
    lit(ctx, () => zap(ctx, { x: at.x - dx * 26, y: at.y - dy * 26 }, at, "186,230,253", 1, t, 5));
    return;
  }
  if (biome === "desert") {
    // a cluster of rock shards with a dust trail
    ctx.fillStyle = "#a16207";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(at.x - dx * i * 5 + (i - 1) * dy * 4, at.y - dy * i * 5 - (i - 1) * dx * 4, 4 - i * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  ctx.fillStyle = biome === "grassland" ? "#4ade80" : biome === "snow" ? "#e0f2fe" : "#f5d0fe";
  ctx.beginPath();
  if (biome === "snow") {
    ctx.moveTo(at.x + dx * 10, at.y + dy * 10);
    ctx.lineTo(at.x - dy * 4, at.y + dx * 4);
    ctx.lineTo(at.x - dx * 7, at.y - dy * 7);
    ctx.lineTo(at.x + dy * 4, at.y - dx * 4);
  } else ctx.ellipse(at.x, at.y, 9, 4, ang, 0, Math.PI * 2);
  ctx.fill();
}
