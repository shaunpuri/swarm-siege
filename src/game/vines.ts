import type { Biome, Enemy, Game, Vec, Vine } from "@/types";
import { damageBase, damageTower } from "@/game/combat";
import { bezier, dist } from "@/game/geometry";
import { emit, floatText } from "@/game/effects";
import { newId, towerById } from "@/game/state";
import { rand } from "@/game/rng";

// Hive Titan ability: poison vines erupt from the boss and latch onto turrets and the
// base it is marching toward. Latched vines poison their target until the player cuts
// them by clicking (2 hits) or blasts them with an Orbital Strike.

const VINE_RANGE = 400;
const VINE_TOWERS = 3;
const TOWER_POISON_DPS = 7;
const BASE_POISON_EVERY = 5;
const SLASH_DAMAGE = 38;
const HIT_RADIUS = 18;
const BASE_ROOT_DISTANCE = 170;

export function vineControl(v: Vine): Vec {
  const mx = (v.origin.x + v.to.x) / 2;
  const my = (v.origin.y + v.to.y) / 2;
  const len = dist(v.origin, v.to);
  const nx = -(v.to.y - v.origin.y) / Math.max(1, len);
  const ny = (v.to.x - v.origin.x) / Math.max(1, len);
  const bend = len * 0.28 * v.sway;
  return { x: mx + nx * bend, y: my + ny * bend };
}

export function vineTip(v: Vine): Vec {
  return bezier(v.origin, vineControl(v), v.to, v.growth);
}

function targeted(game: Game, check: (v: Vine) => boolean): boolean {
  return game.vines.some(check);
}

// what the boss shouts as it casts, in its world's look (src/render/overlay.ts draws the vines)
const CALL: Record<Biome, [string, string]> = {
  grassland: ["VINES!", "#86efac"],
  snow: ["ICE CHAINS!", "#bae6fd"],
  desert: ["CURSED BANDAGES!", "#fde68a"],
  water: ["TIDAL TENDRILS!", "#67e8f9"],
  cyber: ["ENERGY CABLES!", "#fca5a5"],
};

export function castVines(game: Game, titan: Enemy): void {
  const hp = titan.enraged ? 95 : 70;
  const make = (to: Vec, target: Vine["target"], origin: Vec = titan.pos): void => {
    game.vines.push({
      id: newId(game),
      origin: { ...origin },
      to: { ...to },
      target,
      growth: 0,
      hp,
      maxHp: hp,
      life: 14,
      tick: BASE_POISON_EVERY,
      sway: rand(game) < 0.5 ? -1 : 1,
    });
  };

  const towers = game.towers
    .filter((t) => dist(t.pos, titan.pos) <= VINE_RANGE)
    .filter((t) => !targeted(game, (v) => v.target.kind === "tower" && v.target.id === t.id))
    .sort((a, b) => dist(a.pos, titan.pos) - dist(b.pos, titan.pos))
    .slice(0, titan.enraged ? VINE_TOWERS + 1 : VINE_TOWERS);
  for (const t of towers) make(t.pos, { kind: "tower", id: t.id });

  const route = game.routes[titan.routeIndex];
  const base = route ? game.bases[route.baseIndex] : undefined;
  if (route && base && base.hp > 0 && !targeted(game, (v) => v.target.kind === "base" && v.target.index === route.baseIndex)) {
    // the base vine bursts out of the ground near the base, like roots tunnelling ahead
    const d = Math.max(1, dist(titan.pos, base.pos));
    const reach = Math.min(d, BASE_ROOT_DISTANCE);
    const root = { x: base.pos.x + ((titan.pos.x - base.pos.x) / d) * reach, y: base.pos.y + ((titan.pos.y - base.pos.y) / d) * reach };
    make(base.pos, { kind: "base", index: route.baseIndex }, root);
    emit(game, "debris", root, "#78350f", 14, 120, 3, 0.6);
  }

  emit(game, "poison", titan.pos, "#4ade80", 24, 160, 6, 0.9);
  const [text, color] = game.level.mapArt === "world" ? CALL[game.level.biome] : CALL.grassland;
  floatText(game, titan.pos, text, color, 18);
  game.sfx.push("vine");
}

function targetAlive(game: Game, v: Vine): boolean {
  if (v.target.kind === "tower") return towerById(game, v.target.id) !== undefined;
  const base = game.bases[v.target.index];
  return base !== undefined && base.hp > 0;
}

export function updateVines(game: Game, dt: number): void {
  const titanAlive = game.enemies.some((e) => e.kind === "titan" && e.hp > 0);
  for (const v of game.vines) {
    v.life -= dt;
    if (!titanAlive) v.life = Math.min(v.life, 0.5);
    if (!targetAlive(game, v)) v.hp = 0;
    if (v.growth < 1) {
      v.growth = Math.min(1, v.growth + dt * 0.9);
      continue;
    }
    if (v.target.kind === "tower") {
      const tower = towerById(game, v.target.id);
      if (tower) damageTower(game, tower, TOWER_POISON_DPS * dt);
    } else {
      v.tick -= dt;
      if (v.tick <= 0) {
        v.tick = BASE_POISON_EVERY;
        damageBase(game, v.target.index, 1);
      }
    }
    if (rand(game) < dt * 6) emit(game, "poison", v.to, "#4ade80", 2, 40, 5, 0.8);
  }
  game.vines = game.vines.filter((v) => v.hp > 0 && v.life > 0);
}

function hurtVine(game: Game, v: Vine, amount: number, at: Vec): void {
  v.hp -= amount;
  emit(game, "debris", at, "#166534", 8, 120, 3, 0.4);
  if (v.hp <= 0) floatText(game, at, "CUT!", "#bbf7d0", 15);
}

// player click: returns true when a vine was hit
export function slashVineAt(game: Game, at: Vec): boolean {
  for (const v of game.vines) {
    const c = vineControl(v);
    for (let i = 0; i <= 16; i++) {
      const pt = bezier(v.origin, c, v.to, (i / 16) * v.growth);
      if (dist(pt, at) <= HIT_RADIUS) {
        hurtVine(game, v, SLASH_DAMAGE, pt);
        game.sfx.push("slash");
        return true;
      }
    }
  }
  return false;
}

export function blastVines(game: Game, at: Vec, radius: number): void {
  for (const v of game.vines) {
    const c = vineControl(v);
    for (let i = 0; i <= 12; i++) {
      const pt = bezier(v.origin, c, v.to, (i / 12) * v.growth);
      if (dist(pt, at) <= radius) {
        hurtVine(game, v, v.maxHp, pt);
        break;
      }
    }
  }
}
