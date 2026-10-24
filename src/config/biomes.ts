import type { Biome, EnemyKind } from "@/types";
import { ENEMIES } from "@/config/enemies";

// Per-biome names for the four enemy roles, from each world's enemy sheets.

const SKIN_NAMES: Partial<Record<Biome, Record<EnemyKind, string>>> = {
  grassland: { scout: "Thornfang Spider", brute: "Nightwing Harrier", overlord: "Night Anaconda", titan: "Elderwood Colossus" },
  snow: { scout: "Snowman", brute: "Yeti", overlord: "Ice Golem", titan: "Ice Dragon" },
  water: { scout: "Shark", brute: "Octopus", overlord: "Electric Eel", titan: "Damyaan" },
  desert: { scout: "Chameleon", brute: "Scorpion King", overlord: "Sandman", titan: "Mummy King" },
  cyber: { scout: "Cyber Stalker", brute: "Siege Breaker", overlord: "Phase Wraith", titan: "Transformer Overlord" },
};

export function enemyName(kind: EnemyKind, biome: Biome): string {
  return SKIN_NAMES[biome]?.[kind] ?? ENEMIES[kind].name;
}

export const BIOME_NAMES: Record<Biome, string> = {
  grassland: "Grassland",
  snow: "Cold World",
  desert: "Desert",
  water: "Aqua Realm",
  cyber: "Cyber Arena",
};
