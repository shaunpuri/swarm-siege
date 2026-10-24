import type { BaseKind, Biome, LevelDef } from "@/types";
import { levelsFor } from "@/config/levels";

// Online versus: the server picks a world and one of its ten layouts at random; both players
// defend that same map against endless waves, with every turret unlocked from the start.

export const VERSUS_BIOMES: Biome[] = ["grassland", "snow", "desert", "water", "cyber"];
// layouts with one base and room for at least 7 turrets, so every draw is a fair fight
export const VERSUS_LAYOUTS = [2, 3, 5, 6, 7, 8, 9];
export const VERSUS_COINS = 650;
// waves never run out in versus
export const ENDLESS = Number.MAX_SAFE_INTEGER;

export function versusLevel(biome: Biome, layout: number): LevelDef | null {
  const levels = levelsFor(`world-${biome}`);
  const base = levels.find((l) => l.id === layout) ?? levels[0];
  if (!base) return null;
  // all turrets: the last level's set (with the biome's own tower where it has one)
  const towers = levels[levels.length - 1]?.towers ?? base.towers;
  // every versus base is a fortress, whatever the layout painted
  const fortress: BaseKind = "fortress";
  const bases = base.bases.map((b) => ({ ...b, kind: fortress }));
  return { ...base, bases, name: "Versus", keyChange: "Outlast your opponent. Spend coins to send them enemies.", startCoins: VERSUS_COINS, towers, enemies: ["scout", "brute", "overlord"], waves: ENDLESS, boss: null };
}
