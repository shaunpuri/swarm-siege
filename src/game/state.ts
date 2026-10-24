import type { Difficulty, Game, LevelDef } from "@/types";
import { DIFFICULTIES } from "@/config/difficulty";
import { BASE_HP } from "@/config/levels";
import { buildRoute, smoothLegs } from "@/game/geometry";
import { placePads } from "@/game/pads";

export function createGame(level: LevelDef, seed = level.id * 7919, difficulty: Difficulty = "medium"): Game {
  const legs = level.routes.map((r, i) => smoothLegs(r, level.jumps[i] ?? []));
  const paths = legs.map((l) => l.points);
  return {
    level,
    routes: legs.map((l, i) => buildRoute(l.points, level.routeBase[i] ?? 0, l.jumps, level.entries[i] ?? "tunnel")),
    bases: level.bases.map((b) => ({ kind: b.kind, pos: b.pos, hp: BASE_HP[b.kind], maxHp: BASE_HP[b.kind], startHp: BASE_HP[b.kind], flash: 0, level: 1, cooldowns: [], shield: 0, shieldTimer: 0 })),
    pads: placePads(level, paths).map((pos) => ({ pos, towerId: null })),
    towers: [],
    enemies: [],
    projectiles: [],
    vines: [],
    storms: [],
    beams: [],
    strikes: [],
    particles: [],
    texts: [],
    deaths: [],
    coins: Math.round(level.startCoins * DIFFICULTIES[difficulty].coins),
    wave: 0,
    plan: null,
    spawnIndex: 0,
    waveTime: 0,
    countdown: 0,
    status: "ready",
    time: 0,
    seed,
    nextId: 1,
    shake: 0,
    power: { overclock: 0, cryo: 0, shield: 0 },
    cooldowns: { overclock: 0, surge: 0, strike: 0, cryo: 0, repair: 0, shield: 0 },
    adapt: { damage: { basic: 0, rapid: 0, heavy: 0, frost: 0 }, resist: null },
    events: [],
    sfx: [],
    kills: 0,
    leaks: 0,
    difficulty,
    match: null,
    earlyCalls: 0,
    peakTowers: 0,
  };
}

export function newId(game: Game): number {
  const id = game.nextId;
  game.nextId += 1;
  return id;
}

export function towerById(game: Game, id: number) {
  return game.towers.find((t) => t.id === id);
}

export function enemyById(game: Game, id: number) {
  return game.enemies.find((e) => e.id === id);
}
