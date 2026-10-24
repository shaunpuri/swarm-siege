import type { Biome, SendKind } from "@/types";
import { isSendKind } from "@/config/sends";

// Messages between the versus room server (server/main.ts) and the game. Both players run
// their own simulation of the same map and seed; the server only relays what one player does
// that touches the other (sends), live snapshots for the opponent view, and decides the winner.

// what a player's game looks like right now, for the opponent's view and scoreboard. Towers
// are a flat [x, y, level, kind, ...] list (kind = index in TOWER_KINDS); enemies are
// [x, y, code, hp%, ...] with code = enemy kind index (scout, brute, overlord, titan) + 4
// for a boss
export const TOWER_STRIDE = 4;
export const ENEMY_STRIDE = 4;
export type Snapshot = { wave: number; cleared: number; time: number; baseHp: number; baseMax: number; coins: number; towers: number[]; enemies: number[] };

export type ClientMsg =
  | { t: "create"; name: string }
  | { t: "join"; code: string; name: string }
  | { t: "start" }
  | { t: "state"; s: Snapshot }
  | { t: "send"; kind: SendKind }
  | { t: "over"; cleared: number; time: number }
  | { t: "leave" };

export type Standing = { name: string; cleared: number; time: number };

export type ServerMsg =
  | { t: "room"; code: string; you: number; names: string[] }
  | { t: "start"; seed: number; biome: Biome; layout: number }
  | { t: "opp"; s: Snapshot }
  | { t: "incoming"; kind: SendKind }
  | { t: "result"; winner: number; reason: "outlasted" | "forfeit" | "draw"; stats: Standing[] }
  | { t: "error"; msg: string };

export const ROOM_CODE_LENGTH = 5;
// no 0/O or 1/I, so codes read out loud cleanly
export const ROOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const BIOMES: Biome[] = ["grassland", "snow", "desert", "water", "cyber"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isStr(v: unknown, max = 40): v is string {
  return typeof v === "string" && v.length <= max;
}

function isNumList(v: unknown, max: number): v is number[] {
  return Array.isArray(v) && v.length <= max && v.every(isNum);
}

function isBiome(v: unknown): v is Biome {
  return BIOMES.some((b) => b === v);
}

export function isSnapshot(v: unknown): v is Snapshot {
  return isRecord(v) && isNum(v["wave"]) && isNum(v["cleared"]) && isNum(v["time"]) && isNum(v["baseHp"]) && isNum(v["baseMax"]) && isNum(v["coins"]) && isNumList(v["towers"], 30 * TOWER_STRIDE) && isNumList(v["enemies"], 150 * ENEMY_STRIDE);
}

function parse(raw: string): unknown {
  try {
    const value: unknown = JSON.parse(raw);
    return value;
  } catch {
    return null;
  }
}

export function parseClientMsg(raw: string): ClientMsg | null {
  const m = parse(raw);
  if (!isRecord(m)) return null;
  const t = m["t"];
  if (t === "create" && isStr(m["name"])) return { t, name: m["name"] };
  if (t === "join" && isStr(m["code"], 10) && isStr(m["name"])) return { t, code: m["code"], name: m["name"] };
  if (t === "start" || t === "leave") return { t };
  if (t === "state" && isSnapshot(m["s"])) return { t, s: m["s"] };
  if (t === "send" && isSendKind(m["kind"])) return { t, kind: m["kind"] };
  if (t === "over" && isNum(m["cleared"]) && isNum(m["time"])) return { t, cleared: m["cleared"], time: m["time"] };
  return null;
}

function isStanding(v: unknown): v is Standing {
  return isRecord(v) && isStr(v["name"]) && isNum(v["cleared"]) && isNum(v["time"]);
}

export function parseServerMsg(raw: string): ServerMsg | null {
  const m = parse(raw);
  if (!isRecord(m)) return null;
  const t = m["t"];
  const names = m["names"];
  if (t === "room" && isStr(m["code"], 10) && isNum(m["you"]) && Array.isArray(names) && names.every((n) => isStr(n))) return { t, code: m["code"], you: m["you"], names: names.filter((n) => isStr(n)) };
  if (t === "start" && isNum(m["seed"]) && isBiome(m["biome"]) && isNum(m["layout"])) return { t, seed: m["seed"], biome: m["biome"], layout: m["layout"] };
  if (t === "opp" && isSnapshot(m["s"])) return { t, s: m["s"] };
  if (t === "incoming" && isSendKind(m["kind"])) return { t, kind: m["kind"] };
  const reason = m["reason"];
  const stats = m["stats"];
  if (t === "result" && isNum(m["winner"]) && (reason === "outlasted" || reason === "forfeit" || reason === "draw") && Array.isArray(stats) && stats.every(isStanding)) return { t, winner: m["winner"], reason, stats: stats.filter(isStanding) };
  if (t === "error" && isStr(m["msg"], 200)) return { t, msg: m["msg"] };
  return null;
}

// Who has won, from both players' standings. A player is out once their base falls (over).
// Most waves completed wins; on equal waves, whoever survived longer. While one player is
// still alive they win as soon as they pass the fallen player, and the match ends there.
// Returns the winning index, -1 for an exact draw, or null while it is still undecided.
export type Run = { cleared: number; time: number; over: boolean };

function ahead(a: Run, b: Run): boolean {
  return a.cleared > b.cleared || (a.cleared === b.cleared && a.time > b.time);
}

export function judge(runs: [Run, Run]): number | null {
  const [a, b] = runs;
  if (a.over && b.over) {
    if (ahead(a, b)) return 0;
    if (ahead(b, a)) return 1;
    return -1;
  }
  if (a.over && ahead(b, a)) return 1;
  if (b.over && ahead(a, b)) return 0;
  return null;
}
