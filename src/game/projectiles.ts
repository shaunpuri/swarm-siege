import type { Game, Projectile, Vec } from "@/types";
import { damageEnemy, damageTower, splashDamage } from "@/game/combat";
import { dist, lerp } from "@/game/geometry";
import { emit, explosion, ring } from "@/game/effects";
import { enemyById, newId, towerById } from "@/game/state";
import { rand } from "@/game/rng";

const RICOCHET_RANGE = 125;

// returns true when the projectile is finished
function moveHoming(p: Projectile, goal: Vec, dt: number): boolean {
  const d = dist(p.pos, goal);
  const step = p.speed * dt;
  if (d <= step + 4) {
    p.pos = { ...goal };
    return true;
  }
  p.pos.x += ((goal.x - p.pos.x) / d) * step;
  p.pos.y += ((goal.y - p.pos.y) / d) * step;
  return false;
}

// no shot chases a target for longer than this (one dodging through portals would otherwise
// keep a shot, or a root, hanging over the map)
const MAX_CHASE = 2.5;

function updateDirect(game: Game, p: Projectile, dt: number): boolean {
  p.age += dt;
  if (p.age > MAX_CHASE) return true;
  const target = p.targetId === null ? undefined : enemyById(game, p.targetId);
  if (target && target.hp > 0) p.target = { ...target.pos };
  if (!moveHoming(p, p.target, dt)) return false;
  if (!target || target.hp <= 0) return true;

  damageEnemy(game, target, p.damage, p.family);
  if (p.kind === "frost") {
    target.slowTime = 1.6;
    target.slowFactor = 0.5;
    emit(game, "spark", target.pos, "#a5f3fc", 5, 70, 2, 0.3);
    return true;
  }
  emit(game, "spark", target.pos, p.color, 4, 90, 2, 0.25);
  if (p.kind !== "ricochet" || p.bounces <= 0) return true;

  // bounce to the nearest enemy that this shot has not hit yet
  p.hitIds.push(target.id);
  let next = null;
  let best = RICOCHET_RANGE;
  for (const e of game.enemies) {
    if (e.hp <= 0 || p.hitIds.includes(e.id)) continue;
    const d = dist(e.pos, target.pos);
    if (d < best) {
      best = d;
      next = e;
    }
  }
  if (!next) return true;
  p.bounces -= 1;
  p.damage *= p.falloff;
  p.targetId = next.id;
  p.target = { ...next.pos };
  ring(game, target.pos, p.color, 16, 0.2);
  return false;
}

function landShell(game: Game, p: Projectile): void {
  splashDamage(game, p.target, p.splash, p.damage, p.family);
  if (p.kind === "nuke") {
    explosion(game, p.target, "#fca5a5", p.splash);
    ring(game, p.target, "#fde68a", p.splash * 1.3, 0.7);
    game.shake = Math.max(game.shake, 12);
    return;
  }
  explosion(game, p.target, p.color, p.splash * 0.8);
  if (p.kind !== "cluster") return;
  for (let i = 0; i < 5; i++) {
    const a = rand(game) * Math.PI * 2;
    const r = 25 + rand(game) * 45;
    const to = { x: p.target.x + Math.cos(a) * r, y: p.target.y + Math.sin(a) * r };
    game.projectiles.push({
      ...p,
      id: newId(game),
      kind: "bomblet",
      start: { ...p.target },
      pos: { ...p.target },
      target: to,
      age: 0,
      flight: 0.3 + rand(game) * 0.15,
      damage: p.damage * 0.4,
      splash: 36,
      hitIds: [],
    });
  }
}

function updateLobbed(game: Game, p: Projectile, dt: number): boolean {
  p.age += dt;
  const t = Math.min(1, p.age / p.flight);
  p.pos = { x: lerp(p.start.x, p.target.x, t), y: lerp(p.start.y, p.target.y, t) };
  if (t < 1) return false;
  landShell(game, p);
  return true;
}

function updateBolt(game: Game, p: Projectile, dt: number): boolean {
  const tower = p.targetId === null ? undefined : towerById(game, p.targetId);
  if (tower) p.target = { x: tower.pos.x, y: tower.pos.y - 12 };
  if (!moveHoming(p, p.target, dt)) return false;
  if (tower) {
    damageTower(game, tower, p.damage);
    emit(game, "spark", p.target, "#e879f9", 8, 110, 2.5, 0.35);
  }
  return true;
}

export function updateProjectiles(game: Game, dt: number): void {
  const done = new Set<number>();
  // iterate a snapshot: cluster shells add bomblets while we loop
  for (const p of [...game.projectiles]) {
    let finished: boolean;
    if (p.kind === "bolt") finished = updateBolt(game, p, dt);
    else if (p.kind === "shell" || p.kind === "cluster" || p.kind === "nuke" || p.kind === "bomblet") finished = updateLobbed(game, p, dt);
    else finished = updateDirect(game, p, dt);
    if (finished) done.add(p.id);
  }
  game.projectiles = game.projectiles.filter((p) => !done.has(p.id));
}
