import type { Game, Vec } from "@/types";
import { dist } from "@/game/geometry";

// What is under the pointer, in playfield coordinates. Pads are wide flat ovals, turrets and
// bases are tall sprites standing on their ground point.

export function padAt(game: Game, p: Vec): number {
  return game.pads.findIndex((pad) => ((pad.pos.x - p.x) / 70) ** 2 + ((pad.pos.y - p.y) / 44) ** 2 <= 1);
}

export function towerAt(game: Game, p: Vec): boolean {
  return game.towers.some((t) => dist({ x: t.pos.x, y: t.pos.y - 22 }, p) < 34);
}

export function baseAt(game: Game, p: Vec): number {
  return game.bases.findIndex((b) => b.hp > 0 && ((b.pos.x - p.x) / 70) ** 2 + ((b.pos.y - 35 - p.y) / 70) ** 2 <= 1);
}
