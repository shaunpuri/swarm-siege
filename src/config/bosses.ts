import type { Biome, Enemy, Route } from "@/types";
import { pointAt } from "@/game/geometry";

// How long each world's final boss takes to make its entrance, during which it cannot be hit
// and stands still: the Mummy King bursting out of his pyramid (the 4 second timeline on his
// sheet), the Elderwood Colossus waking from an ancient stump, the Ice Dragon diving out of
// the sky, Damyaan rising out of a whirlpool. The Cyber Arena boss has its own car to robot
// transformation instead (src/game/enemies.ts).
export const BOSS_ENTRANCE: Record<Biome, number> = { grassland: 3, snow: 4, desert: 4, water: 3, cyber: 0 };

// Entrances often sit in a map corner under the HUD, so a final boss makes its entrance this
// far along its road, out in the open (the Desert pyramid stands beside the road there)
export const BOSS_STAGE_DIST = 120;

// clear of the HUD: the top bar, the power panel on the left and the screen edges
function inOpen(p: { x: number; y: number }): boolean {
  return p.x > 230 && p.x < 1100 && p.y > 170 && p.y < 640;
}

// how far along its road a final boss makes its entrance: at least BOSS_STAGE_DIST, and on
// until it stands out in the open, but never past 30% of the road
export function stageDist(route: Route): number {
  const max = route.length * 0.3;
  for (let d = Math.min(BOSS_STAGE_DIST, max); d <= max; d += 10) {
    if (inOpen(pointAt(route, d).pos)) return d;
  }
  return Math.min(BOSS_STAGE_DIST, max);
}

export function isFinalBoss(e: Enemy): boolean {
  return e.boss && e.kind === "titan";
}

// 0..1 through the boss's entrance, or null when it is not making one
export function entranceProgress(e: Enemy, biome: Biome): number | null {
  const total = BOSS_ENTRANCE[biome];
  if (!isFinalBoss(e) || total <= 0 || e.intro <= 0) return null;
  return 1 - e.intro / total;
}

// Every creature arrives its own way, whatever the road's entrance:
//   burrow  digs up out of the ground (spiders, the Scorpion King)
//   emerge  rises out of the river or the ice (the anaconda, the Ice Golem)
//   swoop   dives down out of the sky (the Nightwing Harrier)
//   drop    lands from above (the Yeti leaping down, the Siege Breaker's drop)
//   form    gathers out of a swirl (the Snowman from snow, the Sandman from sand)
//   fade    fades in (the Chameleon out of camouflage, Stalkers warping, the Wraith phasing)
// Those that come out of the air or out of nowhere can appear anywhere along the first part
// of the road, not only at its entrance.
export type CreatureEntrance = "burrow" | "emerge" | "swoop" | "drop" | "form" | "fade";
export const CREATURE_ENTRANCE_TIME: Record<CreatureEntrance, number> = { burrow: 1.1, emerge: 2.6, swoop: 1.1, drop: 1, form: 1.2, fade: 1.3 };

const WAYS: Record<Biome, Partial<Record<Enemy["kind"], CreatureEntrance>>> = {
  grassland: { scout: "burrow", brute: "swoop", overlord: "emerge" },
  snow: { scout: "form", brute: "drop", overlord: "emerge" },
  desert: { scout: "fade", brute: "burrow", overlord: "form" },
  // the Aqua Realm already swims down from the sea above
  water: {},
  cyber: { scout: "fade", brute: "drop", overlord: "fade" },
};

export function creatureEntrance(biome: Biome, kind: Enemy["kind"], boss: boolean): CreatureEntrance | null {
  if (boss) return null;
  return WAYS[biome][kind] ?? null;
}

// arrivals from the sky or out of nowhere may land partway along the road
export function landsAnywhere(way: CreatureEntrance): boolean {
  return way === "swoop" || way === "drop" || way === "fade";
}
