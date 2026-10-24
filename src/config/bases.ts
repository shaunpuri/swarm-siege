// Base upgrades, from the Cold Map base sheet: every base starts at level 1 (no weapons) and
// can be upgraded twice with coins. Level 2 (250 coins) adds an Ice Archer tower, a Frost
// Mortar and Snow Soldiers; level 3 (500 more) upgrades them and adds a Frost Beam Cannon and
// a Cryo Shield. Sheet ranges are in "units"; one unit is UNIT playfield pixels here.

const UNIT = 35;

export type BaseWeapon = {
  name: string;
  damage: number;
  // seconds between attacks
  every: number;
  range: number;
  // area damage radius (mortar), 0 for single target
  splash: number;
  // slows hit enemies to this speed factor for 1.5s (1 = no slow)
  slow: number;
  kind: "arrow" | "mortar" | "melee" | "beam";
};

export type BaseLevel = {
  level: number;
  name: string;
  cost: number;
  // extra max HP gained when reaching this level, as a share of the starting HP
  hpBonus: number;
  weapons: BaseWeapon[];
  // Cryo Shield: absorbs this much base damage, then recharges after shieldRecharge seconds
  shield: number;
  shieldRecharge: number;
};

const archer = (damage: number, every: number): BaseWeapon => ({ name: "Ice Archer", damage, every, range: 6 * UNIT, splash: 0, slow: 1, kind: "arrow" });
const mortar = (damage: number, every: number, range: number, slow: number): BaseWeapon => ({ name: "Frost Mortar", damage, every, range: range * UNIT, splash: 55, slow, kind: "mortar" });
const soldiers = (damage: number, every: number): BaseWeapon => ({ name: "Snow Soldiers", damage, every, range: 1.5 * UNIT + 25, splash: 0, slow: 1, kind: "melee" });

export const BASE_LEVELS: BaseLevel[] = [
  { level: 1, name: "Frozen Outpost", cost: 0, hpBonus: 0, weapons: [], shield: 0, shieldRecharge: 0 },
  {
    level: 2,
    name: "Arctic Guard",
    cost: 250,
    hpBonus: 0.5,
    weapons: [archer(12, 1.2), mortar(35, 3, 7, 0.6), soldiers(8, 1)],
    shield: 0,
    shieldRecharge: 0,
  },
  {
    level: 3,
    name: "Glacial Fortress",
    cost: 500,
    hpBonus: 1,
    weapons: [
      archer(22, 0.8),
      mortar(60, 2, 8, 0.45),
      { name: "Frost Beam", damage: 15, every: 0.5, range: 8 * UNIT, splash: 0, slow: 0.8, kind: "beam" },
      soldiers(14, 0.8),
    ],
    shield: 3,
    shieldRecharge: 10,
  },
];

export function baseLevel(level: number): BaseLevel {
  return BASE_LEVELS[Math.max(0, Math.min(BASE_LEVELS.length - 1, level - 1))] ?? BASE_LEVELS[0] ?? { level: 1, name: "Base", cost: 0, hpBonus: 0, weapons: [], shield: 0, shieldRecharge: 0 };
}

export function nextBaseLevel(level: number): BaseLevel | null {
  return BASE_LEVELS[level] ?? null;
}
