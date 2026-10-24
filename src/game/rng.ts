import type { Game } from "@/types";

// mulberry32: tiny deterministic PRNG so headless simulations replay exactly
function mulberry(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rand(game: Game): number {
  game.seed = (game.seed + 0x6d2b79f5) | 0;
  return mulberry(game.seed);
}

export function randRange(game: Game, lo: number, hi: number): number {
  return lo + rand(game) * (hi - lo);
}

// standalone generator for things that must not disturb gameplay randomness (map decor)
export function makeRng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    return mulberry(state);
  };
}
