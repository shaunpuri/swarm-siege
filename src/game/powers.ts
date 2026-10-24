import type { Game, PowerKind, Vec } from "@/types";
import { POWERS, POWER_KINDS } from "@/config/enemies";
import { splashDamage } from "@/game/combat";
import { emit, explosion, floatText, ring } from "@/game/effects";
import { blastVines } from "@/game/vines";

// Coin-bought power-ups with a cooldown. Timed ones run for `duration` seconds;
// Damage Surge instead lasts for a number of shots per turret ("works for a few fires").

const STRIKE_DELAY = 0.8;
const STRIKE_RADIUS = 95;
const STRIKE_DAMAGE = 350;

export function powerBlocked(game: Game, kind: PowerKind): string | null {
  if (game.status === "won" || game.status === "lost") return "Level over";
  if (game.cooldowns[kind] > 0) return `Ready in ${Math.ceil(game.cooldowns[kind])}s`;
  if (game.coins < POWERS[kind].cost) return "Not enough coins";
  if ((kind === "surge" || kind === "repair") && game.towers.length === 0) return "Build a turret first";
  return null;
}

// strike needs a target point; everything else applies instantly
export function usePower(game: Game, kind: PowerKind, at: Vec | null): boolean {
  if (powerBlocked(game, kind) !== null) return false;
  if (kind === "strike" && at === null) return false;
  const def = POWERS[kind];
  game.coins -= def.cost;
  game.cooldowns[kind] = def.cooldown;
  game.sfx.push("power");

  if (kind === "overclock") game.power.overclock = def.duration;
  if (kind === "cryo") {
    game.power.cryo = def.duration;
    for (const e of game.enemies) emit(game, "spark", e.pos, "#a5f3fc", 4, 60, 2, 0.5);
  }
  if (kind === "shield") game.power.shield = def.duration;
  if (kind === "surge") {
    for (const t of game.towers) {
      t.boostShots = def.duration;
      ring(game, t.pos, "#facc15", 34);
    }
  }
  if (kind === "repair") {
    for (const t of game.towers) {
      t.hp = Math.min(t.maxHp, t.hp + t.maxHp * 0.6);
      emit(game, "spark", t.pos, "#4ade80", 10, 80, 3, 0.6);
    }
    // drones also tear off vines latched onto turrets
    game.vines = game.vines.filter((v) => v.target.kind !== "tower");
  }
  if (kind === "strike" && at !== null) {
    game.strikes.push({ pos: { ...at }, timer: STRIKE_DELAY });
    ring(game, at, "#f87171", STRIKE_RADIUS, STRIKE_DELAY);
  }
  return true;
}

export function updatePowers(game: Game, dt: number): void {
  game.power.overclock = Math.max(0, game.power.overclock - dt);
  game.power.cryo = Math.max(0, game.power.cryo - dt);
  game.power.shield = Math.max(0, game.power.shield - dt);
  for (const kind of POWER_KINDS) game.cooldowns[kind] = Math.max(0, game.cooldowns[kind] - dt);

  for (const s of game.strikes) {
    s.timer -= dt;
    if (s.timer > 0) continue;
    splashDamage(game, s.pos, STRIKE_RADIUS, STRIKE_DAMAGE, null);
    blastVines(game, s.pos, STRIKE_RADIUS);
    explosion(game, s.pos, "#fca5a5", STRIKE_RADIUS);
    floatText(game, s.pos, "ORBITAL STRIKE", "#fecaca", 16);
    game.shake = Math.max(game.shake, 12);
    game.sfx.push("bigboom");
  }
  game.strikes = game.strikes.filter((s) => s.timer > 0);
}

export const STRIKE = { radius: STRIKE_RADIUS };
