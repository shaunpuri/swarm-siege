import type { Biome, Game } from "@/types";

// Achievement badges, kept per browser. Most reward playing on a harder difficulty or playing
// well (no base damage, few turrets, calling waves early); the rest mark beating each world's
// boss and the online versus milestones. Storage can be unavailable, so every access is guarded.

export type BadgeDef = { id: string; name: string; desc: string; color: string };

const KEY = "swarm-siege-badges-v1";

const WORLD_NAMES: Record<Biome, string> = { grassland: "Grassland", snow: "Cold World", desert: "Desert", water: "Aqua Realm", cyber: "Cyber Arena" };
const WORLD_ORDER: Biome[] = ["grassland", "snow", "desert", "water", "cyber"];

export const BADGES: BadgeDef[] = [
  { id: "first-win", name: "First Victory", desc: "Clear any level", color: "#4ade80" },
  { id: "medium-win", name: "Battle Ready", desc: "Clear a level on Medium", color: "#facc15" },
  { id: "hard-win", name: "Hardened", desc: "Clear a level on Hard", color: "#f87171" },
  { id: "flawless", name: "Flawless", desc: "Win on Medium or Hard without losing base HP", color: "#38bdf8" },
  { id: "minimalist", name: "Minimalist", desc: "Win on Medium or Hard with 4 turrets or fewer", color: "#c084fc" },
  { id: "speedrun", name: "Speed Runner", desc: "Call every wave of a level early", color: "#fb923c" },
  ...WORLD_ORDER.map((b) => ({ id: `boss-${b}`, name: `${WORLD_NAMES[b]} Champion`, desc: `Beat the ${WORLD_NAMES[b]} boss (level 10)`, color: "#fde047" })),
  ...WORLD_ORDER.map((b) => ({ id: `hard-${b}`, name: `${WORLD_NAMES[b]} Legend`, desc: `Beat the ${WORLD_NAMES[b]} boss on Hard`, color: "#ef4444" })),
  { id: "vs-win", name: "Versus Victor", desc: "Win an online versus match", color: "#22d3ee" },
  { id: "vs-iron", name: "Iron Wall", desc: "Complete 15 waves in one versus match", color: "#a3e635" },
];

export function loadBadges(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY) ?? "";
    return new Set(raw.split(",").filter((id) => BADGES.some((b) => b.id === id)));
  } catch {
    return new Set();
  }
}

function save(earned: Set<string>): void {
  try {
    localStorage.setItem(KEY, [...earned].join(","));
  } catch {
    // badges just will not persist in this browser
  }
}

// adds the badges in `ids` not earned yet; returns the newly earned ones
function grant(earned: Set<string>, ids: string[]): BadgeDef[] {
  const fresh = BADGES.filter((b) => ids.includes(b.id) && !earned.has(b.id));
  for (const b of fresh) earned.add(b.id);
  if (fresh.length > 0) save(earned);
  return fresh;
}

// after winning a campaign level
export function badgesForWin(earned: Set<string>, game: Game, lastLevel: boolean): BadgeDef[] {
  const hardish = game.difficulty !== "easy";
  const untouched = game.bases.every((b) => b.hp >= b.maxHp);
  const ids = ["first-win"];
  if (hardish) ids.push("medium-win");
  if (game.difficulty === "hard") ids.push("hard-win");
  if (hardish && untouched) ids.push("flawless");
  if (hardish && game.peakTowers <= 4) ids.push("minimalist");
  if (game.earlyCalls >= game.level.waves - 1) ids.push("speedrun");
  if (lastLevel) ids.push(`boss-${game.level.biome}`);
  if (lastLevel && game.difficulty === "hard") ids.push(`hard-${game.level.biome}`);
  return grant(earned, ids);
}

// after an online versus match
export function badgesForVersus(earned: Set<string>, won: boolean, cleared: number): BadgeDef[] {
  return grant(earned, [...(won ? ["vs-win"] : []), ...(cleared >= 15 ? ["vs-iron"] : [])]);
}
