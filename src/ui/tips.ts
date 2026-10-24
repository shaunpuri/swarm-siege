import { levelName } from "@/ui/basemenu";
import type { Biome, Game, PowerKind } from "@/types";
import { nextBaseLevel } from "@/config/bases";

// what the final boss's vines are in each world (src/render/overlay.ts draws them that way)
const VINE_TIP: Record<Biome, string> = {
  grassland: "Poison vines!",
  snow: "Ice chains!",
  desert: "Cursed bandages!",
  water: "Water tendrils!",
  cyber: "Energy cables!",
};

// the one-line hint shown at the bottom of the screen, most urgent first
export function currentTip(game: Game, aiming: PowerKind | null, slashed: boolean): string | null {
  if (aiming === "strike") return "Click anywhere on the map to call the Orbital Strike. Right click or Esc cancels.";
  if (game.vines.length > 0 && !slashed) return `${VINE_TIP[game.level.mapArt === "world" ? game.level.biome : "grassland"]} Click them to cut them before they wreck your turrets.`;
  if (game.level.id === 1 && game.towers.length === 0) return "Click a glowing pad to build your first turret.";
  if (game.status === "ready") return "Build your defence, then press START WAVE.";
  if (game.level.id <= 2 && game.towers.some((t) => t.hp < t.maxHp * 0.5)) return "A turret is damaged. Click it and press REPAIR.";
  const base = game.bases.find((b) => b.hp > 0 && b.level === 1);
  const next = base ? nextBaseLevel(base.level) : null;
  if (next && game.coins >= next.cost && game.wave >= 2) return `Click your base to upgrade it to ${levelName(next.level, game.level.biome)} and unlock its defences.`;
  return null;
}
