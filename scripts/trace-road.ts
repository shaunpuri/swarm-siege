// Finds the centre line of a painted road on a level map, for authoring level data.
// Usage: bun scripts/trace-road.ts <map.png> <out-prefix> "x,y x,y x,y ..."
// The points are the entrance, optional via points that pick a branch at forks, and the
// base, in map pixels. Prints the simplified centre line and writes <out-prefix>-debug.png
// with the road mask and the traced path drawn over the map so it can be checked by eye.
//
// Road pixels are the pale, unsaturated paving plus its yellow centre dashes. Small grey
// blobs (rocks) are dropped by keeping only the mask component the endpoints sit on. The
// path is a Dijkstra search whose step cost falls with distance from the road edge, so it
// hugs the middle of the road instead of cutting corners.

type Pt = { x: number; y: number };

function convert(args: string[], stdin?: Uint8Array): Uint8Array {
  const proc = Bun.spawnSync(["convert", ...args], { stdin: stdin ?? "ignore", stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
  return proc.stdout;
}

function load(path: string): { data: Uint8Array; w: number; h: number } {
  const [w = 0, h = 0] = new TextDecoder().decode(convert([path, "-format", "%w %h", "info:"])).trim().split(" ").map(Number);
  return { data: convert([path, "-depth", "8", "rgb:-"]), w, h };
}

function roadMask(img: { data: Uint8Array; w: number; h: number }): Uint8Array {
  const m = new Uint8Array(img.w * img.h);
  for (let i = 0; i < m.length; i++) {
    const r = img.data[i * 3] ?? 0;
    const g = img.data[i * 3 + 1] ?? 0;
    const b = img.data[i * 3 + 2] ?? 0;
    const max = Math.max(r, g, b);
    const sat = max - Math.min(r, g, b);
    const paving = sat <= 46 && max >= 96 && max <= 238;
    const dash = r > 190 && g > 140 && b < 110 && r - b > 100;
    m[i] = paving || dash ? 1 : 0;
  }
  return m;
}

function morph(m: Uint8Array, w: number, h: number, r: number, grow: boolean): Uint8Array {
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = grow ? 0 : 1;
      for (let dy = -r; dy <= r && v === (grow ? 0 : 1); dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          const s = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : (m[yy * w + xx] ?? 0);
          if (grow && s === 1) {
            v = 1;
            break;
          }
          if (!grow && s === 0) {
            v = 0;
            break;
          }
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

// chamfer distance to the nearest non-road pixel
function distance(m: Uint8Array, w: number, h: number): Float32Array {
  const d = new Float32Array(m.length);
  for (let i = 0; i < m.length; i++) d[i] = m[i] === 1 ? 1e6 : 0;
  const pass = (xs: number[], ys: number[], nb: [number, number, number][]): void => {
    for (const y of ys) {
      for (const x of xs) {
        const i = y * w + x;
        let best = d[i] ?? 0;
        for (const [dx, dy, c] of nb) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) {
            best = Math.min(best, c);
            continue;
          }
          best = Math.min(best, (d[yy * w + xx] ?? 0) + c);
        }
        d[i] = best;
      }
    }
  };
  const xs = Array.from({ length: w }, (_, i) => i);
  const ys = Array.from({ length: h }, (_, i) => i);
  pass(xs, ys, [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.4], [1, -1, 1.4]]);
  pass([...xs].reverse(), [...ys].reverse(), [[1, 0, 1], [0, 1, 1], [1, 1, 1.4], [-1, 1, 1.4]]);
  return d;
}

function snap(m: Uint8Array, w: number, h: number, p: Pt): Pt {
  let best = p;
  let bestD = Infinity;
  for (let y = Math.max(0, p.y - 60); y < Math.min(h, p.y + 60); y++) {
    for (let x = Math.max(0, p.x - 60); x < Math.min(w, p.x + 60); x++) {
      if (m[y * w + x] !== 1) continue;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  }
  return best;
}

const NEIGHBOURS: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]];

// binary heap Dijkstra over road pixels
function shortest(m: Uint8Array, dt: Float32Array, w: number, a: Pt, b: Pt): Pt[] {
  const n = m.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const heap: number[] = [];
  const keys: number[] = [];
  const push = (i: number, k: number): void => {
    heap.push(i);
    keys.push(k);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if ((keys[p] ?? 0) <= (keys[c] ?? 0)) break;
      [heap[p], heap[c]] = [heap[c] ?? 0, heap[p] ?? 0];
      [keys[p], keys[c]] = [keys[c] ?? 0, keys[p] ?? 0];
      c = p;
    }
  };
  const pop = (): number => {
    const top = heap[0] ?? 0;
    const lastI = heap.pop() ?? 0;
    const lastK = keys.pop() ?? 0;
    if (heap.length > 0) {
      heap[0] = lastI;
      keys[0] = lastK;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1;
        const r = l + 1;
        let s = c;
        if (l < heap.length && (keys[l] ?? 0) < (keys[s] ?? 0)) s = l;
        if (r < heap.length && (keys[r] ?? 0) < (keys[s] ?? 0)) s = r;
        if (s === c) break;
        [heap[s], heap[c]] = [heap[c] ?? 0, heap[s] ?? 0];
        [keys[s], keys[c]] = [keys[c] ?? 0, keys[s] ?? 0];
        c = s;
      }
    }
    return top;
  };
  const start = a.y * w + a.x;
  const goal = b.y * w + b.x;
  dist[start] = 0;
  push(start, 0);
  while (heap.length > 0) {
    const i = pop();
    if (i === goal) break;
    const x = i % w;
    for (const [dx, dy, len] of NEIGHBOURS) {
      if ((dx === 1 && x === w - 1) || (dx === -1 && x === 0)) continue;
      const j = i + dy * w + dx;
      if (j < 0 || j >= n) continue;
      // off-road pixels are allowed but expensive, so wooden bridges (not grey paving)
      // can be crossed while the path still sticks to the real road everywhere else
      const cost = m[j] === 1 ? len * (1 + 600 / Math.pow(1 + (dt[j] ?? 0), 2)) : len * 400;
      const nd = (dist[i] ?? 0) + cost;
      if (nd < (dist[j] ?? Infinity)) {
        dist[j] = nd;
        prev[j] = i;
        push(j, nd);
      }
    }
  }
  if (prev[goal] === -1 && goal !== start) throw new Error(`no road between ${a.x},${a.y} and ${b.x},${b.y}`);
  const path: Pt[] = [];
  for (let c = goal; c !== -1; c = prev[c] ?? -1) path.push({ x: c % w, y: Math.floor(c / w) });
  return path.reverse();
}

// Douglas-Peucker
function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const a = pts[0] ?? { x: 0, y: 0 };
  const b = pts[pts.length - 1] ?? a;
  let worst = 0;
  let index = 0;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  pts.forEach((p, i) => {
    const d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
    if (d > worst) {
      worst = d;
      index = i;
    }
  });
  if (worst <= eps) return [a, b];
  return [...simplify(pts.slice(0, index + 1), eps).slice(0, -1), ...simplify(pts.slice(index), eps)];
}

const [mapPath, outPrefix, spec] = process.argv.slice(2);
if (!mapPath || !outPrefix || !spec) throw new Error("usage: trace-road.ts <map.png> <out-prefix> \"x,y x,y ...\"");
const stops = spec.trim().split(/\s+/).map((s) => {
  const [x = 0, y = 0] = s.split(",").map(Number);
  return { x, y };
});
const img = load(mapPath);
let mask = roadMask(img);
mask = morph(morph(mask, img.w, img.h, 2, true), img.w, img.h, 2, false);
mask = morph(morph(mask, img.w, img.h, 3, false), img.w, img.h, 3, true);
const dt = distance(mask, img.w, img.h);
const snapped = stops.map((p) => snap(mask, img.w, img.h, p));
let full: Pt[] = [];
for (let i = 1; i < snapped.length; i++) {
  const a = snapped[i - 1];
  const b = snapped[i];
  if (!a || !b) continue;
  const seg = shortest(mask, dt, img.w, a, b);
  full = full.concat(i === 1 ? seg : seg.slice(1));
}
// moving average irons out pixel-level zigzags before simplifying
const smooth = full.map((_, i) => {
  const win = full.slice(Math.max(0, i - 9), Math.min(full.length, i + 10));
  return { x: Math.round(win.reduce((s, p) => s + p.x, 0) / win.length), y: Math.round(win.reduce((s, p) => s + p.y, 0) / win.length) };
});
const line = simplify(smooth, 3);
console.log(JSON.stringify(line.map((p) => [p.x, p.y])));

// debug: map dimmed where not road, path in red, stops in yellow
const out = new Uint8Array(img.w * img.h * 3);
for (let i = 0; i < img.w * img.h; i++) {
  const k = mask[i] === 1 ? 1 : 0.35;
  for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round((img.data[i * 3 + c] ?? 0) * k);
}
const draw = line.map((p, i) => (i === 0 ? "" : `line ${line[i - 1]?.x ?? 0},${line[i - 1]?.y ?? 0} ${p.x},${p.y}`)).join(" ");
const dots = stops.map((p) => `circle ${p.x},${p.y} ${p.x + 6},${p.y}`).join(" ");
convert(["-size", `${img.w}x${img.h}`, "-depth", "8", "rgb:-", "-stroke", "red", "-strokewidth", "4", "-fill", "none", "-draw", draw, "-fill", "yellow", "-stroke", "black", "-strokewidth", "1", "-draw", dots, `${outPrefix}-debug.png`], out);
