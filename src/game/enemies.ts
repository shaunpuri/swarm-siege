import type { Enemy, Game, Spawn, Tower, Vec } from "@/types";
import type { CreatureEntrance } from "@/config/bosses";
import type { RiverSpot } from "@/config/riverspots";
import { RIVER_SPOTS } from "@/config/riverspots";
import { fromWorld } from "@/config/worlds";
import { BOSS_OVERLORD, ENEMIES } from "@/config/enemies";
import { DIFFICULTIES, enemyDamage } from "@/config/difficulty";
import { damageBase, damageEnemy, damageTower } from "@/game/combat";
import { dist, pointAt } from "@/game/geometry";
import { emit, floatText, ring } from "@/game/effects";
import { hpMultiplier, rewardMultiplier, speedMultiplier, versusHp } from "@/game/waves";
import { newId } from "@/game/state";
import { rand } from "@/game/rng";
import { castVines } from "@/game/vines";
import { BOSS_ENTRANCE, CREATURE_ENTRANCE_TIME, creatureEntrance, isFinalBoss, landsAnywhere, stageDist } from "@/config/bosses";
import { HIT_EVERY, updateMelee } from "@/game/melee";

export const BRUTE_SLAM_RANGE = 100;
const BRUTE_SLAM_DAMAGE = 10;
const OVERLORD_RANGE = 230;
const OVERLORD_BOLT = 12;
const CRYO_FIELD_MULT = 0.4;
export const DROP_TIME = 1;
export const BURROW_TIME = 0.8;
export const SWIM_TIME = 1.6;
// versus bosses (sent or every few waves) are lighter, and a leak costs part of the base
const VERSUS_BOSS_HP = 0.45;
const VERSUS_BOSS_BITE = 8;
// the Cyber Arena boss drives this far in car form, then stops and transforms
const MORPH_AT = 140;
export const MORPH_TIME = 2.5;

// the anaconda emerging, the harrier swooping in (src/config/bosses.ts), in world levels only
// the river spot a Grassland anaconda rises from on this route (src/config/riverspots.ts)
function riverSpot(game: Game, spawn: Spawn, way: CreatureEntrance | null): RiverSpot | null {
  if (way !== "emerge" || game.level.biome !== "grassland" || game.level.mapArt !== "world") return null;
  return RIVER_SPOTS[game.level.id]?.[spawn.route] ?? null;
}

// where an anaconda is during its entrance (k: 0..1): it rises in the river for the first
// part, then slides up the bank onto the road
export const IN_RIVER = 0.4;
function emergePosition(from: Vec, road: Vec, k: number): Vec {
  const slide = Math.max(0, (k - IN_RIVER) / (1 - IN_RIVER));
  const ease = slide * slide * (3 - 2 * slide);
  return { x: from.x + (road.x - from.x) * ease, y: from.y + (road.y - from.y) * ease };
}

function creatureIntro(game: Game, spawn: Spawn): number | null {
  if (game.level.mapArt !== "world") return null;
  const way = creatureEntrance(game.level.biome, spawn.kind, spawn.boss);
  return way ? CREATURE_ENTRANCE_TIME[way] : null;
}

export function spawnEnemy(game: Game, spawn: Spawn): Enemy {
  const def = ENEMIES[spawn.kind];
  const route = game.routes[spawn.route] ?? game.routes[0];
  // a final boss with an entrance starts out in the open, not in the corner tunnel
  const staged = spawn.boss && spawn.kind === "titan" && BOSS_ENTRANCE[game.level.biome] > 0;
  // fliers, droppers and things that fade in can show up anywhere on the first part of the road
  const way = game.level.mapArt === "world" ? creatureEntrance(game.level.biome, spawn.kind, spawn.boss) : null;
  const anywhere = way !== null && landsAnywhere(way) && route ? route.length * (0.03 + rand(game) * 0.12) : 0;
  const river = riverSpot(game, spawn, way);
  const startDist = staged && route ? stageDist(route) : river && route ? route.length * river.along : anywhere;
  const emergeFrom = river ? fromWorld(river.water) : null;
  const start = route ? pointAt(route, startDist) : { pos: { x: 0, y: 0 }, angle: 0, warp: 0 };
  // versus maps are random, so their strength follows one curve (level 1's) whatever the layout
  const tier = game.match ? 1 : game.level.id;
  const hpMul = (game.match ? versusHp(Math.max(0, game.wave - 1)) : hpMultiplier(tier, Math.max(0, game.wave - 1))) * game.level.hpScale;
  const bossOverlord = spawn.boss && spawn.kind === "overlord";
  // difficulty, and in versus the opponent's Empower boosts
  const versusBoss = spawn.boss && game.match ? VERSUS_BOSS_HP : 1;
  const hp = def.hp * hpMul * (bossOverlord ? BOSS_OVERLORD.hpMul : 1) * versusBoss * DIFFICULTIES[game.difficulty].enemyHp * (game.match?.hpMul ?? 1);
  const enemy: Enemy = {
    id: newId(game),
    kind: spawn.kind,
    boss: spawn.boss,
    routeIndex: route ? game.routes.indexOf(route) : 0,
    dist: startDist,
    pos: emergeFrom ?? start.pos,
    angle: emergeFrom ? Math.atan2(start.pos.y - emergeFrom.y, start.pos.x - emergeFrom.x) : start.angle,
    hp,
    maxHp: hp,
    speed: def.speed * (bossOverlord ? BOSS_OVERLORD.speedMul : 1) * speedMultiplier(Math.max(0, game.wave - 1)) * (game.match?.speedMul ?? 1) * (0.94 + rand(game) * 0.12),
    radius: def.radius * (bossOverlord ? BOSS_OVERLORD.radiusMul : 1),
    reward: Math.round((bossOverlord ? BOSS_OVERLORD.reward : def.reward) * rewardMultiplier(tier)),
    // a campaign boss that reaches the base ends the level; in versus it takes a big bite instead
    baseDamage: spawn.boss && game.match ? VERSUS_BOSS_BITE : bossOverlord ? BOSS_OVERLORD.baseDamage : def.baseDamage,
    // the adaptive swarm: this wave's enemies resist the tower family that hurt them most
    resist: game.adapt.resist,
    slowTime: 0,
    slowFactor: 1,
    burnTime: 0,
    burnDps: 0,
    abilityTimer: def.abilityEvery * (0.5 + rand(game) * 0.5),
    enraged: false,
    walk: rand(game) * 10,
    hitFlash: 0,
    // burrows: dig out of the ground; drop zones: fall from the sky
    // a world's final boss makes its own entrance (src/config/bosses.ts)
    intro: spawn.boss && spawn.kind === "titan" && BOSS_ENTRANCE[game.level.biome] > 0 ? BOSS_ENTRANCE[game.level.biome] : (creatureIntro(game, spawn) ?? (route?.entry === "drop" ? DROP_TIME : route?.entry === "burrow" ? BURROW_TIME : route?.entry === "swim" ? SWIM_TIME : 0)),
    warp: 0,
    openIntro: way !== null && !staged,
    attacking: null,
    // only the Cyber Arena boss transforms; everything else starts in its final form
    morph: spawn.kind === "titan" && game.level.biome === "cyber" ? 0 : 1,
    attackTime: 0,
    atBase: 0,
    cast: -10,
    emergeFrom,
  };
  game.enemies.push(enemy);
  if (spawn.boss) {
    game.events.push({ type: "boss", kind: spawn.kind });
    game.sfx.push("boss");
    game.shake = 10;
  }
  return enemy;
}

function towersNear(game: Game, enemy: Enemy, range: number): Tower[] {
  return game.towers
    .filter((t) => dist(t.pos, enemy.pos) <= range)
    .sort((a, b) => dist(a.pos, enemy.pos) - dist(b.pos, enemy.pos));
}

// returns false when there was nothing to hit, so the ability retries soon
function useAbility(game: Game, enemy: Enemy): boolean {
  if (enemy.kind === "brute") {
    const hits = towersNear(game, enemy, BRUTE_SLAM_RANGE);
    if (hits.length === 0) return false;
    for (const t of hits) damageTower(game, t, BRUTE_SLAM_DAMAGE * enemyDamage(game));
    ring(game, enemy.pos, "#fb923c", BRUTE_SLAM_RANGE, 0.4);
    emit(game, "debris", enemy.pos, "#a16207", 10, 140, 3, 0.4);
    game.sfx.push("boom");
    return true;
  }
  if (enemy.kind === "overlord") {
    const targets = towersNear(game, enemy, OVERLORD_RANGE * (enemy.boss ? 1.3 : 1)).slice(0, enemy.boss ? 3 : 1);
    if (targets.length === 0) return false;
    for (const t of targets) {
      const from = { x: enemy.pos.x, y: enemy.pos.y - enemy.radius * 0.6 };
      game.projectiles.push({
        id: newId(game),
        kind: "bolt",
        pos: { ...from },
        start: { ...from },
        target: { ...t.pos },
        targetId: t.id,
        speed: 330,
        damage: OVERLORD_BOLT * enemyDamage(game) * (enemy.boss ? 1.6 : 1),
        splash: 0,
        bounces: 0,
        falloff: 1,
        design: 0,
        family: null,
        hitIds: [],
        age: 0,
        flight: 0,
        color: "#e879f9",
      });
    }
    return true;
  }
  if (enemy.kind === "titan") {
    // the Cyber boss only fights once it has transformed into the robot
    if (enemy.morph < 1) return false;
    castVines(game, enemy);
    return true;
  }
  return true;
}

// a base attack: one strike (wind up, lunge, land), facing the base; the damage lands with it.
// The strike animation reads attacking / attackTime like a turret attack (BASE_TARGET).
export const BASE_TARGET = -1;
function strikeBase(game: Game, enemy: Enemy, baseIndex: number, dt: number): void {
  const base = game.bases[baseIndex];
  enemy.atBase += dt;
  enemy.attacking = BASE_TARGET;
  enemy.attackTime = enemy.atBase;
  if (base) enemy.angle = Math.atan2(base.pos.y - enemy.pos.y, base.pos.x - enemy.pos.x);
  if (enemy.atBase < HIT_EVERY * 0.9) return;
  damageBase(game, baseIndex, enemy.baseDamage);
  if (base) emit(game, "spark", base.pos, "#fbbf24", 10, 140, 3, 0.4);
  enemy.hp = 0;
  game.leaks += 1;
}

function abilityCooldown(enemy: Enemy): number {
  const every = ENEMIES[enemy.kind].abilityEvery;
  return enemy.enraged ? every * 0.6 : every;
}

function updateOne(game: Game, enemy: Enemy, dt: number): void {
  const route = game.routes[enemy.routeIndex];
  if (!route) return;
  enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
  enemy.slowTime = Math.max(0, enemy.slowTime - dt);

  if (enemy.burnTime > 0) {
    enemy.burnTime -= dt;
    damageEnemy(game, enemy, enemy.burnDps * dt, "rapid");
    if (rand(game) < dt * 12) emit(game, "flame", enemy.pos, "#fb923c", 1, 20, 6, 0.4);
    if (enemy.hp <= 0) return;
  }

  if (enemy.kind === "titan" && !enemy.enraged && enemy.hp < enemy.maxHp * 0.5) {
    enemy.enraged = true;
    floatText(game, enemy.pos, "TITAN ENRAGED", "#4ade80", 20);
    game.shake = 10;
    game.sfx.push("boss");
  }

  // entry animation (digging out of a burrow, landing on a drop zone): hold position
  if (enemy.intro > 0) {
    enemy.intro = Math.max(0, enemy.intro - dt);
    if (enemy.emergeFrom) {
      const road = pointAt(route, enemy.dist).pos;
      enemy.pos = emergePosition(enemy.emergeFrom, road, 1 - enemy.intro / CREATURE_ENTRANCE_TIME.emerge);
      enemy.angle = Math.atan2(road.y - enemy.emergeFrom.y, road.x - enemy.emergeFrom.x);
      if (enemy.intro === 0) enemy.pos = road;
    }
    const bossEntrance = isFinalBoss(enemy) && BOSS_ENTRANCE[game.level.biome] > 0;
    if (!bossEntrance && route.entry === "burrow" && rand(game) < dt * 25) emit(game, "debris", enemy.pos, "#78350f", 2, 90, 3, 0.5);
    if (bossEntrance && enemy.intro === 0) {
      ring(game, enemy.pos, "#fde68a", enemy.radius * 4, 0.6);
      game.shake = Math.max(game.shake, 14);
      game.sfx.push("boss");
    }
    if (!bossEntrance && enemy.intro === 0 && route.entry === "drop") {
      ring(game, enemy.pos, "#fde68a", enemy.radius * 2.2, 0.4);
      game.shake = Math.max(game.shake, enemy.boss ? 10 : 2);
    }
    return;
  }

  // Transformer Overlord: drives in as a car, stops and transforms into the robot
  // it transforms out in the open where it can be seen, not in a corner under the HUD
  if (enemy.morph < 1 && enemy.dist >= Math.max(MORPH_AT, stageDist(route))) {
    if (enemy.morph === 0) {
      floatText(game, enemy.pos, "TRANSFORMING", "#f87171", 18);
      game.shake = Math.max(game.shake, 6);
    }
    enemy.morph = Math.min(1, enemy.morph + dt / MORPH_TIME);
    if (rand(game) < dt * 20) emit(game, "spark", enemy.pos, "#ef4444", 2, 120, 3, 0.4);
    if (enemy.morph >= 1) {
      ring(game, enemy.pos, "#ef4444", enemy.radius * 3, 0.5);
      game.shake = Math.max(game.shake, 12);
      game.sfx.push("boss");
    }
    return;
  }

  // at the base: it stops and strikes once (the turrets can still shoot it meanwhile), then
  // deals its damage
  if (enemy.atBase > 0) {
    strikeBase(game, enemy, route.baseIndex, dt);
    return;
  }

  // stopped to claw at a turret beside the road; its special (slam, bolt) still fires
  if (updateMelee(game, enemy, dt)) {
    tickAbility(game, enemy, dt);
    return;
  }

  const slow = enemy.slowTime > 0 ? enemy.slowFactor : 1;
  const field = game.power.cryo > 0 ? CRYO_FIELD_MULT : 1;
  const rage = enemy.enraged ? 1.4 : 1;
  const speed = enemy.speed * slow * field * rage;
  enemy.dist += speed * dt;
  enemy.walk += speed * dt * 0.12;
  const at = pointAt(route, enemy.dist);
  if (at.warp > 0 && enemy.warp === 0) ring(game, enemy.pos, "#c084fc", 30, 0.35);
  enemy.pos = at.pos;
  enemy.angle = at.angle;
  enemy.warp = at.warp;

  if (enemy.dist >= route.length) {
    enemy.dist = route.length;
    strikeBase(game, enemy, route.baseIndex, dt);
    return;
  }

  tickAbility(game, enemy, dt);
}

function tickAbility(game: Game, enemy: Enemy, dt: number): void {
  if (ENEMIES[enemy.kind].abilityEvery <= 0) return;
  enemy.abilityTimer -= dt;
  if (enemy.abilityTimer > 0) return;
  const used = useAbility(game, enemy);
  enemy.abilityTimer = used ? abilityCooldown(enemy) : 0.5;
  if (used) enemy.cast = game.time;
}

export function updateEnemies(game: Game, dt: number): void {
  for (const enemy of game.enemies) {
    if (enemy.hp > 0) updateOne(game, enemy, dt);
  }
  game.enemies = game.enemies.filter((e) => e.hp > 0);
}
