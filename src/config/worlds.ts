import type { Biome, LevelDef, Vec } from "@/types";
import { WORLD_MAPS } from "@/config/worldmaps";

// World mode: the 10 ChatGPT-painted layouts, each painted in five biomes. A biome's level N
// uses layout N; roads, pads and bases are traced once and shared by every biome, since the
// biome versions are repaints of the same picture. Maps are 1672x941, shown whole and scaled
// to the 720px playfield height.

export const WORLD_SIZE = { w: 1672, h: 941 };
export const WORLD_BIOMES: Biome[] = ["grassland", "snow", "desert", "water", "cyber"];

const SCALE = 720 / WORLD_SIZE.h;
const OFFSET_X = (1280 - WORLD_SIZE.w * SCALE) / 2;

export function fromWorld(p: readonly [number, number]): Vec {
  return { x: OFFSET_X + p[0] * SCALE, y: p[1] * SCALE };
}

// the playfield parts of a world level; the rest (economy, waves) comes from the level spec
export function worldLayout(id: number, biome: Biome): Pick<LevelDef, "routes" | "routeBase" | "bases" | "pads" | "padTarget" | "entries" | "jumps" | "biome"> | null {
  const map = WORLD_MAPS[id];
  if (!map) return null;
  const pads = map.pads.map(fromWorld);
  return {
    routes: map.routes.map((r) => r.map(fromWorld)),
    routeBase: map.routeBase,
    bases: map.bases.map((b) => ({ kind: b.kind, pos: fromWorld(b.at) })),
    pads,
    padTarget: pads.length,
    entries: map.entries,
    jumps: map.jumps,
    biome,
  };
}

export function worldLevelIds(): number[] {
  return Object.keys(WORLD_MAPS).map(Number).sort((a, b) => a - b);
}
