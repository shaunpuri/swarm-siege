import type { Enemy, EnemyKind, Game, Vec } from "@/types";
import type { EnemySkin } from "@/three/skins";
import { enemySkinOf } from "@/three/skins";
import { strikeCycle } from "@/game/melee";
import { BASE_TARGET } from "@/game/enemies";
import { towerById } from "@/game/state";
import { glowDot, groundRing, lit, rnd, spikes, thrown, zap } from "@/render/paint";

// How each creature attacks a turret or the base, from the attack panels of its sheet. The
// 3D model lunges, bites or swipes (src/three/motion.ts); this draws what comes out of it,
// timed to its strike (wind up, release, impact):
//   Forest   spider bite with a venom splash; owl dives and rakes with its talons; anaconda
//            rears and lunges; Elderwood Colossus slams roots up out of the ground
//   Cold     Snowman fires an ice crystal from its claw; Yeti hurls an ice smash; Ice Golem
//            sends an ice shockwave of crystals; Ice Dragon breathes an ice beam
//   Desert   Chameleon spits a sand blob; Scorpion King stings the ground (sand shockwave);
//            Sandman punches the ground; Mummy King lashes a bandage whip
//   Aqua     shark lunges and bites (water splash); octopus slams its tentacles (water
//            shockwave); eel charges up and bursts with electricity; Damyaan thrusts his
//            trident's energy
//   Cyber    Stalker leaps with a blade slash; Siege Breaker charges and slams (red energy
//            arc); Phase Wraith charges its core and fires an energy bolt; the Overlord slams

type Attack = "bite" | "talons" | "lunge" | "rootslam" | "iceshot" | "icesmash" | "iceshock" | "breath" | "sandspit" | "sting" | "punch" | "whip" | "splash" | "tentacle" | "shock" | "trident" | "slash" | "ram" | "bolt" | "redslam";

const ATTACKS: Record<EnemySkin, Record<EnemyKind, Attack>> = {
  grassland: { scout: "bite", brute: "talons", overlord: "lunge", titan: "rootslam" },
  snow: { scout: "iceshot", brute: "icesmash", overlord: "iceshock", titan: "breath" },
  desert: { scout: "sandspit", brute: "sting", overlord: "punch", titan: "whip" },
  water: { scout: "splash", brute: "tentacle", overlord: "shock", titan: "trident" },
  cyber: { scout: "slash", brute: "ram", overlord: "bolt", titan: "redslam" },
};

// what a ranged attack fires: its colour, glow and look
type Shot = { core: string; glow: string; size: number; shape: "crystal" | "blob" | "bolt" | "trident" };
const SHOTS: Partial<Record<Attack, Shot>> = {
  iceshot: { core: "#e0f2fe", glow: "96,165,250", size: 7, shape: "crystal" },
  icesmash: { core: "#dbeafe", glow: "59,130,246", size: 10, shape: "crystal" },
  sandspit: { core: "#d6b07a", glow: "234,179,8", size: 6, shape: "blob" },
  bolt: { core: "#f5d0fe", glow: "192,38,211", size: 8, shape: "bolt" },
  trident: { core: "#cffafe", glow: "34,211,238", size: 12, shape: "trident" },
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// where the enemy is striking: the turret it attacks, or its base
function strikeTarget(game: Game, e: Enemy): Vec | null {
  if (e.attacking === BASE_TARGET) {
    const base = game.bases[game.routes[e.routeIndex]?.baseIndex ?? -1];
    return base ? { x: base.pos.x, y: base.pos.y - 24 } : null;
  }
  const tower = e.attacking === null ? undefined : towerById(game, e.attacking);
  return tower ? { x: tower.pos.x, y: tower.pos.y - 20 } : null;
}

// its mouth or hand: a little ahead of it and up; flyers and bosses are higher
function strikeSource(skin: EnemySkin, e: Enemy): Vec {
  const flyer = (skin === "grassland" && e.kind === "brute") || (skin === "snow" && e.kind === "titan");
  const lift = flyer ? 70 : e.boss ? 55 : 22;
  return { x: e.pos.x + Math.cos(e.angle) * e.radius, y: e.pos.y - lift };
}

function drawShot(ctx: CanvasRenderingContext2D, shot: Shot, from: Vec, to: Vec, f: number, t: number): void {
  const at = { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f - Math.sin(Math.PI * f) * 14 };
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const s = shot.size;
  lit(ctx, () => {
    for (let i = 1; i <= 4; i++) glowDot(ctx, at.x - dx * s * i * 0.9, at.y - dy * s * i * 0.9, s * (1.2 - i * 0.18), shot.glow, 0.45 - i * 0.08);
    glowDot(ctx, at.x, at.y, s * 2.2, shot.glow, 0.8);
  });
  ctx.fillStyle = shot.core;
  ctx.beginPath();
  if (shot.shape === "crystal") {
    ctx.moveTo(at.x + dx * s * 1.4, at.y + dy * s * 1.4);
    ctx.lineTo(at.x - dy * s * 0.5, at.y + dx * s * 0.5);
    ctx.lineTo(at.x - dx * s, at.y - dy * s);
    ctx.lineTo(at.x + dy * s * 0.5, at.y - dx * s * 0.5);
  } else if (shot.shape === "bolt") {
    ctx.ellipse(at.x, at.y, s * 1.5, s * 0.45, ang, 0, Math.PI * 2);
  } else if (shot.shape === "trident") {
    // the trident's three prongs of energy
    for (const side of [-1, 0, 1]) {
      ctx.moveTo(at.x + dx * s * 1.3 - dy * side * s * 0.5, at.y + dy * s * 1.3 + dx * side * s * 0.5);
      ctx.lineTo(at.x - dy * (side * 0.5 + 0.15) * s, at.y + dx * (side * 0.5 + 0.15) * s);
      ctx.lineTo(at.x - dy * (side * 0.5 - 0.15) * s, at.y + dx * (side * 0.5 - 0.15) * s);
    }
  } else {
    ctx.arc(at.x, at.y, s * (0.9 + Math.sin(t * 20) * 0.1), 0, Math.PI * 2);
  }
  ctx.fill();
}

// the burst where a strike lands (i: 0..1 through it)
function drawImpact(ctx: CanvasRenderingContext2D, attack: Attack, at: Vec, from: Vec, i: number, seed: number, t: number): void {
  const fade = 1 - i;
  const ground = { x: at.x, y: at.y + 20 };
  switch (attack) {
    case "iceshot":
    case "icesmash":
    case "iceshock":
    case "breath":
      spikes(ctx, ground, attack === "iceshock" ? 10 + i * 40 : 6 + i * 10, attack === "iceshock" ? 9 : 5, (attack === "icesmash" ? 30 : 20) * Math.min(1, i * 4), `rgba(191,219,254,${0.9 * fade})`, seed);
      lit(ctx, () => glowDot(ctx, at.x, at.y + 6, 30, "96,165,250", 0.7 * fade));
      if (attack === "iceshock") groundRing(ctx, ground, 10 + i * 50, "147,197,253", fade, 3);
      break;
    case "sandspit":
    case "sting":
    case "punch":
    case "whip":
      thrown(ctx, at, i, 9, 30, `rgba(214,170,110,${fade})`, 4, seed);
      if (attack !== "sandspit") {
        groundRing(ctx, ground, 10 + i * (attack === "punch" ? 60 : 45), "234,179,8", fade, 3);
        thrown(ctx, ground, i, 6, 40, `rgba(120,80,40,${fade})`, 3.5, seed + 3);
      }
      break;
    case "splash":
    case "tentacle":
    case "trident":
      spikes(ctx, ground, 6 + i * 12, 6, 22 * Math.min(1, i * 4), `rgba(103,232,249,${0.85 * fade})`, seed);
      thrown(ctx, at, i, 8, 26, `rgba(207,250,254,${fade})`, 2.5, seed + 5);
      if (attack !== "splash") groundRing(ctx, ground, 10 + i * 55, "34,211,238", fade, 3);
      lit(ctx, () => glowDot(ctx, at.x, at.y, 26, "34,211,238", 0.6 * fade));
      break;
    case "bite":
    case "lunge": {
      // the fangs snapping shut, and a splash of venom
      const close = Math.min(1, i * 3);
      ctx.strokeStyle = `rgba(255,255,255,${fade})`;
      ctx.lineWidth = attack === "lunge" ? 3.5 : 2.5;
      const r = attack === "lunge" ? 14 : 9;
      ctx.beginPath();
      ctx.arc(at.x, at.y - r * (1 - close), r, Math.PI * 0.15, Math.PI * 0.85);
      ctx.moveTo(at.x + r, at.y + r * (1 - close));
      ctx.arc(at.x, at.y + r * (1 - close), r, -Math.PI * 0.15, -Math.PI * 0.85, true);
      ctx.stroke();
      thrown(ctx, at, i, 7, 22, `rgba(74,222,128,${fade})`, 2.5, seed);
      break;
    }
    case "talons":
    case "slash": {
      // three raking claw marks, or the Stalker's blue blade arc
      const color = attack === "slash" ? "125,211,252" : "251,146,60";
      const ang = Math.atan2(at.y - from.y, at.x - from.x);
      lit(ctx, () => {
        ctx.lineCap = "round";
        for (let k = 0; k < (attack === "slash" ? 1 : 3); k++) {
          ctx.strokeStyle = `rgba(${color},${fade})`;
          ctx.lineWidth = attack === "slash" ? 5 : 2.5;
          ctx.beginPath();
          ctx.arc(at.x - Math.cos(ang) * 10 + k * 5, at.y - Math.sin(ang) * 10 + k * 4, 18, ang - 1.2 + i * 0.6, ang + 0.4 + i * 0.6);
          ctx.stroke();
        }
        glowDot(ctx, at.x, at.y, 16, color, 0.6 * fade);
      });
      thrown(ctx, at, i, 6, 20, `rgba(254,240,138,${fade})`, 1.8, seed);
      break;
    }
    case "shock":
      lit(ctx, () => {
        glowDot(ctx, from.x, from.y + 14, 40 + i * 30, "56,189,248", 0.7 * fade);
        for (let k = 0; k < 4; k++) zap(ctx, from, { x: at.x + (rnd(seed, k) - 0.5) * 30, y: at.y + (rnd(seed, k + 5) - 0.5) * 20 }, "186,230,253", fade, t + k, 10);
      });
      groundRing(ctx, { x: from.x, y: from.y + 22 }, 15 + i * 60, "125,211,252", fade, 3);
      break;
    case "ram":
    case "redslam": {
      const ang = Math.atan2(at.y - from.y, at.x - from.x);
      lit(ctx, () => {
        // the red energy arc sweeping down onto the target
        ctx.strokeStyle = `rgba(239,68,68,${fade})`;
        ctx.lineWidth = 7 * fade + 2;
        ctx.beginPath();
        ctx.arc(at.x, at.y, 22 + i * 14, ang - 1.4, ang + 1.4);
        ctx.stroke();
        glowDot(ctx, at.x, at.y, 30, "239,68,68", 0.7 * fade);
      });
      groundRing(ctx, ground, 10 + i * (attack === "redslam" ? 70 : 50), "248,113,113", fade, 3);
      thrown(ctx, ground, i, 8, 36, `rgba(71,85,105,${fade})`, 3.5, seed);
      break;
    }
    case "rootslam":
      spikes(ctx, ground, 8 + i * 30, 8, 30 * Math.min(1, i * 3), `rgba(101,67,33,${fade})`, seed);
      groundRing(ctx, ground, 12 + i * 55, "74,222,128", fade, 3);
      lit(ctx, () => glowDot(ctx, at.x, at.y + 10, 36, "74,222,128", 0.6 * fade));
      thrown(ctx, ground, i, 8, 34, `rgba(120,80,40,${fade})`, 3, seed + 2);
      break;
    case "bolt":
      lit(ctx, () => glowDot(ctx, at.x, at.y, 30, "192,38,211", 0.85 * fade));
      groundRing(ctx, ground, 8 + i * 30, "232,121,249", fade, 2.5);
      break;
  }
}

// before the blow: the charge glow at its hand, mouth, core or front
function drawWindup(ctx: CanvasRenderingContext2D, attack: Attack, from: Vec, w: number, t: number, seed: number): void {
  const color: Partial<Record<Attack, string>> = { iceshot: "96,165,250", icesmash: "59,130,246", breath: "147,197,253", bolt: "192,38,211", trident: "34,211,238", shock: "56,189,248", ram: "239,68,68", sandspit: "234,179,8", redslam: "239,68,68", rootslam: "74,222,128" };
  const c = color[attack];
  if (!c || w <= 0) return;
  lit(ctx, () => {
    glowDot(ctx, from.x, from.y, 8 + w * 16, c, 0.3 + w * 0.5);
    // the eel's charge: sparks crackling round its body
    if (attack === "shock") for (let k = 0; k < 3; k++) zap(ctx, { x: from.x + (rnd(seed, k) - 0.5) * 40, y: from.y + 10 }, { x: from.x + (rnd(seed, k + 3) - 0.5) * 40, y: from.y - 10 }, "186,230,253", w, t + k, 6);
  });
}

// the Ice Dragon's breath: an icy beam from its jaws to the target
function drawBreath(ctx: CanvasRenderingContext2D, from: Vec, to: Vec, b: number, t: number): void {
  lit(ctx, () => {
    ctx.lineCap = "round";
    ctx.strokeStyle = `rgba(147,197,253,${0.55 * b})`;
    ctx.lineWidth = 18 * b;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.strokeStyle = `rgba(240,249,255,${0.9 * b})`;
    ctx.lineWidth = 5 * b;
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const s = (t * 2.5 + i / 6) % 1;
      glowDot(ctx, from.x + (to.x - from.x) * s, from.y + (to.y - from.y) * s + Math.sin(t * 13 + i) * 5, 8, "224,242,254", 0.8 * b);
    }
  });
}

// the Mummy King's bandage whip, curling out to the target
function drawWhip(ctx: CanvasRenderingContext2D, from: Vec, to: Vec, reach: number, t: number): void {
  const n = 16;
  ctx.strokeStyle = "#e7d7b0";
  ctx.lineCap = "round";
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * reach;
    const curl = Math.sin(s * 7 - t * 12) * 14 * s * (1 - s);
    const x = from.x + (to.x - from.x) * s;
    const y = from.y + (to.y - from.y) * s - Math.sin(Math.PI * s) * 30 + curl;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// the Phase Wraith's phase dash: every few seconds a quick dash with a purple trail
function drawPhaseDash(ctx: CanvasRenderingContext2D, e: Enemy, t: number): void {
  const cycle = (t + e.id * 1.37) % 5;
  if (cycle > 0.45) return;
  const a = 1 - cycle / 0.45;
  const back = { x: e.pos.x - Math.cos(e.angle) * 70, y: e.pos.y - Math.sin(e.angle) * 70 - 30 };
  lit(ctx, () => {
    const g = ctx.createLinearGradient(back.x, back.y, e.pos.x, e.pos.y - 30);
    g.addColorStop(0, "rgba(192,38,211,0)");
    g.addColorStop(1, `rgba(232,121,249,${0.8 * a})`);
    ctx.strokeStyle = g;
    ctx.lineWidth = 16;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(back.x, back.y);
    ctx.lineTo(e.pos.x, e.pos.y - 30);
    ctx.stroke();
    for (let i = 1; i <= 3; i++) glowDot(ctx, e.pos.x - Math.cos(e.angle) * i * 20, e.pos.y - 30 - Math.sin(e.angle) * i * 20, 18, "192,38,211", 0.35 * a);
  });
}

function drawStrike(ctx: CanvasRenderingContext2D, game: Game, skin: EnemySkin, e: Enemy, t: number): void {
  const to = strikeTarget(game, e);
  if (!to) return;
  const attack = ATTACKS[skin][e.kind];
  const from = strikeSource(skin, e);
  const k = strikeCycle(e);
  const seed = e.id * 7 + Math.floor(e.attackTime / 0.8);
  drawWindup(ctx, attack, from, clamp01((k - 0.35) / 0.4), t, seed);
  const shot = SHOTS[attack];
  const f = (k - 0.62) / 0.24;
  if (shot && f > 0 && f < 1) drawShot(ctx, shot, from, to, f, t);
  if (attack === "breath" && k > 0.5) drawBreath(ctx, from, to, Math.sin(Math.PI * clamp01((k - 0.5) / 0.5)), t);
  if (attack === "whip" && k > 0.6 && k < 0.95) drawWhip(ctx, from, to, clamp01((k - 0.6) / 0.25), t);
  if (k >= 0.86) drawImpact(ctx, attack, to, from, (k - 0.86) / 0.14, seed, t);
}

export function drawEnemyAttacks(ctx: CanvasRenderingContext2D, game: Game, t: number): void {
  const skin = enemySkinOf(game.level.biome);
  for (const e of game.enemies) {
    if (e.hp <= 0) continue;
    if (e.attacking !== null) drawStrike(ctx, game, skin, e, t);
    else if (skin === "cyber" && e.kind === "overlord") drawPhaseDash(ctx, e, t);
  }
}
