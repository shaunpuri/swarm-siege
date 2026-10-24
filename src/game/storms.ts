import type { Biome, Enemy, Game, Storm, StormKind, Tower, TowerKind, Vec } from "@/types";
import { damageEnemy, targetable } from "@/game/combat";
import { dist } from "@/game/geometry";
import { newId } from "@/game/state";

// The level 3 world turrets' special abilities, from their sheets (fixed 10 second cooldown):
//   Cactus Sand Mortar  SANDSTORM: the turret glows and a sand vortex builds around it, then a
//                       sandstorm rolls over the target area, damaging enemies one by one and
//                       thinning out until it is gone
//   Abyssal Cannon      OCEAN STORM: a swirling water storm in the target area; enemies inside
//                       are damaged one by one and slowed by its currents
//   Ice Cannon          SNOWSTORM: a dense, tall storm at the target area that damages enemies
//                       one by one, thinner after each hit, ending in drifting snow
// The Forest and Cyber Arena level 3 turrets have no storm (the Worldroot Guardian's roots hit
// up to four enemies, the Quantum Singularity holds a beam).

export const STORM_COOLDOWN = 10;
// the vortex gathers at the turret before the storm hits
export const STORM_GATHER = 0.8;
const STORM_TIME = 3.6;
const STORM_RADIUS = 95;
const HIT_EVERY = 0.3;
const MAX_HITS = 7;
// each hit is a little weaker than the last (the storm thinning)
const THIN = 0.12;
// a hit is this many times the turret's shot damage
const POWER = 1.6;

const STORMS: Partial<Record<Biome, StormKind>> = { desert: "sandstorm", water: "ocean", snow: "snowstorm" };

export function stormKindFor(game: Game, tower: Tower): StormKind | null {
  if (game.level.mapArt !== "world" || tower.level < 3 || tower.spec !== null) return null;
  return STORMS[game.level.biome] ?? null;
}

// called when a level 3 world turret fires: casts its storm on the target if it is ready
export function castStorm(game: Game, tower: Tower, target: Vec, damage: number): void {
  const kind = stormKindFor(game, tower);
  if (!kind || tower.special > 0) return;
  tower.special = STORM_COOLDOWN;
  const storm: Storm = {
    id: newId(game),
    kind,
    from: { ...tower.pos },
    pos: { ...target },
    radius: STORM_RADIUS,
    age: 0,
    life: STORM_GATHER + STORM_TIME,
    hits: 0,
    maxHits: MAX_HITS,
    tick: 0,
    damage: damage * POWER,
    family: tower.kind,
  };
  game.storms.push(storm);
  game.sfx.push("power");
}

function inside(storm: Storm, e: Enemy): boolean {
  return e.hp > 0 && targetable(e) && dist(e.pos, storm.pos) <= storm.radius + e.radius;
}

// the next enemy to hit: the one nearest the storm's eye
function nextVictim(game: Game, storm: Storm): Enemy | null {
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of game.enemies) {
    if (!inside(storm, e)) continue;
    const d = dist(e.pos, storm.pos);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function hit(game: Game, storm: Storm, family: TowerKind): void {
  const victim = nextVictim(game, storm);
  if (!victim) return;
  damageEnemy(game, victim, storm.damage * Math.max(0.3, 1 - THIN * storm.hits), family);
  storm.hits += 1;
}

export function updateStorms(game: Game, dt: number): void {
  for (const t of game.towers) t.special = Math.max(0, t.special - dt);
  for (const storm of game.storms) {
    storm.age += dt;
    if (storm.age < STORM_GATHER) continue;
    // the Ocean Storm's currents slow everything inside it
    if (storm.kind === "ocean") {
      for (const e of game.enemies) {
        if (!inside(storm, e) || e.boss) continue;
        e.slowFactor = Math.min(e.slowTime > 0 ? e.slowFactor : 1, 0.55);
        e.slowTime = Math.max(e.slowTime, 0.25);
      }
    }
    storm.tick -= dt;
    if (storm.tick <= 0 && storm.hits < storm.maxHits) {
      storm.tick = HIT_EVERY;
      hit(game, storm, storm.family);
    }
  }
  // once its hits are spent it keeps drifting (thin) until its time is up
  game.storms = game.storms.filter((s) => s.age < s.life);
}
