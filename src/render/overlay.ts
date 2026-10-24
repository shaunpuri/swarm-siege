import type { Biome, Game, Projectile, TowerKind, Vec } from "@/types";
import type { View } from "@/render/canvas";
import type { Art } from "@/three/art";
import type { Actors } from "@/three/actors";
import type { Selection } from "@/render/selection";
import { H, W, bar, hpColor } from "@/render/canvas";
import { RANGE_SCALE, TOWERS, towerStats } from "@/config/towers";
import { STRIKE } from "@/game/powers";
import { towerById } from "@/game/state";
import { spriteHeight } from "@/three/actors";
import { CREATURE_ENTRANCE_TIME, creatureEntrance, entranceProgress } from "@/config/bosses";
import { drawBossIntro } from "@/render/bossintro";
import { drawArrival, drawWake } from "@/render/arrivals";
import { drawMuzzle, drawShot, shotLook } from "@/render/shots";
import { drawImpacts } from "@/render/impacts";
import { drawStorm } from "@/render/storms";
import { drawEnemyAttacks } from "@/render/enemyfx";
import { drawEnemyBolt, drawEnemyCasts } from "@/render/bossfx";
import { drawDeathBurst } from "@/render/deathfx";
import { drawBaseBolt } from "@/render/basefx";
import { drawTurretCharges } from "@/render/turretfx";
import type { VineLook } from "@/render/fx";
import { hasPyramid, pyramidSpot } from "@/three/bossprops";
import { lift } from "@/three/stage";
import { drawBeam, drawParticle, drawStrike, drawText, drawVine } from "@/render/fx";
import { drawAmbient } from "@/render/ambient";
import type { Ambient } from "@/render/ambient";

// 2D layer over the WebGL scene, in logical coordinates (which match the screen exactly):
// health bars, range circles, selection rings, armour rings, projectiles (the glow sprites
// cut from the tower sheets), beams, explosions, vines and floating text.

export type OverlayInput = {
  hover: Vec | null;
  hoverPad: number;
  selection: Selection;
  aimingStrike: boolean;
  previewKind: TowerKind | null;
};

const MUZZLE = lift(34);

// each world boss's vines (src/render/fx.ts): forest vines, ice chains, bandages, water
// tendrils, red energy cables
const VINES: Partial<Record<Biome, VineLook>> = {
  snow: { dark: "#0c4a6e", mid: "#38bdf8", light: "#e0f2fe", thorn: "#bae6fd" },
  desert: { dark: "#57391b", mid: "#c8b48a", light: "#f5ead0", thorn: "#a68b5b" },
  water: { dark: "#083344", mid: "#06b6d4", light: "#a5f3fc", thorn: "#67e8f9" },
  cyber: { dark: "#450a0a", mid: "#dc2626", light: "#fca5a5", thorn: "#f87171" },
};
const ARC: Record<string, number> = { shell: 70, cluster: 75, nuke: 110, bomblet: 28 };

function ring(ctx: CanvasRenderingContext2D, p: Vec, rx: number, ry: number, color: string, width: number, dash: number[] = []): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function rangeCircle(ctx: CanvasRenderingContext2D, p: Vec, r: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color + "1f";
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ring(ctx, p, r, r, color + "dd", 2, [8, 6]);
}

function selectionLayer(ctx: CanvasRenderingContext2D, game: Game, input: OverlayInput, t: number): void {
  game.pads.forEach((pad, i) => {
    const selected = input.selection?.kind === "pad" && input.selection.index === i;
    if (pad.towerId !== null || (!selected && input.hoverPad !== i)) return;
    ring(ctx, pad.pos, 72, 44, selected ? "#fde047" : `rgba(186,230,253,${0.7 + 0.3 * Math.sin(t * 6)})`, 3);
  });
  const sel = input.selection;
  if (sel?.kind === "tower") {
    const tower = towerById(game, sel.id);
    if (tower) rangeCircle(ctx, tower.pos, towerStats(tower).range, towerStats(tower).color);
  }
  if (sel?.kind === "pad" && input.previewKind !== null) {
    const pad = game.pads[sel.index];
    const def = TOWERS[input.previewKind];
    if (pad) rangeCircle(ctx, pad.pos, def.range[0] * RANGE_SCALE, def.color);
  }
}

function glowImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, size: number, angle = 0): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}

// world: each turret's shots match its design (src/render/shots.ts); the legacy modes keep
// the original projectile sprites
function projectile(ctx: CanvasRenderingContext2D, p: Projectile, art: Art, world: Biome | null, t: number): void {
  const family = p.family ?? "heavy";
  const set = art.towers[family];
  if (world && p.kind === "bolt" && p.family === null) {
    drawEnemyBolt(ctx, world, p, t);
    return;
  }
  // a base's archer bolt: a glowing dart of energy from its crystal, in its world's colour
  if (world && p.family === null) {
    drawBaseBolt(ctx, p, MUZZLE);
    return;
  }
  const look = world ? shotLook(p, world) : null;
  if (look) {
    drawShot(ctx, look, p, MUZZLE, t);
    return;
  }
  const arc = ARC[p.kind];
  if (arc !== undefined) {
    const k = Math.min(1, p.age / Math.max(0.01, p.flight));
    const h = Math.sin(Math.PI * k) * arc + MUZZLE * (1 - k);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(p.pos.x, p.pos.y, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    glowImage(ctx, set.proj.img, p.pos.x, p.pos.y - h, p.kind === "nuke" ? 46 : p.kind === "bomblet" ? 16 : 30);
    return;
  }
  if (p.kind === "bolt") {
    glowImage(ctx, art.towers.heavy.hit.img, p.pos.x, p.pos.y - MUZZLE * 0.6, 26);
    return;
  }
  const angle = Math.atan2(p.target.y - p.pos.y, p.target.x - p.pos.x);
  const size = p.kind === "ricochet" ? 30 : p.kind === "frost" ? 20 : family === "rapid" ? 18 : 24;
  glowImage(ctx, set.proj.img, p.pos.x, p.pos.y - MUZZLE * 0.7, size, angle);
}

function healthLayer(ctx: CanvasRenderingContext2D, game: Game, actors: Actors, t: number): void {
  for (const tower of game.towers) {
    const top = tower.pos.y - spriteHeight(actors, "tower", tower.id) * 0.86;
    if (tower.boostShots > 0) ring(ctx, tower.pos, 34, 28, "rgba(250,204,21,0.9)", 2.5);
    if (tower.hp < tower.maxHp) bar(ctx, tower.pos.x - 18, top - 6, 36, 4, tower.hp / tower.maxHp, hpColor(tower.hp / tower.maxHp));
    for (let i = 0; i < tower.level; i++) {
      ctx.fillStyle = tower.spec !== null ? towerStats(tower).color : "#fde047";
      ctx.fillRect(tower.pos.x - 10 + i * 8, tower.pos.y + 18, 5, 3);
    }
  }
  for (const e of game.enemies) {
    if (e.boss || e.hp >= e.maxHp) continue;
    const w = Math.max(24, e.radius * 2);
    bar(ctx, e.pos.x - w / 2, e.pos.y - spriteHeight(actors, "enemy", e.id) * 0.9 - 6 - (game.level.biome === "water" ? 35 : 0), w, 4, e.hp / e.maxHp, hpColor(e.hp / e.maxHp));
  }
  // bases are painted on each map; a name and live health bar float above each one, and the
  // hit flash and shield bubble wrap the painted crystal
  for (const base of game.bases) {
    const frac = base.hp / base.maxHp;
    const top = Math.max(60, base.pos.y - 112);
    bar(ctx, base.pos.x - 36, top, 72, 7, frac, hpColor(frac));
    ctx.font = "bold 12px Rajdhani, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(2,6,23,0.9)";
    const label = `${base.kind.toUpperCase()} LV${base.level}  ${Math.ceil(base.hp)}/${base.maxHp}`;
    ctx.strokeText(label, base.pos.x, top - 5);
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(label, base.pos.x, top - 5);
    const core = { x: base.pos.x, y: base.pos.y - 30 };
    if (base.flash > 0) {
      ctx.fillStyle = `rgba(248,113,113,${base.flash})`;
      ctx.beginPath();
      ctx.ellipse(core.x, core.y, 62, 50, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (game.power.shield > 0 || base.shield > 0) {
      ctx.save();
      ctx.globalAlpha = game.power.shield > 0 ? 1 : 0.55 + 0.15 * Math.sin(t * 3);
      ctx.fillStyle = "rgba(96,165,250,0.14)";
      ctx.strokeStyle = "rgba(147,197,253,0.9)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(core.x, core.y, 76, 68, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}

export function drawOverlay(view: View, game: Game, art: Art, actors: Actors, ambient: Ambient | null, input: OverlayInput): void {
  const { ctx, ratio } = view;
  const t = game.time;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (ambient) drawAmbient(ctx, ambient);
  selectionLayer(ctx, game, input, t);
  healthLayer(ctx, game, actors, t);
  if (game.level.biome === "snow") drawIceBursts(ctx, game, art);
  const world = game.level.mapArt === "world" ? game.level.biome : null;
  const vine = world ? VINES[world] : undefined;
  for (const v of game.vines) drawVine(ctx, v, t, vine);
  for (const s of game.storms) drawStorm(ctx, s, t);
  if (world) {
    for (const d of game.deaths) drawDeathBurst(ctx, world, d);
    drawEnemyCasts(ctx, game, t);
    drawTurretCharges(ctx, game, MUZZLE, t);
  }
  for (const p of game.projectiles) projectile(ctx, p, art, world, t);
  if (world) {
    drawImpacts(ctx, game, world, MUZZLE);
    drawEnemyAttacks(ctx, game, t);
  }
  if (world) {
    for (const tw of game.towers) {
      if (tw.firing > 0.05) drawMuzzle(ctx, world, tw.level, { x: tw.pos.x + Math.cos(tw.angle) * 16, y: tw.pos.y - MUZZLE * 0.85 + Math.sin(tw.angle) * 8 }, Math.min(1, tw.firing / 0.12));
    }
  }
  ctx.save();
  ctx.translate(0, -MUZZLE * 0.7);
  for (const b of game.beams) drawBeam(ctx, b);
  ctx.restore();
  for (const s of game.strikes) drawStrike(ctx, s, STRIKE.radius, t);
  ctx.save();
  ctx.translate(0, -12);
  ctx.globalCompositeOperation = "lighter";
  for (const p of game.particles) if (p.kind !== "smoke" && p.kind !== "debris") drawParticle(ctx, p);
  ctx.globalCompositeOperation = "source-over";
  for (const p of game.particles) if (p.kind === "smoke" || p.kind === "debris") drawParticle(ctx, p);
  ctx.restore();
  ctx.save();
  ctx.translate(0, -20);
  for (const ft of game.texts) drawText(ctx, ft);
  ctx.restore();
  // a final boss making its entrance
  for (const e of game.enemies) {
    const k = entranceProgress(e, game.level.biome);
    // in the Desert the burst comes from the pyramid beside the road
    if (k !== null) drawBossIntro(ctx, game.level.biome, game.level.biome === "desert" && hasPyramid(game) ? pyramidSpot(game) : e.pos, k, t);
    else if (e.intro > 0 && game.level.mapArt === "world") {
      const way = creatureEntrance(game.level.biome, e.kind, e.boss);
      if (way) drawArrival(ctx, way, game.level.biome, e.emergeFrom ?? e.pos, 1 - e.intro / CREATURE_ENTRANCE_TIME[way], t);
      // the anaconda's wake and drips as it slides out of the river up the bank
      if (way && e.emergeFrom) drawWake(ctx, e.emergeFrom, e.pos, t);
    }
  }
  if (game.power.cryo > 0) {
    ctx.fillStyle = `rgba(103,232,249,${0.08 + 0.04 * Math.sin(t * 3)})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (input.aimingStrike && input.hover) {
    rangeCircle(ctx, input.hover, STRIKE.radius, "#f87171");
  }
}

// Cold World deaths play the 4-frame ice explosion from the enemy sheets
function drawIceBursts(ctx: CanvasRenderingContext2D, game: Game, art: Art): void {
  for (const d of game.deaths) {
    const frame = art.iceBurst[Math.min(art.iceBurst.length - 1, Math.floor(d.life * art.iceBurst.length))];
    if (!frame) continue;
    ctx.save();
    ctx.globalAlpha = 1 - Math.max(0, d.life - 0.7) / 0.3;
    ctx.globalCompositeOperation = "lighter";
    const s = d.size * (0.8 + d.life * 0.5);
    ctx.drawImage(frame.img, d.pos.x - s / 2, d.pos.y - s * 0.75, s, s);
    ctx.restore();
  }
}
