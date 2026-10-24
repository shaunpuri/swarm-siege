import type { Biome } from "@/types";

// Biomes whose towers and bases are cut from their own sheets (Grassland keeps the original
// turrets), and the enemy skins, which every biome now has: Grassland's forest creatures came
// with their own sheets.
export type Skin = "snow" | "water" | "desert" | "cyber";
export type EnemySkin = Skin | "grassland";

export function skinOf(biome: Biome): Skin | null {
  return biome === "grassland" ? null : biome;
}

export function enemySkinOf(biome: Biome): EnemySkin {
  return biome;
}
