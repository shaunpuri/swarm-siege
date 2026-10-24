import type { Biome } from "@/types";
import type { MapMode } from "@/config/levels";
import { levelsFor } from "@/config/levels";
import type { Progress } from "@/progress";
import { cleared } from "@/progress";

// The campaign, laid out like the classic tower defense games: five worlds played in order,
// ten levels each. A world opens once every level of the world before it is cleared, and
// each level opens once the one before it is beaten.

export type World = { mode: MapMode; biome: Biome; name: string; blurb: string; color: string };

export const WORLDS: World[] = [
  { mode: "world-grassland", biome: "grassland", name: "Grassland", blurb: "Green forests, rivers, giant spiders and the Elderwood Colossus.", color: "#4ade80" },
  { mode: "world-snow", biome: "snow", name: "Cold World", blurb: "Frozen rivers, blizzards, Snowmen, Yetis and the Ice Dragon.", color: "#7dd3fc" },
  { mode: "world-desert", biome: "desert", name: "Desert", blurb: "Sandstorms, canyons, Scorpion Kings and the Mummy King.", color: "#fbbf24" },
  { mode: "world-water", biome: "water", name: "Aqua Realm", blurb: "Deep under the sea: Sharks, Electric Eels and Damyaan.", color: "#22d3ee" },
  { mode: "world-cyber", biome: "cyber", name: "Cyber Arena", blurb: "The neon city where the swarm makes its last stand.", color: "#e879f9" },
];

export function worldIndex(mode: MapMode): number {
  return WORLDS.findIndex((w) => w.mode === mode);
}

export function levelCount(mode: MapMode): number {
  return levelsFor(mode).length;
}

// open when it is the first world, or every level of the previous world is cleared
export function worldOpen(p: Progress, index: number, unlockAll: boolean): boolean {
  if (unlockAll || index <= 0) return true;
  const prev = WORLDS[index - 1];
  if (!prev) return false;
  const total = levelCount(prev.mode);
  return total > 0 && cleared(p, prev.mode) >= total;
}
