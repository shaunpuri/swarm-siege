// Cuts the Cyber Arena art out of its sheets in art/source/sheets: the enemies (Cyber Stalker,
// Siege Breaker, Phase Wraith) from their 3D model view rows, the final boss (the Transformer
// Overlord) in car form, robot form and the eight frames of its car to robot transformation,
// the Cyber Arena tower at its three levels (Electric Arc, Drone Swarm Generator, Quantum
// Singularity Tower) and the base at its three levels (Nexus Core, Robot Deployment, Factory
// Carrier). Every sheet has a dark panel background, so a border flood fill separates the
// art. Run with: bun run art

import { mkdirSync } from "node:fs";
import { OUT, convert, extractSheet } from "@scripts/cutout";
import type { Box, Cell, Sheet } from "@scripts/cutout";

type Span = [number, number];

function sheet(src: string, cells: Cell[], opts: Partial<Sheet> = {}): Sheet {
  return { src: `sheets/${src}.jpg`, centre: 0.05, bgMode: "flood", floodStep: 8, maxHole: 400, thr: 50, peel: 40, open: 1, close: 2, minArea: 500, cells, ...opts };
}

function row(name: string, y: Span, views: Record<string, Span>): Cell[] {
  return Object.entries(views).map(([view, x]) => ({ name: `cyber/${name}-${view}`, box: { x0: x[0], y0: y[0], x1: x[1], y1: y[1] } }));
}

const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 });

// cells in sheet pixels (1536x1024); rows stop just above the view labels
const ENEMIES: Sheet[] = [
  sheet("cyber-stalker", row("stalker", [145, 352], { front: [12, 330], back: [336, 510], side: [516, 704] })),
  sheet("cyber-siege", row("siege", [150, 360], { front: [12, 318], back: [322, 524], side: [528, 744] })),
  sheet("cyber-wraith", row("wraith", [158, 372], { front: [12, 266], back: [272, 468], side: [474, 660] })),
];

// the boss: car views, robot views and the transformation strip
const BOSS: Sheet = sheet("cyber-boss", [
  ...row("boss-car", [168, 300], { front: [516, 700], back: [710, 886] }),
  ...row("boss-car", [336, 436], { side: [516, 700] }),
  { name: "cyber/boss-robot-front", box: box(906, 168, 1218, 545) },
  { name: "cyber/boss-robot-back", box: box(1380, 168, 1526, 338) },
  { name: "cyber/boss-robot-side", box: box(1228, 372, 1370, 545) },
  ...[
    [14, 160],
    [166, 326],
    [332, 510],
    [516, 706],
    [712, 910],
    [916, 1116],
    [1122, 1336],
    [1342, 1530],
  ].map(([x0 = 0, x1 = 0], i): Cell => ({ name: `cyber/boss-morph-${i + 1}`, box: box(x0, 590, x1, 718) })),
]);

// one render per level, barrel up and to the right where it has one (mirrored in game when
// the target is on the left)
const TOWERS: Sheet[] = [
  sheet("cyber-tower-1", [{ name: "cyber/tower-1", box: box(682, 168, 864, 378) }]),
  sheet("cyber-tower-2", [{ name: "cyber/tower-2", box: box(14, 158, 236, 362) }]),
  sheet("cyber-tower-3", [{ name: "cyber/tower-3", box: box(14, 92, 466, 498) }], { exclude: [box(0, 495, 160, 540)], thr: 60, maxHole: 2000 }),
];

const BASES: Sheet[] = [1, 2, 3].map((l) => sheet(`cyber-base-${l}`, [{ name: `bases/cyber-${l}`, box: l === 1 ? box(800, 222, 1036, 378) : box(886, 238, 1100, 378) }], { maxHole: 1500, minArea: 2000, peel: 60, peelGrey: true }));

// Level 2's model is drawn almost the same as Level 1; what sets it apart on its sheet are the
// Robodog and Roller Robot it deploys. Cut both from the sheet's "deployed units" panel and set
// them in front of the base, as in the sheet's hero render.
const UNITS: Sheet = sheet("cyber-base-2", [
  { name: "bases/cyber-2-dog", box: box(1090, 636, 1300, 800) },
  { name: "bases/cyber-2-roller", box: box(1310, 636, 1522, 800) },
], { minArea: 2000, maxHole: 800 });

mkdirSync(`${OUT}/sprites/cyber`, { recursive: true });
mkdirSync(`${OUT}/sprites/bases`, { recursive: true });
let count = 0;
for (const s of [...ENEMIES, BOSS, ...TOWERS, ...BASES, UNITS]) count += extractSheet(s).length;
console.log(`extracted ${count} cyber arena sprites`);

// compose Level 2: base front view, the Robodog at the front left, the Roller at the front right
const B = `${OUT}/sprites/bases`;
const [bw = 216, bh = 142] = new TextDecoder().decode(convert([`${B}/cyber-2.png`, "-format", "%w %h", "info:"])).trim().split(" ").map(Number);
convert([
  `${B}/cyber-2.png`, "-background", "none", "-gravity", "south", "-extent", `${Math.round(bw * 1.15)}x${Math.round(bh * 1.1)}`,
  "(", `${B}/cyber-2-dog.png`, "-resize", "38%", ")", "-gravity", "southwest", "-geometry", "+6+0", "-composite",
  "(", `${B}/cyber-2-roller.png`, "-resize", "30%", ")", "-gravity", "southeast", "-geometry", "+8+0", "-composite",
  `${B}/cyber-2.png`,
]);
console.log("composed the Level 2 base with its Robodog and Roller");
