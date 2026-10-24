import type { Biome, SendKind } from "@/types";
import type { Snapshot, Standing } from "@/net/protocol";
import { isSnapshot } from "@/net/protocol";
import { isSendKind } from "@/config/sends";

// Arena Stakes: up to five players in a room. When the host starts, two are picked at random
// as FIGHTERS (they play a 1 vs 1 versus match) and the rest are INVESTORS: during a short
// betting window each investor stakes diamonds (50, 100 or 250) on a fighter, then watches
// both boards live. When the match ends the losing side's stakes are shared among the winning
// side's investors in proportion to their stakes, and the fighters get a prize.
// Messages travel over their own WebSocket (/arena). Fighters also receive the plain versus
// messages (start, opp, incoming, result), so their game runs exactly like an online match.

export const ARENA_MAX = 5;
export const STAKES = [50, 100, 250] as const;
export const BET_SECONDS = 20;
// diamonds for the fighters, whatever the bets
export const FIGHTER_WIN = 60;
export const FIGHTER_LOSS = 15;
// when nobody backed the losing fighter there is no pool to share: the house pays this share
// of each winning stake instead
export const HOUSE_BONUS = 0.25;

export type ArenaRole = "fighter" | "investor";
export type ArenaPlayer = { name: string; diamonds: number };
export type Bet = { name: string; fighter: number; stake: number };
export type Payout = { name: string; role: ArenaRole; delta: number; diamonds: number };

export type ArenaClientMsg =
  | { t: "a-join"; code: string; name: string; pin: string }
  | { t: "a-start" }
  | { t: "a-bet"; fighter: number; stake: number }
  | { t: "state"; s: Snapshot }
  | { t: "send"; kind: SendKind }
  | { t: "over"; cleared: number; time: number }
  | { t: "leave" };

export type ArenaServerMsg =
  | { t: "a-room"; code: string; you: number; players: ArenaPlayer[] }
  | { t: "a-roles"; fighters: number[]; you: number; seed: number; biome: Biome; layout: number; seconds: number }
  | { t: "a-bets"; bets: Bet[]; seconds: number }
  | { t: "a-live" }
  | { t: "a-snap"; fighter: number; s: Snapshot }
  | { t: "a-result"; winner: number; payouts: Payout[]; stats: Standing[] }
  | { t: "error"; msg: string }
  // the versus messages a fighter's game understands
  | { t: "start"; seed: number; biome: Biome; layout: number }
  | { t: "opp"; s: Snapshot }
  | { t: "incoming"; kind: SendKind }
  | { t: "result"; winner: number; reason: "outlasted" | "forfeit" | "draw"; stats: Standing[] };

// What each investor gets back from the bets, given the winning fighter (-1 for a draw):
// winners get their stake back plus a share of the losers' stakes in proportion to their own;
// losers lose their stake; a draw refunds everyone.
export function settleBets(bets: Bet[], winner: number): Map<string, number> {
  const out = new Map<string, number>();
  if (winner < 0) {
    for (const b of bets) out.set(b.name, 0);
    return out;
  }
  const won = bets.filter((b) => b.fighter === winner);
  const lost = bets.filter((b) => b.fighter !== winner);
  const pool = lost.reduce((s, b) => s + b.stake, 0);
  const backing = won.reduce((s, b) => s + b.stake, 0);
  for (const b of lost) out.set(b.name, -b.stake);
  for (const b of won) {
    const share = pool > 0 ? Math.floor((pool * b.stake) / backing) : Math.floor(b.stake * HOUSE_BONUS);
    out.set(b.name, share);
  }
  return out;
}

// ---- parsing (both ends check every message)

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown, max = 40): v is string => typeof v === "string" && v.length <= max;
const BIOMES: Biome[] = ["grassland", "snow", "desert", "water", "cyber"];
const isBiome = (v: unknown): v is Biome => BIOMES.some((b) => b === v);

function parse(raw: string): Record<string, unknown> | null {
  try {
    const m: unknown = JSON.parse(raw);
    return isRecord(m) ? m : null;
  } catch {
    return null;
  }
}

export function parseArenaClient(raw: string): ArenaClientMsg | null {
  const m = parse(raw);
  if (!m) return null;
  const t = m["t"];
  if (t === "a-join" && isStr(m["code"], 10) && isStr(m["name"], 20) && isStr(m["pin"], 8)) return { t, code: m["code"], name: m["name"], pin: m["pin"] };
  if (t === "a-start" || t === "leave") return { t };
  if (t === "a-bet" && isNum(m["fighter"]) && isNum(m["stake"])) return { t, fighter: m["fighter"], stake: m["stake"] };
  if (t === "state" && isSnapshot(m["s"])) return { t, s: m["s"] };
  if (t === "send" && isSendKind(m["kind"])) return { t, kind: m["kind"] };
  if (t === "over" && isNum(m["cleared"]) && isNum(m["time"])) return { t, cleared: m["cleared"], time: m["time"] };
  return null;
}

function isPlayer(v: unknown): v is ArenaPlayer {
  return isRecord(v) && isStr(v["name"]) && isNum(v["diamonds"]);
}
function isBet(v: unknown): v is Bet {
  return isRecord(v) && isStr(v["name"]) && isNum(v["fighter"]) && isNum(v["stake"]);
}
function isPayout(v: unknown): v is Payout {
  return isRecord(v) && isStr(v["name"]) && (v["role"] === "fighter" || v["role"] === "investor") && isNum(v["delta"]) && isNum(v["diamonds"]);
}
function isStanding(v: unknown): v is Standing {
  return isRecord(v) && isStr(v["name"]) && isNum(v["cleared"]) && isNum(v["time"]);
}
function listOf<T>(v: unknown, guard: (x: unknown) => x is T): T[] | null {
  return Array.isArray(v) && v.every(guard) ? v.filter(guard) : null;
}

export function parseArenaServer(raw: string): ArenaServerMsg | null {
  const m = parse(raw);
  if (!m) return null;
  const t = m["t"];
  const players = listOf(m["players"], isPlayer);
  if (t === "a-room" && isStr(m["code"], 10) && isNum(m["you"]) && players) return { t, code: m["code"], you: m["you"], players };
  const fighters = listOf(m["fighters"], isNum);
  if (t === "a-roles" && fighters && isNum(m["you"]) && isNum(m["seed"]) && isBiome(m["biome"]) && isNum(m["layout"]) && isNum(m["seconds"])) return { t, fighters, you: m["you"], seed: m["seed"], biome: m["biome"], layout: m["layout"], seconds: m["seconds"] };
  const bets = listOf(m["bets"], isBet);
  if (t === "a-bets" && bets && isNum(m["seconds"])) return { t, bets, seconds: m["seconds"] };
  if (t === "a-live") return { t };
  if (t === "a-snap" && isNum(m["fighter"]) && isSnapshot(m["s"])) return { t, fighter: m["fighter"], s: m["s"] };
  const payouts = listOf(m["payouts"], isPayout);
  const stats = listOf(m["stats"], isStanding);
  if (t === "a-result" && isNum(m["winner"]) && payouts && stats) return { t, winner: m["winner"], payouts, stats };
  if (t === "error" && isStr(m["msg"], 200)) return { t, msg: m["msg"] };
  if (t === "start" && isNum(m["seed"]) && isBiome(m["biome"]) && isNum(m["layout"])) return { t, seed: m["seed"], biome: m["biome"], layout: m["layout"] };
  if (t === "opp" && isSnapshot(m["s"])) return { t, s: m["s"] };
  if (t === "incoming" && isSendKind(m["kind"])) return { t, kind: m["kind"] };
  const reason = m["reason"];
  if (t === "result" && isNum(m["winner"]) && (reason === "outlasted" || reason === "forfeit" || reason === "draw") && stats) return { t, winner: m["winner"], reason, stats };
  return null;
}
