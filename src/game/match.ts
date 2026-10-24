import type { Game, LevelDef, Match, SendKind, Spawn, WavePlan } from "@/types";
import { EMPOWER_STEP, INCOME_SHARE, OVERDRIVE_STEP, SENDS, sendDef } from "@/config/sends";
import { spawnEnemy } from "@/game/enemies";
import { floatText } from "@/game/effects";
import { rand } from "@/game/rng";

// Online versus rules on the simulation side. Both players get the same endless waves (same
// map, same seed); the network layer (src/net/versus.ts) carries purchases between them.

// spacing between enemies of one sent pack, in seconds
const PACK_GAP = 0.45;
// a sent pack shows up this long after it is bought, so the warning can be read
const PACK_DELAY = 1.5;
// in versus the first wave starts on its own after this long, for both players at once
export const MATCH_START = 15;

export function createMatch(): Match {
  return { hpMul: 1, speedMul: 1, pending: [], bought: { swarm: 0, brutes: 0, elites: 0, empower: 0, overdrive: 0, commander: 0, boss: 0 }, income: 0, cleared: 0 };
}

export function sendCost(match: Match, kind: SendKind): number {
  const def = sendDef(kind);
  return def ? def.cost + def.growth * match.bought[kind] : Infinity;
}

export function canBuy(game: Game, kind: SendKind): boolean {
  const match = game.match;
  const def = sendDef(kind);
  if (!match || !def || game.status === "lost" || game.status === "won") return false;
  return match.bought[kind] < def.max && game.coins >= sendCost(match, kind);
}

// pay for a send; the caller forwards it to the opponent
export function buySend(game: Game, kind: SendKind): boolean {
  const match = game.match;
  if (!match || !canBuy(game, kind)) return false;
  const cost = sendCost(match, kind);
  game.coins -= cost;
  match.bought[kind] += 1;
  match.income += Math.round(cost * INCOME_SHARE);
  game.sfx.push("power");
  return true;
}

// the opponent bought something: queue its enemies or apply its boost
export function receiveSend(game: Game, kind: SendKind): void {
  const match = game.match;
  const def = sendDef(kind);
  if (!match || !def || game.status === "lost" || game.status === "won") return;
  const entry = game.routes[0]?.points[0] ?? { x: 640, y: 80 };
  if (kind === "empower") match.hpMul += EMPOWER_STEP;
  if (kind === "overdrive") match.speedMul += OVERDRIVE_STEP;
  if (def.pack) {
    for (let i = 0; i < def.pack.count; i++) match.pending.push({ kind: def.pack.kind, boss: def.pack.boss, at: game.time + PACK_DELAY + i * PACK_GAP });
  }
  floatText(game, { x: entry.x + 80, y: entry.y + 40 }, `INCOMING: ${def.name.toUpperCase()}`, "#f87171", 18);
  game.shake = Math.max(game.shake, def.pack?.boss ? 10 : 3);
  game.sfx.push(def.pack?.boss ? "boss" : "wave");
}

// spawn sent enemies when they are due, each on a random route
export function updateMatch(game: Game): void {
  const match = game.match;
  if (!match || match.pending.length === 0) return;
  const due = match.pending.filter((p) => p.at <= game.time);
  if (due.length === 0) return;
  match.pending = match.pending.filter((p) => p.at > game.time);
  for (const p of due) spawnEnemy(game, { at: 0, kind: p.kind, boss: p.boss, route: Math.floor(rand(game) * game.routes.length) });
}

function stream(kind: Spawn["kind"], count: number, start: number, every: number, routes: number, offset: number): Spawn[] {
  return Array.from({ length: count }, (_, i) => ({ at: start + i * every, kind, boss: false, route: (i + offset) % routes }));
}

// Endless waves for versus: every wave is bigger than the last, Overlords join from wave 4, a
// Commander leads waves 10, 20, 30... and the world's boss waves 15, 25, 35...
export function planEndless(level: LevelDef, w: number): WavePlan {
  const routes = Math.max(1, level.routes.length);
  const spawns: Spawn[] = [
    ...stream("scout", 8 + w * 2, 0, Math.max(0.3, 0.7 - w * 0.015), routes, 0),
    ...stream("brute", w >= 1 ? 1 + Math.floor(w * 0.8) : 0, 2.5, 2, routes, 1),
    ...stream("overlord", w >= 3 ? 1 + Math.floor((w - 3) * 0.5) : 0, 5, 2.6, routes, 2),
  ];
  const lastAt = spawns.reduce((m, s) => Math.max(m, s.at), 0);
  const n = w + 1;
  if (n >= 15 && n % 10 === 5) spawns.push({ at: lastAt + 4, kind: "titan", boss: true, route: routes - 1 });
  else if (n % 10 === 0) spawns.push({ at: lastAt + 4, kind: "overlord", boss: true, route: routes - 1 });
  spawns.sort((a, b) => a.at - b.at);
  const summary = SUMMARY_KINDS.map((kind) => ({ kind, boss: kind === "titan", count: spawns.filter((s) => s.kind === kind && (kind === "titan" || !s.boss)).length })).filter((s) => s.count > 0);
  return { spawns, summary };
}

const SUMMARY_KINDS: Spawn["kind"][] = ["scout", "brute", "overlord", "titan"];

export function sendKinds(): SendKind[] {
  return SENDS.map((s) => s.kind);
}
