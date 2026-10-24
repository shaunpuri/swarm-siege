import type { BaseKind, Biome, EnemyKind, LevelDef, TowerKind } from "@/types";
import { BIOME_NAMES, enemyName } from "@/config/biomes";
import { MAPS } from "@/config/maps";
import { fromMap } from "@/config/mapspace";
import { WORLD_BIOMES, worldLayout } from "@/config/worlds";
import { PAINTINGS } from "@/config/painting";
import type { PaintingId } from "@/config/painting";

// Grassland world, levels 1-10. Each level is played on its own painted map (layout from the
// "Grassland World Level 1 to 10" sheet, art in the style of the Grassland painting): the
// swarm leaves the painted tunnel, walks the painted roads and attacks the painted bases,
// and turrets go on the painted pads. Starting coins, towers, enemies and wave counts per
// level follow the same sheet.

type LevelSpec = {
  id: number;
  name: string;
  keyChange: string;
  startCoins: number;
  towers: TowerKind[];
  enemies: EnemyKind[];
  waves: number;
  boss: LevelDef["boss"];
  // total build pads: the painted ones plus generated extras up to this count
  pads: number;
};

const BASIC: TowerKind[] = ["basic"];
const TWO: TowerKind[] = ["basic", "rapid"];
const ALL: TowerKind[] = ["basic", "rapid", "heavy"];
const FULL_SWARM: EnemyKind[] = ["scout", "brute", "overlord"];

const SPECS: LevelSpec[] = [
  { id: 1, name: "Introduction", keyChange: "Build on the glowing pads and stop the Scouts.", startCoins: 200, towers: BASIC, enemies: ["scout"], waves: 6, boss: null, pads: 6 },
  { id: 2, name: "Brute Introduction", keyChange: "Brutes arrive. They slam turrets, so keep coins to repair.", startCoins: 300, towers: TWO, enemies: ["scout", "brute"], waves: 6, boss: null, pads: 7 },
  { id: 3, name: "The Swarm Learns", keyChange: "The swarm starts to evolve against your favourite tower.", startCoins: 450, towers: TWO, enemies: ["scout", "brute"], waves: 6, boss: null, pads: 7 },
  { id: 4, name: "Brute Packs", keyChange: "Bigger Brute packs. Upgrade and repair your turrets.", startCoins: 600, towers: TWO, enemies: ["scout", "brute"], waves: 6, boss: null, pads: 8 },
  { id: 5, name: "Heavy Arrival", keyChange: "Heavy Tower unlocked. First Overlord sighted.", startCoins: 800, towers: ALL, enemies: FULL_SWARM, waves: 6, boss: null, pads: 10 },
  { id: 6, name: "Grassland Finale", keyChange: "12 waves. The Overlord commander leads the last assault.", startCoins: 1200, towers: ALL, enemies: FULL_SWARM, waves: 12, boss: "overlord", pads: 11 },
  { id: 7, name: "Advanced Defence", keyChange: "Unlock abilities: Ricochet, Laser, Flame, Cryo, Cluster, Nuke.", startCoins: 900, towers: ALL, enemies: FULL_SWARM, waves: 8, boss: null, pads: 10 },
  { id: 8, name: "Rising Pressure", keyChange: "Faster, denser waves. Use your power-ups.", startCoins: 1000, towers: ALL, enemies: FULL_SWARM, waves: 8, boss: null, pads: 10 },
  { id: 9, name: "Outpost Siege", keyChange: "Stronger waves. Every turret counts.", startCoins: 1100, towers: ALL, enemies: FULL_SWARM, waves: 10, boss: null, pads: 10 },
  { id: 10, name: "Final Challenge", keyChange: "Every enemy type, then the Hive Titan and its poison vines.", startCoins: 1500, towers: ALL, enemies: FULL_SWARM, waves: 12, boss: "titan", pads: 12 },
];

function mapFor(id: number) {
  const map = MAPS[id - 1];
  if (!map) throw new Error(`no map for level ${id}`);
  return map;
}

export const LEVELS: LevelDef[] = SPECS.map((s) => {
  const map = mapFor(s.id);
  const { pads: padTarget, ...spec } = s;
  const pads = map.pads.map(fromMap);
  return {
    ...spec,
    routes: map.routes.map((r) => r.map(fromMap)),
    routeBase: map.routeBase,
    bases: map.bases.map((b) => ({ kind: b.kind, pos: fromMap(b.at) })),
    rivers: [],
    pads,
    padTarget: Math.max(padTarget, pads.length),
    mapArt: "level",
    hpScale: 1,
    entries: map.routes.map(() => "tunnel"),
    jumps: map.routes.map(() => []),
    biome: "grassland",
  };
});

// painting modes: the same 10 levels, all on one concept painting with its single road
// the grassland painting's pads see less of its road than the cyber city's, so its enemies
// are a little lighter
const PAINTING_HP_SCALE: Record<PaintingId, number> = { grassland: 0.68, cyber: 0.75 };

function paintingLevels(id: PaintingId): LevelDef[] {
  const painting = PAINTINGS[id];
  return SPECS.map((s) => {
    const { pads: _target, ...spec } = s;
    return {
      ...spec,
      routes: [painting.road],
      routeBase: [0],
      bases: [painting.base],
      rivers: [],
      pads: painting.pads,
      padTarget: painting.pads.length,
      mapArt: id,
      hpScale: PAINTING_HP_SCALE[id],
      entries: ["tunnel"],
      jumps: [[]],
      biome: id === "cyber" ? "cyber" : "grassland",
    };
  });
}

const PAINTING_LEVELS: Record<PaintingId, LevelDef[]> = { grassland: paintingLevels("grassland"), cyber: paintingLevels("cyber") };

// Each world level's name and hint, told with that world's own creatures (the original level
// specs speak of the alien swarm: Brutes, Overlords, the Hive Titan).
function worldText(id: number, biome: Biome): { name: string; keyChange: string } {
  const kinds: EnemyKind[] = ["scout", "brute", "overlord", "titan"];
  const [scout, brute, overlord, titan] = kinds.map((k) => enemyName(k, biome));
  const world = BIOME_NAMES[biome];
  const text: Record<number, [string, string]> = {
    1: ["First Contact", `Build on the glowing pads and stop the ${scout} swarm.`],
    2: [`${brute} Sighted`, `${brute}s arrive. They attack turrets, so keep coins to repair.`],
    3: ["The Swarm Learns", "The swarm starts to evolve against your favourite turret. Mix your defence."],
    4: [`${brute} Packs`, `Bigger ${brute} packs. Upgrade and repair your turrets.`],
    5: ["Heavy Arrival", `Your world tower is ready. The first ${overlord} is sighted.`],
    6: [`${world} Siege`, `12 waves. More enemies can attack each turret now.`],
    7: ["Advanced Defence", "Level 3 turrets unlock abilities. Use them."],
    8: ["Rising Pressure", "Faster, denser waves. Use your powers."],
    9: ["Last Stand", "Three enemies can attack a turret at once. Every turret counts."],
    10: [`${world} Finale`, `Every enemy, then the boss: ${titan}.`],
  };
  const [name, keyChange] = text[id] ?? ["Defend", "Hold the line."];
  return { name, keyChange };
}

// world mode: the ChatGPT layouts painted in each biome (src/config/worlds.ts)
function worldLevels(biome: Biome): LevelDef[] {
  return SPECS.flatMap((s) => {
    const layout = worldLayout(s.id, biome);
    if (!layout) return [];
    const { pads: _target, ...spec } = s;
    // every world has its own tower sheet: that tower replaces the Heavy Tower
    const towers: TowerKind[] = ["frost", ...spec.towers.filter((t) => t !== "heavy")];
    // a world's boss only appears in the last wave of its last level
    const boss = s.id === SPECS.length ? spec.boss : null;
    // underwater, the tunnels are not walked out of: enemies swim down from the sea above
    const entries = biome === "water" ? layout.entries.map((e) => (e === "tunnel" ? "swim" : e)) : layout.entries;
    return [{ ...spec, ...layout, ...worldText(s.id, biome), boss, entries, towers, rivers: [], mapArt: "world", hpScale: 1 }];
  });
}

const WORLD_LEVELS: Record<Biome, LevelDef[]> = {
  grassland: worldLevels("grassland"),
  snow: worldLevels("snow"),
  desert: worldLevels("desert"),
  water: worldLevels("water"),
  cyber: worldLevels("cyber"),
};

// "maps": each level's own map; "grassland" and "cyber": every level on that painting;
// "world-<biome>": the ChatGPT world maps in that biome
export type MapMode = "maps" | PaintingId | `world-${Biome}`;
export const MAP_MODES: MapMode[] = ["maps", "grassland", "cyber", "world-grassland", "world-snow", "world-desert", "world-water", "world-cyber"];

export function levelsFor(mode: MapMode): LevelDef[] {
  if (mode === "maps") return LEVELS;
  if (mode === "grassland" || mode === "cyber") return PAINTING_LEVELS[mode];
  const biome = WORLD_BIOMES.find((b) => mode === `world-${b}`);
  return biome ? WORLD_LEVELS[biome] : LEVELS;
}

export const BASE_HP: Record<BaseKind, number> = {
  outpost: 10,
  fortress: 20,
  reactor: 30,
};

export function levelById(id: number, mode: MapMode = "maps"): LevelDef {
  const level = levelsFor(mode).find((l) => l.id === id);
  if (!level) throw new Error(`unknown level ${id}`);
  return level;
}
