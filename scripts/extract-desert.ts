// Cuts the Desert World enemies (Chameleon, Scorpion King, Sandman, and the final boss the
// Mummy King) out of their sprite sheets in art/source/sheets: the front, back and left
// renders from each sheet's orthographic / multi-view panel. The panels are dark, so the same
// border flood fill as the Aqua Realm sheets separates the sandy creatures. Run with: bun run art

import { mkdirSync } from "node:fs";
import { OUT, extractSheet } from "@scripts/cutout";
import type { Box, Cell, Sheet } from "@scripts/cutout";

type Views = { front: [number, number]; back: [number, number]; side: [number, number] };

// sideRows: when the side view comes from another row of the sheet
function desertSheet(name: string, rows: [number, number], views: Views, exclude: Box[] = [], thr = 110, sideRows: [number, number] = rows): Sheet {
  const cell = (view: keyof Views): Cell => {
    const r = view === "side" ? sideRows : rows;
    return { name: `desert/${name}-${view}`, box: { x0: views[view][0], y0: r[0], x1: views[view][1], y1: r[1] } };
  };
  return {
    src: `sheets/${name}.jpg`,
    centre: 0.05,
    bgMode: "flood",
    floodStep: 30,
    maxHole: 400,
    thr,
    open: 1,
    close: 2,
    minArea: 600,
    exclude,
    cells: [cell("front"), cell("back"), cell("side")],
  };
}

// cells in sheet pixels; rows stop just above each view's label
const SHEETS: Sheet[] = [
  // the sheet's left view of the Chameleon has a curled tail at both ends; its right view
  // (second row) is drawn correctly, so that is the side view
  desertSheet("chameleon", [118, 252], { front: [600, 762], back: [768, 935], side: [582, 872] }, [], 110, [286, 418]),
  desertSheet("scorpion-king", [112, 286], { front: [622, 806], back: [812, 1003], side: [1004, 1206] }),
  desertSheet("sandman", [106, 338], { front: [584, 760], back: [760, 914], side: [914, 1066] }),
  // the gap between the Mummy King's legs is a dim brown close to its wrappings: a looser
  // threshold lets the flood fill reach into it, once the lit floor strip between the feet
  // (which seals the gap off) is excluded
  desertSheet("mummy-king", [92, 338], { front: [528, 702], back: [704, 870], side: [870, 1012] }, [{ x0: 575, y0: 312, x1: 650, y1: 338 }], 150),
];

mkdirSync(`${OUT}/sprites/desert`, { recursive: true });
let count = 0;
for (const sheet of SHEETS) count += extractSheet(sheet).length;
console.log(`extracted ${count} desert enemy views`);

// the Desert tower at its three levels (Sun Reflector, Flame Cannon, Cactus Sand Mortar): the
// orthographic view from each tower's own sheet (front for the reflector dish, the right view
// with the barrel raised for the cannon and the mortar), on the sheets' dark panels
function towerSheet(level: number, box: Box): Sheet {
  return { src: `sheets/desert-tower-${level}.jpg`, centre: 0.05, bgMode: "flood", floodStep: 10, maxHole: 300, thr: 60, open: 1, close: 2, minArea: 600, cells: [{ name: `desert/tower-${level}`, box, extra: ["-filter", "Lanczos", "-resize", "160%"] }] };
}
const TOWERS: Sheet[] = [towerSheet(1, { x0: 548, y0: 142, x1: 694, y1: 304 }), towerSheet(2, { x0: 890, y0: 152, x1: 1020, y1: 306 }), towerSheet(3, { x0: 846, y0: 142, x1: 970, y1: 282 })];
console.log(`extracted ${TOWERS.flatMap(extractSheet).length} desert tower levels`);

// every level from four sides (each tower's own orthographic row), so turrets show the side
// facing their target and the three levels read clearly apart
type Four = Record<"front" | "back" | "left" | "right", [number, number]>;
const SIDE_VIEWS: [number, number, number, Four][] = [
  [1, 140, 300, { front: [548, 694], back: [704, 850], left: [858, 988], right: [1000, 1146] }],
  [2, 150, 304, { front: [500, 632], back: [636, 762], left: [764, 892], right: [894, 1022] }],
  [3, 140, 280, { front: [454, 588], back: [592, 712], left: [716, 838], right: [846, 968] }],
];
const SIDES: Sheet[] = SIDE_VIEWS.map(([level, y0, y1, views]) => ({
  src: `sheets/desert-tower-${level}.jpg`,
  centre: 0.05,
  bgMode: "flood",
  floodStep: 10,
  maxHole: 300,
  thr: 60,
  open: 1,
  close: 2,
  minArea: 600,
  cells: Object.entries(views).map(([view, [x0, x1]]) => ({ name: `desert/tower-${level}-${view}`, box: { x0, y0, x1, y1 }, extra: ["-filter", "Lanczos", "-resize", "160%"] })),
}));
console.log(`extracted ${SIDES.flatMap(extractSheet).length} desert tower views`);

// the Ancient Temple Sanctuary base at its three levels (Sand Outpost, Sun Temple, Ancient
// Temple Sanctuary): the front views in the orthographic rows, scaled up 2x
const BASE: Sheet = {
  src: "sheets/desert-base.jpg",
  centre: 0.05,
  bgMode: "flood",
  floodStep: 10,
  maxHole: 200,
  thr: 70,
  open: 1,
  close: 1,
  minArea: 300,
  cells: [
    { name: "bases/desert-1", box: { x0: 12, y0: 632, x1: 106, y1: 722 }, extra: ["-filter", "Lanczos", "-resize", "200%"] },
    { name: "bases/desert-2", box: { x0: 508, y0: 624, x1: 612, y1: 722 }, extra: ["-filter", "Lanczos", "-resize", "200%"] },
    { name: "bases/desert-3", box: { x0: 1016, y0: 624, x1: 1126, y1: 722 }, extra: ["-filter", "Lanczos", "-resize", "200%"] },
  ],
};
mkdirSync(`${OUT}/sprites/bases`, { recursive: true });
console.log(`extracted ${extractSheet(BASE).length} desert base levels`);
