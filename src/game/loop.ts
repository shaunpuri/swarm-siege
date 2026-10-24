import type { Game } from "@/types";
import { evolve } from "@/game/adapt";
import { floatText, updateEffects } from "@/game/effects";
import { spawnEnemy, updateEnemies } from "@/game/enemies";
import { updatePowers } from "@/game/powers";
import { updateProjectiles } from "@/game/projectiles";
import { updateTowers } from "@/game/towers";
import { updateVines } from "@/game/vines";
import { updateStorms } from "@/game/storms";
import { updateBases } from "@/game/bases";
import { HP_PER_WAVE, planWave, speedMultiplier } from "@/game/waves";
import { planEndless, updateMatch } from "@/game/match";

export const BETWEEN_WAVES = 14;
// Kingdom Rush style: calling a wave early pays coins for every second skipped
export const EARLY_BONUS_PER_SEC = 3;
export const STEP = 1 / 60;

export function earlyBonus(game: Game): number {
  return game.status === "between" ? Math.ceil(game.countdown * EARLY_BONUS_PER_SEC) : 0;
}

export function startWave(game: Game): boolean {
  if (game.status !== "ready" && game.status !== "between") return false;
  const bonus = earlyBonus(game);
  if (bonus > 0) {
    game.coins += bonus;
    game.earlyCalls += 1;
    const entry = game.routes[0]?.points[0];
    if (entry) floatText(game, { x: entry.x + 60, y: entry.y }, `EARLY +${bonus}`, "#fde047", 16);
  }
  game.wave += 1;
  // versus waves never end; the campaign plays the level's set waves
  game.plan = game.match ? planEndless(game.level, game.wave - 1) : planWave(game.level, game.wave - 1);
  game.spawnIndex = 0;
  game.waveTime = 0;
  game.status = "wave";
  game.events.push({ type: "waveStart", wave: game.wave });
  // from wave 2 on, show how much the swarm has grown since wave 1
  const grown = game.wave - 1;
  const entry = game.routes[0]?.points[0];
  if (grown > 0 && entry) {
    const hp = Math.round(grown * HP_PER_WAVE * 100);
    const speed = Math.round((speedMultiplier(grown) - 1) * 100);
    // centred under the wave banner, clear of the side panels
    floatText(game, { x: 640, y: 150 }, `SWARM GROWS: +${hp}% HP  +${speed}% SPEED`, "#f87171", 18);
  }
  game.sfx.push("wave");
  return true;
}

function spawnDue(game: Game): void {
  const plan = game.plan;
  if (!plan) return;
  let next = plan.spawns[game.spawnIndex];
  while (next && next.at <= game.waveTime) {
    spawnEnemy(game, next);
    game.spawnIndex += 1;
    next = plan.spawns[game.spawnIndex];
  }
}

function waveFinished(game: Game): boolean {
  const total = game.plan?.spawns.length ?? 0;
  return game.status === "wave" && game.spawnIndex >= total && game.enemies.length === 0;
}

// the level is over: the simulation stops, so clear what was still in the air (shots and
// roots in flight would otherwise hang frozen over the map behind the result screen)
function endFight(game: Game): void {
  game.vines = [];
  game.storms = [];
  game.projectiles = [];
  game.beams = [];
}

function finishWave(game: Game): void {
  if (game.match) game.match.cleared += 1;
  else if (game.wave >= game.level.waves) {
    game.status = "won";
    endFight(game);
    game.events.push({ type: "won" });
    game.sfx.push("win");
    return;
  }
  // in versus, sends bought raise the coin bonus per wave
  const bonus = 25 + game.wave * 8 + (game.match?.income ?? 0);
  game.coins += bonus;
  game.events.push({ type: "waveClear", wave: game.wave, bonus });
  evolve(game);
  game.status = "between";
  game.countdown = BETWEEN_WAVES;
}

// advance the simulation by one fixed step
export function step(game: Game, dt: number): void {
  game.time += dt;
  if (game.status === "won" || game.status === "lost") {
    updateEffects(game, dt);
    return;
  }
  if (game.status === "wave") {
    game.waveTime += dt;
    spawnDue(game);
  }
  if (game.status === "between") {
    game.countdown -= dt;
    if (game.countdown <= 0) startWave(game);
  }

  updateMatch(game);
  updateEnemies(game, dt);
  updateTowers(game, dt);
  updateBases(game, dt);
  updateProjectiles(game, dt);
  updateVines(game, dt);
  updateStorms(game, dt);
  updatePowers(game, dt);
  updateEffects(game, dt);
  for (const b of game.bases) b.flash = Math.max(0, b.flash - dt);
  game.peakTowers = Math.max(game.peakTowers, game.towers.length);

  if (game.bases.some((b) => b.hp <= 0)) {
    game.status = "lost";
    endFight(game);
    game.events.push({ type: "lost" });
    game.sfx.push("lose");
    return;
  }
  if (waveFinished(game)) finishWave(game);
}

// Kingdom Rush style rating from how much base health survived
export function starRating(game: Game): number {
  const hp = game.bases.reduce((s, b) => s + b.hp, 0);
  const max = game.bases.reduce((s, b) => s + b.maxHp, 0);
  const ratio = max === 0 ? 0 : hp / max;
  if (ratio >= 0.9) return 3;
  if (ratio >= 0.5) return 2;
  return 1;
}
