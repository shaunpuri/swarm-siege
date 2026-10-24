import type { Biome, EnemyKind } from "@/types";

// The Codex: what every creature, turret and base in each world does, in a line, for the
// Codex screen (src/ui/codex.ts). Taken from the concept sheets and how they play in game.

export const CREATURE_LORE: Record<Biome, Record<EnemyKind, string>> = {
  grassland: {
    scout: "Digs up out of the ground in packs and bites turrets with venom.",
    brute: "An owl that swoops in from the sky, rakes with its talons and wing gusts nearby turrets.",
    overlord: "Rises out of the river, slithers up the bank and lunges at turrets from range.",
    titan: "BOSS. The ancient forest guardian: slams roots out of the ground and sends poison vines at your turrets.",
  },
  snow: {
    scout: "Gathers out of a swirl of snow and fires ice crystals from its claw.",
    brute: "Leaps down onto the road and hurls ice smashes that hit every turret around it.",
    overlord: "Rises out of the ice and sends shockwaves of crystals at your turrets.",
    titan: "BOSS. Flies in on icy wings, breathes an ice beam and chains your turrets in ice.",
  },
  desert: {
    scout: "Fades in out of camouflage and spits sand blobs.",
    brute: "Bursts out of the sand and stings the ground, sending a sand shockwave.",
    overlord: "Forms out of a sand swirl and punches the ground, hurling rock shards.",
    titan: "BOSS. Rises from his pyramid, casts curses and binds turrets with cursed bandages.",
  },
  water: {
    scout: "Sinks down from the sea above and lunges to bite.",
    brute: "Slams its tentacles down, sending a water shockwave.",
    overlord: "Charges up and bursts with electricity, zapping turrets.",
    titan: "BOSS. The Serpent Lord of the Ocean: tidal shockwaves, a whirlpool and water tendrils.",
  },
  cyber: {
    scout: "Warps in and leaps at turrets with a blade slash.",
    brute: "Drops in from above, charges and slams with a red energy arc.",
    overlord: "Phases in, dashes and fires purple energy bolts.",
    titan: "BOSS. Races in as a car, transforms into a giant robot and fries turrets with energy cables.",
  },
};

// the world's turret at upgrade level 1, 2 and 3
export const TURRET_LORE: Record<Biome, [string, string, string]> = {
  grassland: ["Lobs splashing mud balls.", "Fires wooden arrows trailing leaves.", "Lashes roots at up to 4 enemies at once."],
  snow: ["Lobs crystal ice bombs that burst into spikes.", "Sprays rapid ice bullets.", "Fires ice shards that bounce through 3 enemies, and casts a Snowstorm."],
  desert: ["Holds a golden beam of sunlight on its target.", "Pours a stream of fire.", "Lobs spiky cactus pods, and casts a Sandstorm."],
  water: ["Lobs water orbs.", "Fires rapid water bolts.", "Fires water blasts that bounce through 3 enemies, and casts an Ocean Storm that slows enemies."],
  cyber: ["Fires crackling electric arcs.", "Launches drones that fly up, then drop purple bombs.", "Holds an oscillating quantum wave beam."],
};

export const BASE_LORE: [string, string, string] = [
  "Your core. If it falls, the level is lost.",
  "Upgraded: adds an archer, a mortar and soldiers that defend it.",
  "Fortress: stronger weapons, a beam cannon and a recharging shield.",
];
