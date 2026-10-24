import type { LevelDef, Vec } from "@/types";
import { dist, distToPolyline, eachSegment, samplePolyline } from "@/game/geometry";

// Build pads: the pads painted on the level map are used exactly where they are drawn.
// Where a map paints too few for its wave count, extra pads (drawn with a pad cut from the
// map art) are added up to padTarget. Candidates sit beside the road on both sides, each is
// scored by how much road it covers within a typical tower range, and the best are picked
// greedily with a minimum spacing, like the fixed build spots of Kingdom Rush.

// painted pads are about 160x100 on screen, so generated ones keep well clear of roads
const OFFSET = 92;
const ROAD_CLEAR = 82;
const PAD_SPACING = 150;
const COVER_RANGE = 210;
// keeps generated pads clear of the top bar and inside the painted map
const BOUNDS = { minX: 90, maxX: 1190, minY: 110, maxY: 660 };

function candidates(routes: Vec[][]): Vec[] {
  const out: Vec[] = [];
  for (const route of routes) {
    eachSegment(route, (a, b) => {
      const len = dist(a, b);
      if (len === 0) return;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      for (let d = 0; d < len; d += 24) {
        const cx = a.x + ((b.x - a.x) * d) / len;
        const cy = a.y + ((b.y - a.y) * d) / len;
        out.push({ x: cx + nx * OFFSET, y: cy + ny * OFFSET });
        out.push({ x: cx - nx * OFFSET, y: cy - ny * OFFSET });
      }
    });
  }
  return out;
}

function isValid(level: LevelDef, routes: Vec[][], c: Vec): boolean {
  if (c.x < BOUNDS.minX || c.x > BOUNDS.maxX || c.y < BOUNDS.minY || c.y > BOUNDS.maxY) return false;
  for (const route of routes) {
    if (distToPolyline(c, route) < ROAD_CLEAR) return false;
    const entry = route[0];
    if (entry && dist(c, entry) < 130) return false;
  }
  return level.bases.every((base) => dist(c, base.pos) >= 150);
}

function coverage(samples: Vec[], c: Vec): number {
  let n = 0;
  for (const s of samples) {
    if (dist(s, c) <= COVER_RANGE) n += 1;
  }
  return n;
}

// routes are the paths actually walked by enemies
export function placePads(level: LevelDef, routes: Vec[][]): Vec[] {
  const picked = level.pads.map((p) => ({ ...p }));
  if (picked.length >= level.padTarget) return picked;
  const samples = routes.flatMap((r) => samplePolyline(r, 20));
  const scored = candidates(routes)
    .filter((c) => isValid(level, routes, c))
    .map((c) => ({ c, score: coverage(samples, c) }))
    .sort((a, b) => b.score - a.score || a.c.x - b.c.x || a.c.y - b.c.y);
  for (const { c } of scored) {
    if (picked.length >= level.padTarget) break;
    if (picked.every((p) => dist(p, c) >= PAD_SPACING)) picked.push({ x: Math.round(c.x), y: Math.round(c.y) });
  }
  return picked;
}
