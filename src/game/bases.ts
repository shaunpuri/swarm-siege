import type { Base, Biome, Enemy, Game } from "@/types";
import type { BaseWeapon } from "@/config/bases";
import { baseLevel, nextBaseLevel } from "@/config/bases";
import { damageEnemy, splashDamage, targetable } from "@/game/combat";
import { emit, explosion, floatText, ring } from "@/game/effects";
import { dist } from "@/game/geometry";
import { newId } from "@/game/state";

// Base upgrades and base defences. A level 1 base has no weapons; buying level 2 or 3 adds
// the weapons listed in src/config/bases.ts, raises max HP and (level 3) the Cryo Shield.

export function canUpgradeBase(game: Game, base: Base): boolean {
  const next = nextBaseLevel(base.level);
  return next !== null && base.hp > 0 && game.coins >= next.cost && game.status !== "won" && game.status !== "lost";
}

export function upgradeBase(game: Game, base: Base): boolean {
  const next = nextBaseLevel(base.level);
  if (!next || !canUpgradeBase(game, base)) return false;
  game.coins -= next.cost;
  base.level = next.level;
  const extra = Math.round(base.startHp * next.hpBonus) - Math.round(base.startHp * baseLevel(next.level - 1).hpBonus);
  base.maxHp += extra;
  base.hp += extra;
  base.cooldowns = next.weapons.map(() => 0.5);
  base.shield = next.shield;
  ring(game, base.pos, "#a5f3fc", 110, 0.8);
  emit(game, "spark", base.pos, "#a5f3fc", 40, 220, 3, 0.8);
  floatText(game, { x: base.pos.x, y: base.pos.y - 60 }, next.name.toUpperCase(), "#a5f3fc", 18);
  game.sfx.push("upgrade");
  return true;
}

function targetFor(game: Game, base: Base, range: number): Enemy | null {
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of game.enemies) {
    if (e.hp <= 0 || !targetable(e)) continue;
    const d = dist(e.pos, base.pos);
    if (d <= range + e.radius && d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function slow(e: Enemy, factor: number): void {
  if (factor >= 1) return;
  e.slowFactor = Math.min(e.slowTime > 0 ? e.slowFactor : 1, factor);
  e.slowTime = Math.max(e.slowTime, 1.5);
}

// each world's base fights in its own colours (its crystal's glow): Forest green, Cold World
// ice blue, Desert gold, Aqua cyan, Cyber neon; the original maps keep the frost look
type Tone = { bolt: string; blast: string; beam: string; spark: string };
const FROST: Tone = { bolt: "#a5f3fc", blast: "#a5f3fc", beam: "#67e8f9", spark: "#e0f2fe" };
const TONES: Record<Biome, Tone> = {
  grassland: { bolt: "#86efac", blast: "#4ade80", beam: "#4ade80", spark: "#bbf7d0" },
  snow: FROST,
  desert: { bolt: "#fde68a", blast: "#facc15", beam: "#fbbf24", spark: "#fef3c7" },
  water: { bolt: "#67e8f9", blast: "#22d3ee", beam: "#06b6d4", spark: "#cffafe" },
  cyber: { bolt: "#f0abfc", blast: "#e879f9", beam: "#c084fc", spark: "#f5d0fe" },
};

function toneOf(game: Game): Tone {
  return game.level.mapArt === "world" ? TONES[game.level.biome] : FROST;
}

function fire(game: Game, base: Base, w: BaseWeapon, target: Enemy): void {
  const from = { x: base.pos.x, y: base.pos.y - 55 };
  const tone = toneOf(game);
  if (w.kind === "arrow") {
    game.projectiles.push({ id: newId(game), kind: "frost", pos: { ...from }, start: { ...from }, target: { ...target.pos }, targetId: target.id, speed: 620, damage: w.damage, splash: 0, bounces: 0, falloff: 1, design: 0, family: null, hitIds: [], age: 0, flight: 0, color: tone.bolt });
    return;
  }
  if (w.kind === "mortar") {
    splashDamage(game, target.pos, w.splash, w.damage, null);
    for (const e of game.enemies) if (dist(e.pos, target.pos) <= w.splash + e.radius) slow(e, w.slow);
    explosion(game, target.pos, tone.blast, w.splash);
    game.sfx.push("boom");
    return;
  }
  if (w.kind === "beam") {
    damageEnemy(game, target, w.damage, null);
    slow(target, w.slow);
    game.beams.push({ from, to: { ...target.pos }, life: 0.45, maxLife: 0.45, color: tone.beam, width: 6 });
    return;
  }
  damageEnemy(game, target, w.damage, null);
  emit(game, "spark", target.pos, tone.spark, 5, 80, 2, 0.25);
}

export function updateBases(game: Game, dt: number): void {
  for (const base of game.bases) {
    if (base.hp <= 0) continue;
    const def = baseLevel(base.level);
    if (def.shield > 0 && base.shield < def.shield) {
      base.shieldTimer += dt;
      if (base.shieldTimer >= def.shieldRecharge) {
        base.shieldTimer = 0;
        base.shield = def.shield;
      }
    }
    def.weapons.forEach((w, i) => {
      const cd = (base.cooldowns[i] ?? 0) - dt;
      base.cooldowns[i] = cd;
      if (cd > 0) return;
      const target = targetFor(game, base, w.range);
      if (!target) return;
      base.cooldowns[i] = w.every;
      fire(game, base, w, target);
    });
  }
}
