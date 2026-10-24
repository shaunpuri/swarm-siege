import type { Difficulty, Game } from "@/types";
import { ENEMY_DAMAGE_SCALE } from "@/config/enemies";

// Campaign difficulty, picked before a level: enemy health, how hard enemies hit turrets, and
// the starting coins. Medium is the tested balance; Hard earns the Hard badges.

export type DifficultyDef = { name: string; enemyHp: number; enemyDamage: number; coins: number; color: string };

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  easy: { name: "Easy", enemyHp: 0.65, enemyDamage: 0.6, coins: 1.35, color: "#4ade80" },
  medium: { name: "Medium", enemyHp: 0.85, enemyDamage: 0.8, coins: 1.12, color: "#facc15" },
  hard: { name: "Hard", enemyHp: 1.3, enemyDamage: 1.3, coins: 0.9, color: "#f87171" },
};

export const DIFFICULTY_ORDER: Difficulty[] = ["easy", "medium", "hard"];

// how hard enemies hit turrets in this game (melee strikes, Brute slams, Overlord bolts)
export function enemyDamage(game: Game): number {
  return ENEMY_DAMAGE_SCALE * DIFFICULTIES[game.difficulty].enemyDamage;
}
