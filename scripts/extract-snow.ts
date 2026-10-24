// Cuts the Cold Map enemies (Snowman, Yeti, Ice Golem, Ice Dragon boss) out of their sprite
// sheets in art/source/sheets: the large front, back and side renders from the top row of
// each sheet, plus the ice explosion frames used when they die. Run with: bun run art
//
// The sheets have a dark navy backdrop with soft vignettes and icy glows, so the background
// is flood-filled from each cell border through smooth gradients ("flood" mode); a sprite's
// outline is a sharp step, so the fill stops there even where dark armour meets dark sky.

import { mkdirSync } from "node:fs";
import { OUT, extractSheet, glowAlpha, load, writeRgba } from "@scripts/cutout";
import type { Box, Cell, Sheet } from "@scripts/cutout";

type Views = { front: [number, number]; back: [number, number]; side: [number, number] };

function enemySheet(name: string, rows: [number, number], views: Views, exclude: Box[] = [], tune: { thr: number; step: number } = { thr: 82, step: 24 }): Sheet {
  const cell = (view: keyof Views): Cell => ({ name: `${name}-${view}`, box: { x0: views[view][0], y0: rows[0], x1: views[view][1], y1: rows[1] } });
  return {
    src: `sheets/${name}.jpg`,
    centre: 0.05,
    bgMode: "flood",
    floodStep: tune.step,
    maxHole: 400,
    thr: tune.thr,
    exclude,
    open: 1,
    close: 2,
    minArea: 600,
    cells: [cell("front"), cell("back"), cell("side")],
  };
}

// cells in sheet pixels (1536x1024); "side" is the view facing right
const SHEETS: Sheet[] = [
  enemySheet("snowman", [96, 354], { front: [8, 228], back: [228, 448], side: [448, 606] }),
  enemySheet("yeti", [104, 358], { front: [0, 246], back: [246, 452], side: [612, 768] }, [{ x0: 640, y0: 0, x1: 1100, y1: 126 }]),
  enemySheet("ice-golem", [104, 360], { front: [0, 246], back: [246, 446], side: [446, 604] }),
  enemySheet("ice-dragon", [82, 398], { front: [0, 252], back: [252, 438], side: [430, 614] }, [{ x0: 455, y0: 0, x1: 690, y1: 128 }], { thr: 105, step: 30 }),
];

// the Cold World Tower at its three levels (big renders on snow, top row of the turret sheet)
const TOWER: Sheet = {
  src: "sheets/turret-b.jpg",
  centre: 0.1,
  bgMode: "snowflood",
  floodStep: 26,
  maxHole: 600,
  thr: 55,
  open: 1,
  close: 2,
  minArea: 800,
  // the "COST" banners overlap the top of the renders
  exclude: [{ x0: 0, y0: 100, x1: 300, y1: 172 }, { x0: 820, y0: 100, x1: 1120, y1: 168 }],
  cells: [
    { name: "snow/tower-1", box: { x0: 12, y0: 150, x1: 248, y1: 408 } },
    { name: "snow/tower-2", box: { x0: 440, y0: 160, x1: 652, y1: 408 } },
    { name: "snow/tower-3", box: { x0: 836, y0: 118, x1: 1048, y1: 408 } },
  ],
};

// the base at its three upgrade levels (Frozen Outpost, Arctic Guard, Glacial Fortress): the big
// renders on the base sheet; the callout labels that overlap them are cut away, and only the
// base's own body is kept (loose patches of snowy scenery around it are dropped)
const BASE: Sheet = {
  src: "sheets/snow-base.jpg",
  centre: 0.3,
  bgMode: "snowflood",
  floodStep: 22,
  maxHole: 3000,
  thr: 60,
  open: 3,
  close: 2,
  minArea: 3000,
  largest: true,
  oval: 1.08,
  exclude: [
    { x0: 0, y0: 80, x1: 1536, y1: 122 },
    { x0: 449, y0: 120, x1: 650, y1: 152 },
    { x0: 940, y0: 120, x1: 1205, y1: 152 },
    { x0: 470, y0: 170, x1: 548, y1: 205 },
    { x0: 788, y0: 160, x1: 902, y1: 188 },
    { x0: 788, y0: 360, x1: 902, y1: 404 },
    { x0: 970, y0: 166, x1: 1062, y1: 206 },
    { x0: 1326, y0: 106, x1: 1434, y1: 146 },
    { x0: 1432, y0: 168, x1: 1536, y1: 210 },
    { x0: 924, y0: 292, x1: 1015, y1: 336 },
    { x0: 1432, y0: 298, x1: 1536, y1: 342 },
    // snowy rocks and crates beside the outpost and the arctic guard
    { x0: 100, y0: 190, x1: 180, y1: 290 },
    { x0: 330, y0: 250, x1: 390, y1: 330 },
    { x0: 860, y0: 230, x1: 902, y1: 330 },
    { x0: 515, y0: 120, x1: 545, y1: 175 },
  ],
  cells: [
    { name: "bases/snow-1", box: { x0: 100, y0: 190, x1: 390, y1: 412 } },
    { name: "bases/snow-2", box: { x0: 515, y0: 120, x1: 902, y1: 424 } },
    { name: "bases/snow-3", box: { x0: 975, y0: 104, x1: 1495, y1: 430 } },
  ],
};

// ice explosion, 4 frames, bottom right of the snowman sheet
const BURST: Box[] = [1068, 1200, 1332, 1464].map((cx) => ({ x0: cx - 62, y0: 818, x1: cx + 62, y1: 942 }));

mkdirSync(`${OUT}/sprites/snow`, { recursive: true });
let count = 0;
for (const sheet of SHEETS) count += extractSheet({ ...sheet, cells: sheet.cells.map((c) => ({ ...c, name: `snow/${c.name}` })) }).length;
count += extractSheet(TOWER).length;
mkdirSync(`${OUT}/sprites/bases`, { recursive: true });
count += extractSheet(BASE).length;
const burstSheet = load("sheets/snowman.jpg");
BURST.forEach((box, i) => writeRgba(burstSheet, box, glowAlpha(burstSheet, box), `sprites/snow/ice-burst-${i + 1}.png`));
console.log(`extracted ${count} snow enemy views and ${BURST.length} ice burst frames`);

// the Ice Dragon's newer, detailed model views (from its entrance sheet) replace the first
// renders: front, back, and the left view (facing right) as its side view
const DRAGON: Sheet = {
  src: "sheets/ice-dragon-entrance.jpg",
  centre: 0.05,
  bgMode: "flood",
  floodStep: 18,
  maxHole: 600,
  thr: 95,
  peel: 60,
  open: 1,
  close: 2,
  minArea: 2000,
  cells: [
    { name: "snow/ice-dragon-front", box: { x0: 8, y0: 500, x1: 228, y1: 632 }, extra: ["-filter", "Lanczos", "-resize", "150%"] },
    { name: "snow/ice-dragon-back", box: { x0: 230, y0: 500, x1: 366, y1: 632 }, extra: ["-filter", "Lanczos", "-resize", "150%"] },
    { name: "snow/ice-dragon-side", box: { x0: 368, y0: 500, x1: 510, y1: 632 }, extra: ["-filter", "Lanczos", "-resize", "150%"] },
  ],
};
console.log(`extracted ${extractSheet(DRAGON).length} ice dragon views`);
