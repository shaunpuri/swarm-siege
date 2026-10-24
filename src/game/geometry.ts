import type { Entry, Route, Vec } from "@/types";

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function angleTo(from: Vec, to: Vec): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

// iterate consecutive point pairs without index access
export function eachSegment(points: Vec[], fn: (a: Vec, b: Vec) => void): void {
  let prev: Vec | null = null;
  for (const pt of points) {
    if (prev) fn(prev, pt);
    prev = pt;
  }
}

// distance an enemy covers while inside a portal: a short beat of invisibility
export const JUMP_LEN = 36;

export function buildRoute(points: Vec[], baseIndex: number, jumps: Set<number> = new Set(), entry: Entry = "tunnel"): Route {
  const segLens: number[] = [];
  eachSegment(points, (a, b) => segLens.push(jumps.has(segLens.length) ? JUMP_LEN : dist(a, b)));
  const cum: number[] = [0];
  for (const l of segLens) cum.push((cum[cum.length - 1] ?? 0) + l);
  return { points, segLens, cum, length: cum[cum.length - 1] ?? 0, baseIndex, jumps, entry };
}

// smooths a route leg by leg: the hops between portals (raw waypoint i to i + 1 for each i
// in jumps) stay straight jumps, and their segment indices are mapped to the smoothed path
export function smoothLegs(points: Vec[], jumps: number[]): { points: Vec[]; jumps: Set<number> } {
  const cuts = [...jumps].sort((a, b) => a - b);
  const out: Vec[] = [];
  const segs = new Set<number>();
  let start = 0;
  for (const cut of [...cuts, points.length - 1]) {
    const leg = smoothPath(points.slice(start, cut + 1));
    if (out.length > 0) segs.add(out.length - 1);
    out.push(...leg);
    start = cut + 1;
  }
  return { points: out, jumps: segs };
}

// position and heading at distance d along the route (binary search over cumulative lengths);
// warp is 0 on the road and rises to 1 midway through a portal hop
export function pointAt(route: Route, d: number): { pos: Vec; angle: number; warp: number } {
  const target = clamp(d, 0, route.length);
  let lo = 0;
  let hi = route.segLens.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((route.cum[mid] ?? 0) <= target) lo = mid;
    else hi = mid - 1;
  }
  const a = route.points[lo];
  const b = route.points[lo + 1];
  if (!a || !b) {
    const only = route.points[0] ?? { x: 0, y: 0 };
    return { pos: { ...only }, angle: 0, warp: 0 };
  }
  const len = route.segLens[lo] ?? 0;
  const t = len === 0 ? 0 : clamp((target - (route.cum[lo] ?? 0)) / len, 0, 1);
  if (route.jumps.has(lo)) return { pos: { ...(t < 0.5 ? a : b) }, angle: angleTo(a, b), warp: Math.sin(Math.PI * t) };
  return { pos: { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }, angle: angleTo(a, b), warp: 0 };
}

// centripetal Catmull-Rom through the waypoints, sampled every `step` px, so roads curve
// smoothly like the concept art while still passing through every authored waypoint
export function smoothPath(points: Vec[], step = 8): Vec[] {
  if (points.length < 3) return points.map((p) => ({ ...p }));
  const at = (i: number): Vec => points[Math.max(0, Math.min(points.length - 1, i))] ?? { x: 0, y: 0 };
  const out: Vec[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const n = Math.max(1, Math.ceil(dist(p1, p2) / step));
    for (let k = 0; k < n; k++) out.push(catmull(p0, p1, p2, p3, k / n));
  }
  out.push({ ...at(points.length - 1) });
  return out;
}

function catmull(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const knot = (a: Vec, b: Vec): number => Math.max(1e-4, Math.sqrt(dist(a, b)));
  const t1 = knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const mix = (a: Vec, b: Vec, ta: number, tb: number): Vec => {
    const w = tb === ta ? 0 : (u - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
  };
  const a1 = mix(p0, p1, 0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, 0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(p, a);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq, 0, 1);
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

export function distToPolyline(p: Vec, points: Vec[]): number {
  let best = Infinity;
  eachSegment(points, (a, b) => {
    best = Math.min(best, distToSegment(p, a, b));
  });
  return best;
}

// evenly spaced samples along a polyline, used for pad scoring, bridges and tests
export function samplePolyline(points: Vec[], step: number): Vec[] {
  const out: Vec[] = [];
  eachSegment(points, (a, b) => {
    const len = dist(a, b);
    const n = Math.max(1, Math.ceil(len / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      out.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
    }
  });
  const last = points[points.length - 1];
  if (last) out.push({ ...last });
  return out;
}

// quadratic bezier point, used for vine curves
export function bezier(a: Vec, c: Vec, b: Vec, t: number): Vec {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}
