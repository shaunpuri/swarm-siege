import type { Enemy, Game, SpecKind, TargetMode, Tower, TowerKind, Vec } from "@/types";
import { SELL_REFUND, SPECS, TOWERS, nextUpgradeCost, towerStats } from "@/config/towers";
import { angleTo, dist, distToSegment, pointAt } from "@/game/geometry";
import { damageEnemy, targetable } from "@/game/combat";
import { emit, floatText, ring } from "@/game/effects";
import { newId } from "@/game/state";
import { rand } from "@/game/rng";
import { castStorm } from "@/game/storms";

const OVERCLOCK_MULT = 1.75;
const MODES: readonly TargetMode[] = ["first", "strong", "close"];

function canAct(game: Game): boolean {
  return game.status !== "won" && game.status !== "lost";
}

export function buildTower(game: Game, padIndex: number, kind: TowerKind): Tower | null {
  const pad = game.pads[padIndex];
  const def = TOWERS[kind];
  if (!canAct(game) || !pad || pad.towerId !== null) return null;
  if (!game.level.towers.includes(kind) || game.coins < def.cost) return null;
  const stats = towerStats({ kind, level: 1, spec: null });
  const tower: Tower = {
    id: newId(game),
    kind,
    level: 1,
    spec: null,
    padIndex,
    pos: { ...pad.pos },
    angle: -Math.PI / 2,
    cooldown: 0.2,
    hp: stats.hp,
    maxHp: stats.hp,
    mode: "first",
    boostShots: 0,
    spent: def.cost,
    flash: 0,
    recoil: 0,
    firing: 0,
    special: 0,
  };
  game.coins -= def.cost;
  pad.towerId = tower.id;
  game.towers.push(tower);
  ring(game, tower.pos, def.glow, 40);
  game.sfx.push("build");
  return tower;
}

function applyNewMaxHp(tower: Tower): void {
  const max = towerStats(tower).hp;
  tower.hp += max - tower.maxHp;
  tower.maxHp = max;
}

export function upgradeTower(game: Game, tower: Tower): boolean {
  const cost = nextUpgradeCost(tower);
  if (!canAct(game) || cost === null || game.coins < cost) return false;
  game.coins -= cost;
  tower.spent += cost;
  tower.level += 1;
  applyNewMaxHp(tower);
  ring(game, tower.pos, TOWERS[tower.kind].glow, 50);
  emit(game, "spark", tower.pos, "#fde68a", 16, 160, 3, 0.5);
  game.sfx.push("upgrade");
  return true;
}

export function specializeTower(game: Game, tower: Tower, spec: SpecKind): boolean {
  const def = SPECS[spec];
  if (!canAct(game) || tower.level < 3 || tower.spec !== null) return false;
  if (def.base !== tower.kind || game.coins < def.cost) return false;
  game.coins -= def.cost;
  tower.spent += def.cost;
  tower.spec = spec;
  applyNewMaxHp(tower);
  ring(game, tower.pos, def.color, 60);
  emit(game, "spark", tower.pos, def.color, 24, 200, 3, 0.6);
  floatText(game, tower.pos, def.name.toUpperCase(), def.color, 14);
  game.sfx.push("upgrade");
  return true;
}

export function sellValue(tower: Tower): number {
  return Math.floor(tower.spent * SELL_REFUND);
}

export function sellTower(game: Game, tower: Tower): void {
  if (!canAct(game)) return;
  game.coins += sellValue(tower);
  const pad = game.pads[tower.padIndex];
  if (pad) pad.towerId = null;
  game.towers = game.towers.filter((t) => t.id !== tower.id);
  emit(game, "smoke", tower.pos, "rgba(60,60,70,0.6)", 10, 60, 10, 0.8);
  game.sfx.push("sell");
}

export function repairCost(tower: Tower): number {
  const missing = (tower.maxHp - tower.hp) / tower.maxHp;
  if (missing <= 0) return 0;
  return Math.max(5, Math.ceil(missing * TOWERS[tower.kind].cost * 0.6));
}

export function repairTower(game: Game, tower: Tower): boolean {
  const cost = repairCost(tower);
  if (!canAct(game) || cost === 0 || game.coins < cost) return false;
  game.coins -= cost;
  tower.hp = tower.maxHp;
  emit(game, "spark", tower.pos, "#4ade80", 14, 90, 3, 0.6);
  floatText(game, tower.pos, "REPAIRED", "#4ade80", 13);
  game.sfx.push("build");
  return true;
}

export function cycleMode(tower: Tower): void {
  const i = MODES.indexOf(tower.mode);
  tower.mode = MODES[(i + 1) % MODES.length] ?? "first";
}

function remaining(game: Game, e: Enemy): number {
  const route = game.routes[e.routeIndex];
  return route ? route.length - e.dist : Infinity;
}

export function pickTarget(game: Game, tower: Tower, range: number): Enemy | null {
  let best: Enemy | null = null;
  let bestScore = Infinity;
  for (const e of game.enemies) {
    if (e.hp <= 0 || !targetable(e)) continue;
    const d = dist(tower.pos, e.pos);
    if (d > range + e.radius) continue;
    // lower score wins; enemies attacking a turret and bosses are dealt with first, like
    // defences turning on the troops that hit them
    const base = tower.mode === "strong" ? -e.hp : tower.mode === "close" ? d : remaining(game, e);
    const score = e.attacking !== null || e.boss ? base - 1e6 : base;
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

// where the enemy will be after `t` seconds, so slow shells land on moving targets
function leadPosition(game: Game, e: Enemy, t: number): Vec {
  const route = game.routes[e.routeIndex];
  if (!route) return { ...e.pos };
  const slow = e.slowTime > 0 ? e.slowFactor : 1;
  return pointAt(route, e.dist + e.speed * slow * t).pos;
}

function muzzle(tower: Tower, length: number): Vec {
  return { x: tower.pos.x + Math.cos(tower.angle) * length, y: tower.pos.y - 14 + Math.sin(tower.angle) * length };
}

function fire(game: Game, tower: Tower, target: Enemy, damage: number, range: number, splash: number): void {
  const spec = tower.spec;
  const color = towerStats(tower).color;
  const from = muzzle(tower, 22);
  const base = {
    id: 0,
    pos: { ...from },
    start: { ...from },
    target: { ...target.pos },
    targetId: target.id,
    damage,
    splash,
    bounces: 0,
    falloff: 0.85,
    design: tower.level - 1,
    family: tower.kind,
    hitIds: [],
    age: 0,
    flight: 0,
    color,
  };

  if (spec === "laser") {
    fireLaser(game, tower, target, damage, range, from, color);
    return;
  }
  if (spec === "flame") {
    fireFlame(game, tower, damage, range, from);
    return;
  }
  // the Worldroot Guardian lashes roots out fast at up to four enemies, each pulling back into
  // the tree after it strikes (the draw side shows the pull back)
  if (worldLevel3(game, tower) && game.level.biome === "grassland") {
    const root = { ...base, kind: "bullet" as const, speed: ROOT_SPEED };
    game.projectiles.push({ ...root, id: newId(game) });
    for (const e of extraTargets(game, tower, target, range, 3)) {
      game.projectiles.push({ ...root, id: newId(game), target: { ...e.pos }, targetId: e.id, damage: damage * ROOT_SHARE });
    }
    game.sfx.push("shoot");
    return;
  }
  const style = TOWERS[tower.kind].styles?.[tower.level - 1];
  if (tower.kind === "heavy" || style === "shell") {
    const speed = tower.kind === "frost" ? 360 : TOWERS.heavy.projectileSpeed;
    const flight = Math.max(0.35, dist(from, target.pos) / speed);
    const aim = leadPosition(game, target, flight);
    const kind = spec === "cluster" ? "cluster" : spec === "nuke" ? "nuke" : "shell";
    game.projectiles.push({ ...base, id: newId(game), kind, target: aim, targetId: null, speed, flight });
    game.sfx.push(spec === "nuke" ? "bigboom" : "boom");
    return;
  }
  if (style === "ricochet") {
    // Ice Cannon: chains to 3 enemies, 100% then 70% then 50%
    game.projectiles.push({ ...base, id: newId(game), kind: "ricochet", speed: TOWERS.frost.projectileSpeed, bounces: 2, falloff: 0.7 });
    game.sfx.push("shoot");
    return;
  }
  // the world level 3 sheets: the Ice Cannon and Abyssal Cannon shots ricochet to up to three
  // enemies (100%, 70%, 50%)
  const chain = worldLevel3(game, tower) && (game.level.biome === "snow" || game.level.biome === "water");
  const kind = spec === "ricochet" || chain ? "ricochet" : spec === "cryo" || tower.kind === "frost" ? "frost" : "bullet";
  const speed = TOWERS[tower.kind].projectileSpeed;
  game.projectiles.push({ ...base, id: newId(game), kind, speed, bounces: spec === "ricochet" ? 4 : chain ? 2 : 0, falloff: chain ? 0.7 : base.falloff });
  game.sfx.push(tower.kind === "rapid" || style === "bullet" ? "rapid" : "shoot");
}

// the extra roots each deal this share of the main shot's damage; roots reach their target in
// about a fifth of a second
const ROOT_SHARE = 0.35;
const ROOT_SPEED = 1100;

function worldLevel3(game: Game, tower: Tower): boolean {
  return game.level.mapArt === "world" && tower.level >= 3 && tower.spec === null;
}

// the nearest other enemies in range (for the Worldroot Guardian's extra roots)
function extraTargets(game: Game, tower: Tower, main: Enemy, range: number, count: number): Enemy[] {
  return game.enemies
    .filter((e) => e.id !== main.id && e.hp > 0 && targetable(e) && dist(tower.pos, e.pos) <= range + e.radius)
    .sort((a, b) => dist(tower.pos, a.pos) - dist(tower.pos, b.pos))
    .slice(0, count);
}

function fireLaser(game: Game, tower: Tower, target: Enemy, damage: number, range: number, from: Vec, color: string): void {
  const a = angleTo(tower.pos, target.pos);
  const to = { x: tower.pos.x + Math.cos(a) * range, y: tower.pos.y + Math.sin(a) * range };
  for (const e of game.enemies) {
    if (e.hp > 0 && distToSegment(e.pos, from, to) <= e.radius + 8) damageEnemy(game, e, damage, tower.kind);
  }
  game.beams.push({ from, to, life: 0.22, maxLife: 0.22, color, width: 7 });
  game.sfx.push("laser");
}

const FLAME_HALF_ANGLE = 0.45;

function fireFlame(game: Game, tower: Tower, damage: number, range: number, from: Vec): void {
  for (const e of game.enemies) {
    if (e.hp <= 0 || dist(tower.pos, e.pos) > range + e.radius) continue;
    let diff = Math.abs(angleTo(tower.pos, e.pos) - tower.angle);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff > FLAME_HALF_ANGLE) continue;
    damageEnemy(game, e, damage, tower.kind);
    e.burnTime = 2;
    e.burnDps = 9;
  }
  for (let i = 0; i < 7; i++) {
    const spread = (rand(game) - 0.5) * FLAME_HALF_ANGLE * 2;
    const speed = range * (2.2 + rand(game) * 1.4);
    game.particles.push({
      kind: "flame",
      pos: { ...from },
      vel: { x: Math.cos(tower.angle + spread) * speed, y: Math.sin(tower.angle + spread) * speed },
      life: 0.32,
      maxLife: 0.32,
      size: 7 + rand(game) * 6,
      color: "#fb923c",
    });
  }
  game.sfx.push("flame");
}

function turnToward(tower: Tower, target: number, dt: number): void {
  let diff = target - tower.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  tower.angle += diff * Math.min(1, dt * 14);
}

export function updateTowers(game: Game, dt: number): void {
  const rateMul = game.power.overclock > 0 ? OVERCLOCK_MULT : 1;
  for (const tower of game.towers) {
    tower.flash = Math.max(0, tower.flash - dt);
    tower.recoil = Math.max(0, tower.recoil - dt * 6);
    tower.firing = Math.max(0, tower.firing - dt);
    tower.cooldown -= dt * rateMul;
    const stats = towerStats(tower);
    const target = pickTarget(game, tower, stats.range);
    if (!target) continue;
    turnToward(tower, angleTo(tower.pos, target.pos), dt);
    if (tower.cooldown > 0) continue;
    tower.cooldown = 1 / stats.rate;
    let damage = stats.damage;
    if (tower.boostShots > 0) {
      tower.boostShots -= 1;
      damage *= 2;
    }
    tower.recoil = 1;
    tower.firing = 0.12;
    fire(game, tower, target, damage, stats.range, stats.splash);
    castStorm(game, tower, target.pos, damage);
  }
}
