import type { EnemyKind, PowerKind } from "@/types";

export type EnemyDef = {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  reward: number;
  baseDamage: number;
  // seconds between special attacks (brute slam, overlord bolt, titan vines)
  abilityEvery: number;
  color: string;
  desc: string;
};

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  scout: {
    kind: "scout",
    name: "Scout",
    hp: 32,
    speed: 72,
    radius: 13,
    reward: 5,
    baseDamage: 1,
    abilityEvery: 0,
    color: "#ef4444",
    desc: "Fast swarmers. Weak alone, deadly in numbers.",
  },
  brute: {
    kind: "brute",
    name: "Brute",
    hp: 175,
    speed: 38,
    radius: 19,
    reward: 16,
    baseDamage: 2,
    abilityEvery: 3,
    color: "#f97316",
    desc: "Armoured tank. Slams nearby turrets.",
  },
  overlord: {
    kind: "overlord",
    name: "Alien Overlord",
    hp: 360,
    speed: 32,
    radius: 22,
    reward: 32,
    baseDamage: 3,
    abilityEvery: 2.6,
    color: "#a855f7",
    desc: "Psychic commander. Fires bolts at your turrets.",
  },
  titan: {
    kind: "titan",
    name: "Hive Titan",
    hp: 6000,
    speed: 17,
    radius: 46,
    reward: 500,
    baseDamage: 99,
    abilityEvery: 7.5,
    color: "#16a34a",
    desc: "Final boss. Summons poison vines that rot turrets and bases.",
  },
};

// an Overlord marked as boss (level 6 finale) is scaled up instead of a separate type
export const BOSS_OVERLORD = { hpMul: 9, radiusMul: 1.75, speedMul: 0.8, reward: 260, baseDamage: 99 };

// resistance an evolved enemy has against the family that hurt the swarm most
export const RESIST_MULT = 0.5;

// how hard enemies hit turrets (melee strikes, Brute slams, Overlord bolts)
export const ENEMY_DAMAGE_SCALE = 1.2;

export type PowerDef = {
  kind: PowerKind;
  name: string;
  desc: string;
  cost: number;
  cooldown: number;
  duration: number;
  key: string;
  icon: string;
};

export const POWERS: Record<PowerKind, PowerDef> = {
  overclock: {
    kind: "overclock",
    name: "Overclock",
    desc: "All turrets fire 75% faster for 10s.",
    cost: 110,
    cooldown: 30,
    duration: 10,
    key: "Q",
    icon: "⚡",
  },
  surge: {
    kind: "surge",
    name: "Damage Surge",
    desc: "Next 8 shots of every turret deal double damage.",
    cost: 90,
    cooldown: 25,
    duration: 8,
    key: "W",
    icon: "✦",
  },
  strike: {
    kind: "strike",
    name: "Orbital Strike",
    desc: "Click the map: 350 damage blast, also cuts vines.",
    cost: 140,
    cooldown: 35,
    duration: 0,
    key: "E",
    icon: "☄",
  },
  cryo: {
    kind: "cryo",
    name: "Cryo Field",
    desc: "Every enemy slowed 60% for 6s.",
    cost: 100,
    cooldown: 30,
    duration: 6,
    key: "R",
    icon: "❄",
  },
  repair: {
    kind: "repair",
    name: "Repair Drones",
    desc: "Heal all turrets 60% and cure poison.",
    cost: 80,
    cooldown: 30,
    duration: 0,
    key: "T",
    icon: "✚",
  },
  shield: {
    kind: "shield",
    name: "Base Shield",
    desc: "Bases take no damage for 10s.",
    cost: 130,
    cooldown: 45,
    duration: 10,
    key: "Y",
    icon: "⛨",
  },
};

export const POWER_KINDS: readonly PowerKind[] = ["overclock", "surge", "strike", "cryo", "repair", "shield"];

// fixed order of the enemy kinds, used to pack them into network snapshots
export const ENEMY_KINDS: readonly EnemyKind[] = ["scout", "brute", "overlord", "titan"];
