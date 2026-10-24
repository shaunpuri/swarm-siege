import type { Game, TowerKind } from "@/types";
import { TOWER_KINDS } from "@/config/towers";

// The hook: "The Swarm Adapts". After every wave the swarm looks at which tower family
// dealt the most damage. If one family did at least EVOLVE_SHARE of it, the next wave
// grows armour against that family (RESIST_MULT damage taken), which pushes the player
// to diversify instead of spamming one tower. Level 1 is a tutorial, so it is off there.

export const EVOLVE_SHARE = 0.45;

export const ADAPTATIONS: Record<TowerKind, { name: string; color: string }> = {
  basic: { name: "Kinetic Plating", color: "#60a5fa" },
  rapid: { name: "Ablative Scales", color: "#4ade80" },
  heavy: { name: "Shock Dampers", color: "#c084fc" },
  frost: { name: "Thermal Coating", color: "#fb923c" },
};

export function topFamily(damage: Record<TowerKind, number>): { family: TowerKind; share: number } | null {
  const total = TOWER_KINDS.reduce((sum, k) => sum + damage[k], 0);
  if (total <= 0) return null;
  let best: TowerKind = "basic";
  for (const k of TOWER_KINDS) {
    if (damage[k] > damage[best]) best = k;
  }
  return { family: best, share: damage[best] / total };
}

// called when a wave is cleared; decides the resistance for the next wave
export function evolve(game: Game): void {
  const top = topFamily(game.adapt.damage);
  game.adapt.damage = { basic: 0, rapid: 0, heavy: 0, frost: 0 };
  if (game.level.id < 2 || !top || top.share < EVOLVE_SHARE) {
    game.adapt.resist = null;
    return;
  }
  game.adapt.resist = top.family;
  game.events.push({ type: "evolve", family: top.family, share: top.share });
  game.sfx.push("evolve");
}
