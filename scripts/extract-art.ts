// Cuts the game sprites out of the concept sprite sheets in art/source and copies the
// Grassland painting and the 10 level maps into src/assets. Run with: bun run art
//
// The sheets are screenshots with panel borders, labels and JPEG noise. Each sprite gets a
// cell; inside it, pixels that differ from the background (sampled at the cell corners, or
// judged by brightness and saturation on white or vignetted sheets) form a mask, thin panel
// lines are removed by a morphological opening, the blobs that reach the middle of the cell
// are merged, small enclosed holes are filled so dark metal stays opaque, and the edge is
// feathered. Glow effects (projectiles, impacts) get alpha from their brightness.

import { mkdirSync } from "node:fs";
import { OUT, SRC, convert, extractSheet, glowAlpha, load, writeRgba } from "@scripts/cutout";
import type { Box, Sheet } from "@scripts/cutout";


// Turrets use the four big rendered views from the top row of each tower sheet, the
// highest resolution art there is: front (barrel down-right), back (barrel up), left view
// (barrel pointing right) and right view (barrel pointing left).
function towerSheet(name: string, thr: number, exclude: Box[]): Sheet {
  const row = { y0: 146, y1: 274 };
  return {
    src: `${name}-tower.jpg`,
    bgMode: "flood",
    maxHole: 100000,
    thr,
    open: 1,
    close: 1,
    minArea: 150,
    exclude,
    cells: [
      { name: `${name}-front`, box: { x0: 205, y0: name === "heavy" ? 163 : row.y0, y1: row.y1, x1: 350 } },
      { name: `${name}-back`, box: { x0: 352, ...row, x1: 492 } },
      { name: `${name}-left`, box: { x0: 494, ...row, x1: 640 } },
      { name: `${name}-right`, box: { x0: 645, ...row, x1: 790 } },
    ],
  };
}

const SHEETS: Sheet[] = [
  towerSheet("basic", 60, [{ x0: 195, y0: 108, x1: 1090, y1: 159 }]),
  towerSheet("rapid", 60, [{ x0: 195, y0: 108, x1: 1090, y1: 159 }]),
  // the heavy title is two lines deep; leave a gap for the front view's top cannon
  towerSheet("heavy", 60, [{ x0: 195, y0: 108, x1: 255, y1: 170 }, { x0: 302, y0: 108, x1: 440, y1: 170 }, { x0: 440, y0: 108, x1: 1090, y1: 152 }]),
  // the three aliens from the high resolution render, the sharpest enemy art
  {
    src: "enemies-hires.jpg",
    // thin claws break off as separate blobs, so keep any big blob in the cell
    centre: 0.02,
    bgMode: "flood",
    maxHole: 300,
    thr: 75,
    open: 1,
    close: 3,
    minArea: 1500,
    cells: [
      { name: "scout", box: { x0: 66, y0: 140, x1: 352, y1: 566 }, extra: ["-resize", "360x360>"] },
      { name: "brute", box: { x0: 354, y0: 116, x1: 712, y1: 566 }, extra: ["-resize", "360x360>"] },
      { name: "overlord", box: { x0: 748, y0: 110, x1: 1214, y1: 626 }, extra: ["-resize", "400x400>"] },
    ],
  },
];

const GLOWS: { src: string; out: string; box: Box }[] = [
  { src: "basic-tower.jpg", out: "basic-proj", box: { x0: 425, y0: 628, x1: 472, y1: 672 } },
  { src: "rapid-tower.jpg", out: "rapid-proj", box: { x0: 425, y0: 628, x1: 472, y1: 672 } },
  { src: "heavy-tower.jpg", out: "heavy-proj", box: { x0: 425, y0: 628, x1: 472, y1: 672 } },
  { src: "basic-tower.jpg", out: "basic-hit", box: { x0: 522, y0: 626, x1: 572, y1: 674 } },
  { src: "rapid-tower.jpg", out: "rapid-hit", box: { x0: 522, y0: 626, x1: 572, y1: 674 } },
  { src: "heavy-tower.jpg", out: "heavy-hit", box: { x0: 522, y0: 626, x1: 572, y1: 674 } },
];

// alpha from brightness, so the sheet's navy panel behind a glow becomes fully transparent
function extractGlows(): void {
  for (const g of GLOWS) {
    const img = load(g.src);
    writeRgba(img, g.box, glowAlpha(img, g.box), `sprites/${g.out}.png`);
  }
}

// ---- the maps: the Grassland painting (title screen) and the 10 level maps ----
function maps(): void {
  convert([`${SRC}/grassland.jpg`, "-quality", "88", `${OUT}/textures/grassland.jpg`]);
  convert([`${SRC}/cyber-arena.jpg`, "-quality", "90", `${OUT}/textures/cyber-arena.jpg`]);
  for (let i = 1; i <= 10; i++) {
    convert([`${SRC}/maps/level-${i}.png`, "-quality", "90", `${OUT}/maps/level-${i}.jpg`]);
  }
}

// a build pad cut from the level 1 map with a soft oval mask, for the extra pads the game
// adds on levels whose painting has too few; it matches the painted pads exactly
function pad(): void {
  convert([
    `${SRC}/maps/level-1.png`, "-crop", "200x130+612+113", "+repage",
    "(", "-size", "200x130", "xc:black", "-fill", "white", "-draw", "ellipse 100,65 93,58 0,360", "-blur", "0x4", ")",
    "-alpha", "off", "-compose", "CopyOpacity", "-composite",
    `${OUT}/sprites/pad.png`,
  ]);
}

function titan(): void {
  // the Hive Titan boss: the Overlord render hue-shifted to toxic green
  convert([`${OUT}/sprites/overlord.png`, "-modulate", "105,125,40", `${OUT}/sprites/titan.png`]);
}

for (const dir of ["sprites", "textures", "maps"]) mkdirSync(`${OUT}/${dir}`, { recursive: true });
let count = 0;
for (const sheet of SHEETS) count += extractSheet(sheet).length;
extractGlows();
titan();
maps();
pad();
console.log(`extracted ${count + GLOWS.length + 1} sprites, the Grassland painting and 10 level maps`);
