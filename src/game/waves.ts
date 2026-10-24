import type { EnemyKind, LevelDef, Spawn, WavePlan, WaveSummary } from "@/types";

// Wave escalation rules (from the design brief):
//  wave 1: only the basic enemy (Scouts)
//  wave 2: a single next-tier enemy (one Brute) mixed into the Scouts
//  later waves: counts grow, Overlords join in levels that have them
//  final wave of a boss level: everything at once, then the boss walks in last

function scoutCount(level: LevelDef, w: number): number {
  return Math.round(6 + w * 1.8 + (level.id - 1) * 1.3);
}

function bruteCount(level: LevelDef, w: number): number {
  if (!level.enemies.includes("brute") || w === 0) return 0;
  if (w === 1) return 1;
  return 1 + Math.floor((w - 1) * 0.9 + Math.max(0, level.id - 2) * 0.35);
}

function overlordStart(level: LevelDef): number {
  return level.id === 5 ? 3 : 2;
}

function overlordCount(level: LevelDef, w: number): number {
  if (!level.enemies.includes("overlord")) return 0;
  const start = overlordStart(level);
  if (w < start) return 0;
  if (w === start) return 1;
  return 1 + Math.floor((w - start) * 0.5 + Math.max(0, level.id - 6) * 0.25);
}

function scoutInterval(level: LevelDef): number {
  return Math.max(0.42, 0.8 - level.id * 0.03);
}

function stream(kind: EnemyKind, count: number, start: number, every: number, routes: number, offset: number): Spawn[] {
  const out: Spawn[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ at: start + i * every, kind, boss: false, route: (i + offset) % routes });
  }
  return out;
}

export function planWave(level: LevelDef, w: number): WavePlan {
  const routes = level.routes.length;
  const final = w === level.waves - 1;
  const spawns: Spawn[] = [
    ...stream("scout", scoutCount(level, w), 0, scoutInterval(level), routes, 0),
    ...stream("brute", bruteCount(level, w), 2.5, 2.2, routes, 1),
    ...stream("overlord", overlordCount(level, w), 5, 3, routes, 2),
  ];

  if (final && level.boss !== null) {
    const lastAt = spawns.reduce((m, s) => Math.max(m, s.at), 0);
    // the boss takes the last route, which on multi-base levels leads to the biggest base
    spawns.push({ at: lastAt + 4, kind: level.boss, boss: true, route: routes - 1 });
  }

  spawns.sort((a, b) => a.at - b.at);
  return { spawns, summary: summarize(spawns) };
}

function summarize(spawns: Spawn[]): WaveSummary[] {
  const out: WaveSummary[] = [];
  for (const s of spawns) {
    const found = out.find((o) => o.kind === s.kind && o.boss === s.boss);
    if (found) found.count += 1;
    else out.push({ kind: s.kind, boss: s.boss, count: 1 });
  }
  return out;
}

// enemies get tougher across levels, and every wave of a level is stronger and faster than
// the one before (the swarm grows); BASE_HP makes every enemy tougher from wave 1
export const BASE_HP = 1.4;
export const HP_PER_WAVE = 0.10;
export const SPEED_PER_WAVE = 0.035;
const MAX_SPEED_MUL = 1.3;

export function hpMultiplier(levelId: number, waveIndex: number): number {
  return BASE_HP * (1 + (levelId - 1) * 0.12 + waveIndex * HP_PER_WAVE);
}

// versus waves grow faster and keep accelerating, so even a perfect defence falls in the
// end and matches last minutes, not hours
export function versusHp(waveIndex: number): number {
  return BASE_HP * (1 + waveIndex * 0.11 + waveIndex * waveIndex * 0.003);
}

export function speedMultiplier(waveIndex: number): number {
  return Math.min(MAX_SPEED_MUL, 1 + waveIndex * SPEED_PER_WAVE);
}

// income keeps pace with tougher enemies so later levels still allow upgrades
export function rewardMultiplier(levelId: number): number {
  return 1.55 * (1 + (levelId - 1) * 0.1);
}
