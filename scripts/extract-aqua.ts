// Cuts the Aqua Realm enemies (Shark, Octopus, Electric Eel, and the final boss Damyaan, the
// Serpent Lord) out of their sprite sheets in art/source/sheets: the large front, back and
// side renders from the top row of each sheet. Same dark underwater backdrop as the Cold
// Map sheets, so the same border flood fill applies. Run with: bun run art

import { mkdirSync } from "node:fs";
import { OUT, extractSheet } from "@scripts/cutout";
import type { Box, Cell, Sheet } from "@scripts/cutout";

type Views = { front: [number, number]; back: [number, number]; side: [number, number] };

function aquaSheet(name: string, rows: [number, number], views: Views, exclude: Box[] = []): Sheet {
  const cell = (view: keyof Views): Cell => ({ name: `aqua/${name}-${view}`, box: { x0: views[view][0], y0: rows[0], x1: views[view][1], y1: rows[1] } });
  return {
    src: `sheets/${name}.jpg`,
    centre: 0.05,
    bgMode: "flood",
    floodStep: 30,
    maxHole: 400,
    thr: 130,
    open: 1,
    close: 2,
    minArea: 600,
    exclude,
    cells: [cell("front"), cell("back"), cell("side")],
  };
}

// cells in sheet pixels (1536x1024); "side" is each sheet's LEFT VIEW
const SHEETS: Sheet[] = [
  aquaSheet("shark", [128, 398], { front: [8, 212], back: [212, 344], side: [340, 612] }, [{ x0: 580, y0: 0, x1: 900, y1: 135 }]),
  aquaSheet("octopus", [150, 408], { front: [4, 240], back: [240, 440], side: [440, 632] }),
  aquaSheet("eel", [96, 418], { front: [12, 206], back: [206, 326], side: [326, 612] }, [{ x0: 500, y0: 0, x1: 900, y1: 140 }]),
  aquaSheet("damyaan", [44, 432], { front: [12, 316], back: [316, 506], side: [506, 686] }, [{ x0: 560, y0: 0, x1: 1130, y1: 84 }, { x0: 170, y0: 0, x1: 500, y1: 98 }]),
];

mkdirSync(`${OUT}/sprites/aqua`, { recursive: true });
let count = 0;
for (const sheet of SHEETS) count += extractSheet(sheet).length;
console.log(`extracted ${count} aqua enemy views`);

// the Aqua Map tower at its three levels (Tide Launcher, Current Repeater, Abyssal Cannon):
// the big renders in the top row of the aqua tower sheet, coral base included
const TOWER: Sheet = {
  src: "sheets/turret-a.jpg",
  centre: 0.1,
  bgMode: "flood",
  floodStep: 30,
  maxHole: 600,
  thr: 120,
  open: 1,
  close: 2,
  minArea: 800,
  exclude: [{ x0: 0, y0: 0, x1: 1536, y1: 132 }, { x0: 0, y0: 132, x1: 300, y1: 175 }],
  cells: [
    { name: "aqua/tower-1", box: { x0: 30, y0: 140, x1: 300, y1: 400 } },
    { name: "aqua/tower-2", box: { x0: 520, y0: 120, x1: 820, y1: 400 } },
    { name: "aqua/tower-3", box: { x0: 1030, y0: 100, x1: 1330, y1: 400 } },
  ],
};
console.log(`extracted ${extractSheet(TOWER).length} aqua tower levels`);

// the Aqua World base at its three upgrade levels (Coral Outpost, Trident Gateway, Ocean
// Palace with the mermaid): the big renders in the top row of the aqua base sheet
const BASE: Sheet = {
  src: "sheets/aqua-base.jpg",
  centre: 0.3,
  bgMode: "flood",
  floodStep: 40,
  maxHole: 3000,
  thr: 150,
  open: 1,
  close: 2,
  minArea: 3000,
  exclude: [
    { x0: 318, y0: 160, x1: 486, y1: 296 },
    { x0: 800, y0: 160, x1: 990, y1: 338 },
    { x0: 500, y0: 150, x1: 775, y1: 190 },
    { x0: 1005, y0: 150, x1: 1280, y1: 190 },
  ],
  cells: [
    { name: "bases/aqua-1", box: { x0: 20, y0: 220, x1: 340, y1: 478 } },
    { name: "bases/aqua-2", box: { x0: 486, y0: 176, x1: 845, y1: 478 } },
    { name: "bases/aqua-3", box: { x0: 990, y0: 160, x1: 1340, y1: 478 } },
  ],
};
mkdirSync(`${OUT}/sprites/bases`, { recursive: true });
console.log(`extracted ${extractSheet(BASE).length} aqua base levels`);

// the Aqua tower sheet with every level from four sides (Tide Launcher, Current Repeater,
// Abyssal Cannon), so a turret shows the side facing its target
const VIEW_ROWS: Record<"front" | "back" | "left" | "right", [number, number]>[] = [
  { front: [16, 112], back: [116, 214], left: [216, 314], right: [314, 412] },
  { front: [526, 618], back: [624, 720], left: [722, 820], right: [824, 922] },
  { front: [1028, 1124], back: [1126, 1224], left: [1224, 1322], right: [1326, 1426] },
];
const VIEWS: Sheet = {
  src: "sheets/aqua-towers.jpg",
  centre: 0.05,
  bgMode: "flood",
  floodStep: 16,
  maxHole: 150,
  thr: 95,
  peel: 60,
  open: 1,
  close: 2,
  minArea: 400,
  cells: VIEW_ROWS.flatMap((row, i) => Object.entries(row).map(([view, [x0, x1]]) => ({ name: `aqua/tower-${i + 1}-${view}`, box: { x0, y0: 382, x1, y1: 466 }, extra: ["-filter", "Lanczos", "-resize", "200%"] }))),
};
console.log(`extracted ${extractSheet(VIEWS).length} aqua tower views`);
