// Cuts the Grassland (Forest World) enemies out of their sheets in art/source/sheets: the
// Thornfang Spider, the Nightwing Harrier (an owl that flies), the Night Anaconda and the final
// boss, the Elderwood Colossus, from each sheet's orthographic views. Also cuts the pyramid
// (whole and cracked) from the Mummy King's entrance sheet, for the Desert's last level. The
// panels are dark slate, so the border flood fill separates the creatures.
// Run with: bun run art

import { mkdirSync } from "node:fs";
import { OUT, convert, extractSheet, load, px } from "@scripts/cutout";
import type { Box, Cell, Sheet } from "@scripts/cutout";

function sheet(src: string, cells: Cell[], opts: Partial<Sheet> = {}): Sheet {
  return { src: `sheets/${src}.jpg`, centre: 0.05, bgMode: "flood", floodStep: 9, maxHole: 300, thr: 62, peel: 60, peelGrey: true, open: 1, close: 2, minArea: 500, cells, ...opts };
}

const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 });
const cell = (name: string, b: Box): Cell => ({ name: `forest/${name}`, box: b });

// cells in sheet pixels (1536x1024), stopping above each view's label
const SHEETS: Sheet[] = [
  sheet("forest-spider", [cell("spider-front", box(898, 40, 1218, 220)), cell("spider-back", box(1228, 40, 1522, 220)), cell("spider-side", box(898, 254, 1218, 418))]),
  sheet("forest-harrier", [cell("harrier-front", box(730, 38, 962, 204)), cell("harrier-back", box(972, 38, 1204, 204)), cell("harrier-side", box(730, 232, 958, 392))]),
  // the anaconda: its head-on view, its tail view, and the full body side view (very long)
  sheet("forest-anaconda", [cell("anaconda-front", box(820, 70, 1180, 206)), cell("anaconda-back", box(1190, 70, 1520, 206)), cell("anaconda-side", box(822, 248, 1516, 334))]),
  sheet("forest-colossus", [cell("colossus-front", box(592, 40, 796, 338)), cell("colossus-back", box(802, 40, 992, 338)), cell("colossus-side", box(998, 40, 1132, 338))], { maxHole: 900, minArea: 2000 }),
];

mkdirSync(`${OUT}/sprites/forest`, { recursive: true });
let count = 0;
for (const s of SHEETS) count += extractSheet(s).length;
console.log(`extracted ${count} forest enemy views`);

// The pyramid is a clean triangle in the first two frames of the entrance sheet (whole, then
// cracked with golden light), so it is cut with a triangle mask rather than a flood fill.
type Tri = { apex: [number, number]; left: [number, number]; right: [number, number] };

function cutTriangle(src: string, frame: Box, tri: Tri, out: string): void {
  const img = load(src);
  const w = frame.x1 - frame.x0;
  const h = frame.y1 - frame.y0;
  const buf = new Uint8Array(w * h * 4);
  const [ax, ay] = tri.apex;
  const [lx, ly] = tri.left;
  const [rx, ry] = tri.right;
  // signed area tests, softened over ~1.5px for a clean edge
  const edge = (x0: number, y0: number, x1: number, y1: number, x: number, y: number): number => ((x1 - x0) * (y - y0) - (y1 - y0) * (x - x0)) / Math.hypot(x1 - x0, y1 - y0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = frame.x0 + x;
      const sy = frame.y0 + y;
      const d = Math.min(edge(ax, ay, rx, ry, sx, sy), edge(rx, ry, lx, ly, sx, sy), edge(lx, ly, ax, ay, sx, sy));
      const o = (y * w + x) * 4;
      buf[o] = px(img, sx, sy, 0);
      buf[o + 1] = px(img, sx, sy, 1);
      buf[o + 2] = px(img, sx, sy, 2);
      buf[o + 3] = Math.round(Math.max(0, Math.min(1, d / 1.5 + 0.5)) * 255);
    }
  }
  convert(["-size", `${w}x${h}`, "-depth", "8", "rgba:-", "-trim", "+repage", `${OUT}/sprites/${out}`], buf);
}

const PYRAMID: Tri = { apex: [272, 14], left: [102, 200], right: [446, 196] };
mkdirSync(`${OUT}/sprites/desert`, { recursive: true });
cutTriangle("sheets/mummy-entrance.jpg", box(8, 8, 508, 290), PYRAMID, "desert/pyramid.png");
cutTriangle("sheets/mummy-entrance.jpg", box(520, 8, 1020, 290), { apex: [PYRAMID.apex[0] + 512, PYRAMID.apex[1]], left: [PYRAMID.left[0] + 512, PYRAMID.left[1]], right: [PYRAMID.right[0] + 512, PYRAMID.right[1]] }, "desert/pyramid-cracked.png");
console.log("cut the pyramid (whole and cracked)");

// The Forest World tower at its three levels (Mud Mortar, Wildwood Repeater, Worldroot
// Guardian), each from four sides, so a turret shows the side facing its target as it turns
const TOWER_VIEWS: [number, number, Record<"front" | "back" | "left" | "right", [number, number]>][] = [
  [40, 216, { front: [676, 836], back: [846, 996], left: [1004, 1150], right: [1160, 1324] }],
  [40, 206, { front: [594, 774], back: [782, 960], left: [968, 1146], right: [1154, 1332] }],
  [40, 220, { front: [610, 804], back: [812, 996], left: [1002, 1168], right: [1176, 1330] }],
];
const TOWERS: Sheet[] = TOWER_VIEWS.map(([y0, y1, views], i) =>
  sheet(
    `forest-tower-${i + 1}`,
    Object.entries(views).map(([view, [x0, x1]]) => ({ name: `forest/tower-${i + 1}-${view}`, box: box(x0, y0, x1, y1), extra: ["-filter", "Lanczos", "-resize", "150%"] })),
    { maxHole: 200, minArea: 1500 },
  ),
);
console.log(`extracted ${TOWERS.flatMap(extractSheet).length} forest tower views`);

// the Forest World base at its three levels (Seedling Sanctuary, Elderwood Fortress, Ancient
// Root Forge): the front views from the orthographic rows, scaled up 2x
const BASE: Sheet = sheet(
  "forest-base",
  [
    { name: "bases/forest-1", box: box(16, 366, 96, 448), extra: ["-filter", "Lanczos", "-resize", "200%"] },
    { name: "bases/forest-2", box: box(458, 366, 548, 448), extra: ["-filter", "Lanczos", "-resize", "200%"] },
    { name: "bases/forest-3", box: box(916, 366, 1030, 448), extra: ["-filter", "Lanczos", "-resize", "200%"] },
  ],
  { maxHole: 100, minArea: 300, thr: 80, floodStep: 16, peel: 40 },
);
mkdirSync(`${OUT}/sprites/bases`, { recursive: true });
console.log(`extracted ${extractSheet(BASE).length} forest base levels`);
