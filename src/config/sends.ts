import type { EnemyKind, SendKind } from "@/types";

// The online versus shop: coins spent here hit the opponent. Enemy packs spawn at their
// entrances, Empower and Overdrive make every enemy they face tougher or faster from then on,
// and the boss sends drop a commander or the world's final boss on them. Each purchase costs
// more than the last, and raises the buyer's own coin bonus per wave (pressure pays, like the
// eco in Bloons TD Battles).

export type SendDef = {
  kind: SendKind;
  name: string;
  desc: string;
  cost: number;
  // extra cost per earlier purchase of the same send
  growth: number;
  // enemies it sends (none for the boosts)
  pack: { kind: EnemyKind; count: number; boss: boolean } | null;
  // how many times it can be bought in a match (boosts are capped)
  max: number;
};

export const SENDS: SendDef[] = [
  { kind: "swarm", name: "Swarm Pack", desc: "8 fast enemies", cost: 60, growth: 10, pack: { kind: "scout", count: 8, boss: false }, max: 99 },
  { kind: "brutes", name: "Heavy Squad", desc: "3 armoured enemies", cost: 140, growth: 20, pack: { kind: "brute", count: 3, boss: false }, max: 99 },
  { kind: "elites", name: "Elite Strike", desc: "2 ranged elites", cost: 220, growth: 30, pack: { kind: "overlord", count: 2, boss: false }, max: 99 },
  { kind: "empower", name: "Empower", desc: "+12% enemy HP for good", cost: 250, growth: 100, pack: null, max: 10 },
  { kind: "overdrive", name: "Overdrive", desc: "+6% enemy speed for good", cost: 200, growth: 80, pack: null, max: 5 },
  { kind: "commander", name: "Commander", desc: "a giant elite boss", cost: 450, growth: 120, pack: { kind: "overlord", count: 1, boss: true }, max: 99 },
  { kind: "boss", name: "Final Boss", desc: "the world's boss", cost: 1000, growth: 300, pack: { kind: "titan", count: 1, boss: true }, max: 99 },
];

export const EMPOWER_STEP = 0.12;
export const OVERDRIVE_STEP = 0.06;
// share of every purchase added to the buyer's coin bonus per wave
export const INCOME_SHARE = 0.15;

export function sendDef(kind: SendKind): SendDef | undefined {
  return SENDS.find((s) => s.kind === kind);
}

export function isSendKind(value: unknown): value is SendKind {
  return SENDS.some((s) => s.kind === value);
}
