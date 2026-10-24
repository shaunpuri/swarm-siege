import type { Biome, Game, TowerKind } from "@/types";
import { versusLevel } from "@/config/versus";
import { createMatch } from "@/game/match";
import { TOWERS, nextUpgradeCost } from "@/config/towers";
import { STEP, startWave, step } from "@/game/loop";
import { createGame } from "@/game/state";
import { buildTower, repairCost, repairTower, specializeTower, upgradeTower } from "@/game/towers";
import { usePower } from "@/game/powers";
import { levelById } from "@/config/levels";
import type { MapMode } from "@/config/levels";
import { dist } from "@/game/geometry";
import { nextBaseLevel } from "@/config/bases";
import { upgradeBase } from "@/game/bases";
import { slashVineAt, vineTip } from "@/game/vines";

// A deliberately average player used to sanity-check balance headlessly:
// fills pads in order of road coverage, upgrades, specialises, repairs, and fires
// an Orbital Strike at bosses. If this bot cannot win a level, a human probably
// struggles too; if it wins with zero damage, the level is too easy.

const BUILD_ORDER: TowerKind[] = ["frost", "basic", "rapid", "heavy", "frost", "basic", "heavy", "rapid"];

// the empty pad that sees the most road within a typical turret range, or -1
function bestEmptyPad(game: Game): number {
  let best = -1;
  let bestScore = -1;
  game.pads.forEach((pad, i) => {
    if (pad.towerId !== null) return;
    let score = 0;
    for (const route of game.routes) {
      for (const pt of route.points) if (dist(pt, pad.pos) <= 200) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

// A button-masher: builds turrets on the best pads and nothing else (no repairs, upgrades,
// powers or vine cutting). The game should beat it on most levels, so winning takes skill.
function thinkLazy(game: Game, built: { n: number }): void {
  if (game.status === "ready") startWave(game);
  const pad = bestEmptyPad(game);
  const wanted = BUILD_ORDER.filter((k) => game.level.towers.includes(k));
  const kind = wanted[built.n % wanted.length] ?? "basic";
  if (pad >= 0 && game.coins >= TOWERS[kind].cost && buildTower(game, pad, kind)) built.n += 1;
}

// the enemy with the most others packed around it, and how many
function densest(game: Game): { at: Game["enemies"][number] | null; count: number } {
  let best: Game["enemies"][number] | null = null;
  let count = 0;
  for (const e of game.enemies) {
    const n = game.enemies.filter((o) => dist(o.pos, e.pos) <= 90).length;
    if (n > count) {
      count = n;
      best = e;
    }
  }
  return { at: best, count };
}

// a skilled player spends the power bar when a big push arrives: freeze and boost the
// turrets against a crowd, bomb a tight pack, and shield a base that is close to falling
function usePowersInRush(game: Game): void {
  // early waves are won by building; keep a reserve so repairs never go unpaid
  if (game.wave < 3 || game.coins < 220) return;
  const crowd = game.enemies.length;
  if (crowd >= 12) usePower(game, "cryo", null);
  if (crowd >= 10) usePower(game, "surge", null);
  if (crowd >= 14) usePower(game, "overclock", null);
  const pack = densest(game);
  if (pack.at && pack.count >= 6) usePower(game, "strike", pack.at.pos);
  if (game.bases.some((b) => b.hp > 0 && b.hp < b.maxHp * 0.5) && crowd > 0) usePower(game, "shield", null);
}

export function think(game: Game, built: { n: number }): void {
  if (game.status === "ready") startWave(game);

  // a turret with enemies locked onto it gets repaired sooner, since they will not leave
  for (const t of game.towers) {
    const besieged = game.enemies.some((e) => e.attacking === t.id);
    if (t.hp < t.maxHp * (besieged ? 0.75 : 0.6) && repairCost(t) <= game.coins) repairTower(game, t);
  }
  // when the swarm is chewing through several turrets at once, send in the repair drones
  if (game.towers.filter((t) => t.hp < t.maxHp * 0.5).length >= 2) usePower(game, "repair", null);

  const boss = game.enemies.find((e) => e.boss);
  if (boss) {
    usePower(game, "strike", boss.pos);
    // the boss fight is where every power goes: slow it and boost the turrets
    usePower(game, "cryo", null);
    usePower(game, "surge", null);
    usePower(game, "overclock", null);
  }
  usePowersInRush(game);
  if (game.vines.length > 0) usePower(game, "repair", null);
  // like a player clicking: cut the vine poisoning the base first
  const vine = game.vines.find((v) => v.target.kind === "base") ?? game.vines[0];
  if (vine) slashVineAt(game, vineTip(vine));

  const pad = bestEmptyPad(game);
  const wanted = BUILD_ORDER.filter((k) => game.level.towers.includes(k));
  const kind = wanted[built.n % wanted.length] ?? "basic";
  // with a core of four turrets up, upgrading beats spreading thin (fragile level 1 turrets
  // get torn down), so upgrades come first; before that, every coin goes to new turrets
  const core = game.towers.length >= 4;
  if (core && upgradeSomething(game)) return;
  if (pad >= 0 && game.coins >= TOWERS[kind].cost) {
    if (buildTower(game, pad, kind)) built.n += 1;
    return;
  }
  if (!core && pad >= 0) return;
  // upgrade a base once the turrets are in place and there is spare money
  for (const base of game.bases) {
    const next = nextBaseLevel(base.level);
    if (next && game.wave >= 3 && game.coins >= next.cost + 150 && upgradeBase(game, base)) return;
  }
  upgradeSomething(game);
}

// upgrade the lowest level turret that can be afforded, or specialise a maxed one
function upgradeSomething(game: Game): boolean {
  const upgradable = [...game.towers].sort((a, b) => a.level - b.level);
  for (const t of upgradable) {
    const cost = nextUpgradeCost(t);
    if (cost !== null && game.coins >= cost) return upgradeTower(game, t);
    if (t.level >= 3 && t.spec === null) {
      const specs = TOWERS[t.kind].specs;
      const spec = specs[t.id % Math.max(1, specs.length)];
      if (spec && specializeTower(game, t, spec)) return true;
    }
  }
  return false;
}

export type SimResult = { status: Game["status"]; wave: number; baseHp: number; maxBaseHp: number; seconds: number; towers: number; cleared: number };

// lazy: play like the button-masher instead of the average player
// versus: play that world's layout as an endless versus map (opts.mode must be a world)
export function simulate(levelId: number, opts: { build: boolean; maxSeconds?: number; mode?: MapMode; lazy?: boolean; versus?: Biome } = { build: true }): SimResult {
  const versus = opts.versus ? versusLevel(opts.versus, levelId) : null;
  const game = createGame(versus ?? levelById(levelId, opts.mode ?? "maps"));
  if (versus) game.match = createMatch();
  const built = { n: 0 };
  const maxSeconds = opts.maxSeconds ?? 1500;
  let thinkTimer = 0;
  while (game.time < maxSeconds && game.status !== "won" && game.status !== "lost") {
    thinkTimer -= STEP;
    if (thinkTimer <= 0) {
      thinkTimer = 0.5;
      if (opts.build && opts.lazy) thinkLazy(game, built);
      else if (opts.build) think(game, built);
      else if (game.status === "ready") startWave(game);
    }
    step(game, STEP);
    game.events.length = 0;
    game.sfx.length = 0;
  }
  return {
    status: game.status,
    wave: game.wave,
    baseHp: game.bases.reduce((s, b) => s + b.hp, 0),
    maxBaseHp: game.bases.reduce((s, b) => s + b.maxHp, 0),
    seconds: Math.round(game.time),
    towers: game.towers.length,
    cleared: game.match?.cleared ?? 0,
  };
}
