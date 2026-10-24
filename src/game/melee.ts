import type { Enemy, EnemyKind, Game } from "@/types";
import { damageTower, targetable } from "@/game/combat";
import { enemyDamage } from "@/config/difficulty";
import { dist } from "@/game/geometry";
import { emit } from "@/game/effects";

// Enemies fight back up close: an enemy walking past a turret stops and attacks it, and keeps
// attacking until the turret is destroyed (or the enemy dies). A turret can only be attacked
// by a few enemies at once: one on the early levels, more later on (maxAttackers); the rest
// of the swarm walks past. Every enemy stops to fight except Titans, which never stop (their
// vines already poison turrets).

// pads sit just off the road, so this reaches the turrets beside it
const REACH = 65;
// each strike winds back, lunges, and lands 90% of the way through
export const HIT_EVERY = 0.8;
const LANDS_AT = 0.9;
const DPS: Record<EnemyKind, number> = { scout: 0.8, brute: 2.5, overlord: 1.7, titan: 0 };

// how many enemies may attack one turret at the same time: one on campaign levels 1 to 4, two
// on 5 to 8, three on 9 and 10; in versus one more every 8 waves, up to three
export function maxAttackers(game: Game): number {
  if (game.match) return Math.min(3, 1 + Math.floor(Math.max(0, game.wave - 1) / 8));
  if (game.level.id >= 9) return 3;
  if (game.level.id >= 5) return 2;
  return 1;
}

export function attackers(game: Game, towerId: number): number {
  return game.enemies.filter((e) => e.hp > 0 && e.attacking === towerId).length;
}

export function towerUnderAttack(game: Game, towerId: number): boolean {
  return attackers(game, towerId) > 0;
}

// how far through its current strike an attacking enemy is, 0..1 (the renderer animates it);
// attackTime counts up from the start of the attack
export function strikeCycle(enemy: Enemy): number {
  return (enemy.attackTime % HIT_EVERY) / HIT_EVERY;
}

function keepAttacking(game: Game, enemy: Enemy, dt: number): boolean {
  const tower = game.towers.find((t) => t.id === enemy.attacking);
  // the turret is gone (destroyed or sold): walk on
  if (!tower || !targetable(enemy)) {
    enemy.attacking = null;
    return false;
  }
  const before = strikeCycle(enemy);
  enemy.attackTime += dt;
  // face the turret while attacking it
  enemy.angle = Math.atan2(tower.pos.y - enemy.pos.y, tower.pos.x - enemy.pos.x);
  const after = strikeCycle(enemy);
  if (after < before || (before < LANDS_AT && after >= LANDS_AT)) {
    damageTower(game, tower, DPS[enemy.kind] * HIT_EVERY * enemyDamage(game));
    emit(game, "spark", tower.pos, "#fbbf24", 8, 120, 3, 0.35);
    emit(game, "debris", tower.pos, "#94a3b8", 3, 80, 2, 0.4);
  }
  return true;
}

// true while the enemy is busy attacking a turret (it holds its place on the road)
export function updateMelee(game: Game, enemy: Enemy, dt: number): boolean {
  if (enemy.attacking !== null) return keepAttacking(game, enemy, dt);
  if (DPS[enemy.kind] === 0 || !targetable(enemy)) return false;
  const limit = maxAttackers(game);
  for (const tower of game.towers) {
    if (dist(enemy.pos, tower.pos) > REACH || attackers(game, tower.id) >= limit) continue;
    enemy.attacking = tower.id;
    enemy.attackTime = 0;
    return true;
  }
  return false;
}
