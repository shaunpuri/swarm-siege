import type { Enemy, Game, Tower, TowerKind, Vec } from "@/types";
import { ENEMIES, RESIST_MULT } from "@/config/enemies";
import { TOWERS } from "@/config/towers";
import { dist } from "@/game/geometry";
import { emit, explosion, floatText, ring } from "@/game/effects";
import { rand } from "@/game/rng";

// enemies still digging out, landing or inside a portal cannot be hit; a creature's own
// arrival animation can
export function targetable(enemy: Enemy): boolean {
  return (enemy.intro <= 0 || enemy.openIntro) && enemy.warp < 0.3;
}

// family is the tower type that dealt the damage; the adaptive swarm tracks it
export function damageEnemy(game: Game, enemy: Enemy, amount: number, family: TowerKind | null): void {
  if (enemy.hp <= 0 || !targetable(enemy)) return;
  const resisted = family !== null && enemy.resist === family;
  const dealt = Math.min(enemy.hp, amount * (resisted ? RESIST_MULT : 1));
  enemy.hp -= dealt;
  enemy.hitFlash = 0.08;
  if (family !== null) game.adapt.damage[family] += dealt;
  if (resisted && !enemy.boss && rand(game) < 0.06) floatText(game, enemy.pos, "RESIST", "#cbd5e1", 11);
  if (enemy.hp <= 0) killEnemy(game, enemy);
}

function killEnemy(game: Game, enemy: Enemy): void {
  game.coins += enemy.reward;
  game.kills += 1;
  const def = ENEMIES[enemy.kind];
  floatText(game, enemy.pos, `+${enemy.reward}`, "#fde047", enemy.boss ? 22 : 13);
  // a boss bursts in light, not smoke: a dark cloud that size would hide its fall (the pillar
  // and shockwaves drawn in src/render/deathfx.ts)
  if (enemy.boss) {
    ring(game, enemy.pos, "#fde68a", enemy.radius * 4, 0.9);
    emit(game, "spark", enemy.pos, "#fde68a", 40, enemy.radius * 9, 4, 0.9);
    emit(game, "spark", enemy.pos, def.color, 24, enemy.radius * 6, 3, 0.7);
  } else explosion(game, enemy.pos, def.color, enemy.radius * 1.6);
  emit(game, "debris", enemy.pos, "#7f1d1d", 6, 120, 3, 0.5);
  game.deaths.push({ pos: { ...enemy.pos }, size: enemy.radius * (enemy.boss ? 5 : 3.2), life: 0, boss: enemy.boss });
  if (enemy.boss) {
    game.shake = 18;
    game.events.push({ type: "bossDown", kind: enemy.kind, reward: enemy.reward });
  }
  game.sfx.push(enemy.boss ? "bossDown" : "kill");
}

export function splashDamage(game: Game, at: Vec, radius: number, amount: number, family: TowerKind | null): void {
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0) continue;
    const d = dist(enemy.pos, at);
    if (d <= radius + enemy.radius) {
      // full damage in the core, falling to 50% at the edge
      const falloff = 1 - 0.5 * Math.min(1, d / Math.max(1, radius));
      damageEnemy(game, enemy, amount * falloff, family);
    }
  }
}

export function damageTower(game: Game, tower: Tower, amount: number): void {
  if (tower.hp <= 0) return;
  tower.hp -= amount;
  tower.flash = 0.12;
  if (tower.hp <= 0) destroyTower(game, tower);
}

function destroyTower(game: Game, tower: Tower): void {
  tower.hp = 0;
  const pad = game.pads[tower.padIndex];
  if (pad) pad.towerId = null;
  game.towers = game.towers.filter((t) => t.id !== tower.id);
  explosion(game, tower.pos, TOWERS[tower.kind].glow, 46);
  floatText(game, tower.pos, "TURRET DESTROYED", "#f87171", 14);
  game.shake = Math.max(game.shake, 8);
  game.events.push({ type: "towerLost", kind: tower.kind });
  game.sfx.push("towerDown");
}

export function damageBase(game: Game, index: number, amount: number): void {
  const base = game.bases[index];
  if (!base || base.hp <= 0) return;
  if (game.power.shield > 0) {
    floatText(game, base.pos, "BLOCKED", "#93c5fd", 13);
    return;
  }
  // the level 3 Cryo Shield soaks damage first, then recharges (src/game/bases.ts)
  if (base.shield > 0) {
    const soaked = Math.min(base.shield, amount);
    base.shield -= soaked;
    amount -= soaked;
    floatText(game, base.pos, "CRYO SHIELD", "#a5f3fc", 13);
    if (amount <= 0) return;
  }
  base.hp = Math.max(0, base.hp - amount);
  base.flash = 0.4;
  game.shake = Math.max(game.shake, 6);
  floatText(game, base.pos, `-${amount} HP`, "#f87171", 16);
  game.sfx.push("hurt");
  if (base.hp <= 0) {
    explosion(game, base.pos, "#60a5fa", 90);
    game.events.push({ type: "baseLost", index });
  }
}
