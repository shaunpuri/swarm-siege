import type { Vec } from "@/types";

// Every level map is a 1344x768 painting, shown whole and scaled to the 720px playfield
// height (1260x720, centred). Level data is authored in map pixels and converted here.

export const MAP = { w: 1344, h: 768 };
export const MAP_SCALE = 720 / MAP.h;
export const MAP_OFFSET_X = (1280 - MAP.w * MAP_SCALE) / 2;

export function fromMap(p: readonly [number, number]): Vec {
  return { x: MAP_OFFSET_X + p[0] * MAP_SCALE, y: p[1] * MAP_SCALE };
}
