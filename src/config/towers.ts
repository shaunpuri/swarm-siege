import type { Biome, SpecKind, Tower, TowerKind } from "@/types";

// Kingdom Rush style progression: build level 1 on an empty pad, upgrade to 2 and 3,
// then pick one of two specialisations that changes how the tower attacks.

type Triple<T> = readonly [T, T, T];

export type TowerDef = {
  kind: TowerKind;
  name: string;
  short: string;
  color: string;
  glow: string;
  cost: number;
  upgradeCosts: readonly [number, number];
  damage: Triple<number>;
  rate: Triple<number>;
  range: Triple<number>;
  hp: Triple<number>;
  splash: Triple<number>;
  projectileSpeed: number;
  // ability choices after level 3; empty for towers whose levels already change the weapon
  specs: readonly SpecKind[];
  // how each level attacks, when it differs from the tower kind's usual shot
  styles?: Triple<"shell" | "bullet" | "ricochet">;
  desc: string;
};

export type SpecDef = {
  kind: SpecKind;
  base: TowerKind;
  name: string;
  desc: string;
  cost: number;
  damage: number;
  rate: number;
  range: number;
  hp: number;
  splash: number;
  color: string;
};

export const TOWERS: Record<TowerKind, TowerDef> = {
  basic: {
    kind: "basic",
    name: "Basic Tower",
    short: "Basic",
    color: "#3b82f6",
    glow: "#7cc4ff",
    cost: 70,
    upgradeCosts: [70, 120],
    damage: [14, 23, 36],
    rate: [1.15, 1.3, 1.45],
    range: [135, 145, 160],
    hp: [100, 140, 190],
    splash: [0, 0, 0],
    projectileSpeed: 560,
    specs: ["ricochet", "laser"],
    desc: "Reliable plasma cannon. Good all-rounder.",
  },
  rapid: {
    kind: "rapid",
    name: "Rapid Tower",
    short: "Rapid",
    color: "#22c55e",
    glow: "#86efac",
    cost: 90,
    upgradeCosts: [85, 140],
    damage: [5, 7.5, 11],
    rate: [4, 5, 6],
    range: [120, 125, 135],
    hp: [80, 115, 155],
    splash: [0, 0, 0],
    projectileSpeed: 700,
    specs: ["flame", "cryo"],
    desc: "Twin blasters, huge fire rate. Shreds fast swarms.",
  },
  heavy: {
    kind: "heavy",
    name: "Heavy Tower",
    short: "Heavy",
    color: "#a855f7",
    glow: "#d8b4fe",
    cost: 130,
    upgradeCosts: [120, 190],
    damage: [42, 68, 105],
    rate: [0.45, 0.5, 0.56],
    range: [170, 180, 195],
    hp: [150, 205, 270],
    splash: [52, 60, 68],
    projectileSpeed: 320,
    specs: ["cluster", "nuke"],
    desc: "Lobs plasma shells that splash groups. Slow but brutal.",
  },
  // Cold World Tower (snow turret sheet): one tower that changes weapon as it levels up.
  // Sheet stats: Frost Mortar 40 dmg / 2.0s / 7 units, area; Ice Machine Gun 8 dmg / 0.1s /
  // 6.5 units; Ice Cannon 60 dmg / 1.2s / 8 units, ricochets to 3 enemies at 100/70/50%.
  // The machine gun fires 6 shots a second rather than 10 to keep it in line with the other
  // turrets' damage per coin.
  frost: {
    kind: "frost",
    // each world's own heavy tower (Worldroot Guardian, Ice Cannon, Cactus Sand Mortar, Abyssal
    // Cannon, Quantum Singularity Tower): heavy splash shots, ricocheting blasts at level 3
    name: "World Tower",
    short: "Frost",
    // purple, so its role ring stands apart from the blue Striker and green Rapid
    color: "#c084fc",
    glow: "#a5f3fc",
    cost: 100,
    upgradeCosts: [200, 350],
    damage: [40, 52, 60],
    rate: [0.5, 0.62, 0.83],
    range: [150, 160, 170],
    hp: [140, 190, 260],
    splash: [55, 62, 0],
    projectileSpeed: 640,
    specs: [],
    styles: ["shell", "shell", "ricochet"],
    desc: "Heavy splash shots against packs, ricocheting blasts at level 3.",
  },
};

const FROST_NAMES = ["Frost Mortar", "Ice Machine Gun", "Ice Cannon"];
// each biome's own three-level tower, named as on its sheet
const BIOME_TOWER_NAMES: Record<Biome, string[]> = {
  grassland: ["Mud Mortar", "Wildwood Repeater", "Worldroot Guardian"],
  snow: FROST_NAMES,
  water: ["Tide Launcher", "Current Repeater", "Abyssal Cannon"],
  desert: ["Sun Reflector", "Flame Cannon", "Cactus Sand Mortar"],
  cyber: ["Electric Arc", "Drone Swarm Generator", "Quantum Singularity Tower"],
};

// In the worlds a turret's look follows its upgrade level through the three designs on the
// world's tower sheet (Sun Reflector, then Flame Cannon, then Cactus Sand Mortar, and so on),
// whatever its type; the type sets its role (single target, rapid fire, heavy splash)
export function worldTowerName(level: number, biome: Biome): string {
  return BIOME_TOWER_NAMES[biome][level - 1] ?? "Turret";
}

export const ROLE_NAMES: Record<TowerKind, string> = { basic: "Striker", rapid: "Rapid", heavy: "Heavy", frost: "Siege" };

export const SPECS: Record<SpecKind, SpecDef> = {
  ricochet: {
    kind: "ricochet",
    base: "basic",
    name: "Ricochet Cannon",
    desc: "Shots bounce between up to 4 enemies.",
    cost: 230,
    damage: 40,
    rate: 1.4,
    range: 165,
    hp: 230,
    splash: 0,
    color: "#facc15",
  },
  laser: {
    kind: "laser",
    base: "basic",
    name: "Laser Blaster",
    desc: "Piercing beam hits every enemy in a line.",
    cost: 250,
    damage: 62,
    rate: 0.85,
    range: 215,
    hp: 220,
    splash: 0,
    color: "#f472b6",
  },
  flame: {
    kind: "flame",
    base: "rapid",
    name: "Flamethrower",
    desc: "Short cone of fire. Burns everything in front of it.",
    cost: 230,
    damage: 22,
    rate: 4,
    range: 118,
    hp: 210,
    splash: 0,
    color: "#fb923c",
  },
  cryo: {
    kind: "cryo",
    base: "rapid",
    name: "Cryo Blaster",
    desc: "Frost rounds slow enemies by 50%.",
    cost: 210,
    damage: 12,
    rate: 6,
    range: 145,
    hp: 190,
    splash: 0,
    color: "#67e8f9",
  },
  cluster: {
    kind: "cluster",
    base: "heavy",
    name: "Cluster Mortar",
    desc: "Shells burst into 5 bomblets on impact.",
    cost: 270,
    damage: 85,
    rate: 0.6,
    range: 205,
    hp: 300,
    splash: 62,
    color: "#f97316",
  },
  nuke: {
    kind: "nuke",
    base: "heavy",
    name: "Plasma Nuke",
    desc: "Rare, enormous blast. Deletes whole waves.",
    cost: 300,
    damage: 420,
    rate: 0.24,
    range: 240,
    hp: 320,
    splash: 115,
    color: "#ef4444",
  },
};

export type TowerStats = {
  damage: number;
  rate: number;
  range: number;
  hp: number;
  splash: number;
  color: string;
  name: string;
};

function pick<T>(values: Triple<T>, level: number): T {
  if (level >= 3) return values[2];
  if (level === 2) return values[1];
  return values[0];
}

// the painted level maps are drawn at a large scale (build pads are ~160px wide and sit out in
// the meadows), so every turret reaches further than the base numbers above
export const RANGE_SCALE = 1.5;

// enemies start 40% tougher and grow every wave, so turrets hit harder to keep pace; the
// late waves still outgrow them unless the player upgrades
export const DAMAGE_SCALE = 1.35;

// turrets are fragile: enemies tear them down unless the player repairs, upgrades and uses
// powers at the right moments, so skill decides the level rather than how many turrets
export const TOWER_HP_SCALE = 0.55;

export function towerStats(tower: Pick<Tower, "kind" | "level" | "spec">): TowerStats {
  if (tower.spec !== null) {
    const spec = SPECS[tower.spec];
    return {
      damage: spec.damage * DAMAGE_SCALE,
      rate: spec.rate,
      range: spec.range * RANGE_SCALE,
      hp: Math.round(spec.hp * TOWER_HP_SCALE),
      splash: spec.splash,
      color: spec.color,
      name: spec.name,
    };
  }
  const def = TOWERS[tower.kind];
  return {
    damage: pick(def.damage, tower.level) * DAMAGE_SCALE,
    rate: pick(def.rate, tower.level),
    range: pick(def.range, tower.level) * RANGE_SCALE,
    hp: Math.round(pick(def.hp, tower.level) * TOWER_HP_SCALE),
    splash: pick(def.splash, tower.level),
    color: def.color,
    name: tower.kind === "frost" ? (FROST_NAMES[tower.level - 1] ?? def.name) : `${def.name} L${tower.level}`,
  };
}

// cost of the next step for this tower, or null when fully specialised
export function nextUpgradeCost(tower: Pick<Tower, "kind" | "level" | "spec">): number | null {
  if (tower.spec !== null || tower.level >= 3) return null;
  const def = TOWERS[tower.kind];
  return tower.level === 1 ? def.upgradeCosts[0] : def.upgradeCosts[1];
}

export const SELL_REFUND = 0.6;
export const TOWER_KINDS: readonly TowerKind[] = ["basic", "rapid", "heavy", "frost"];
