import type { BaseKind, MapFeatures, Vec } from "@/types";

// Painting modes: every level is played on one concept painting itself, shown whole and
// scaled to the 720px playfield height. Each painting's road, painted build pads and base
// are traced in that painting's own pixels and converted here.

export type PaintingId = "grassland" | "cyber";

export type PaintingMap = {
  id: PaintingId;
  name: string;
  size: { w: number; h: number };
  road: Vec[];
  pads: Vec[];
  base: { kind: BaseKind; pos: Vec };
  // nature: wind, water and cloud shadows; neon: flicker, hologram scans, drifting smog
  style: "nature" | "neon";
  // animated spots on the painting (painting pixels): a turning globe, a flaring sign
  features: MapFeatures;
};

function convert(size: { w: number; h: number }, pts: [number, number][]): Vec[] {
  const scale = 720 / size.h;
  const offset = (1280 - size.w * scale) / 2;
  return pts.map(([x, y]) => ({ x: offset + x * scale, y: y * scale }));
}

function paintingMap(id: PaintingId, name: string, size: { w: number; h: number }, road: [number, number][], pads: [number, number][], base: [number, number], style: PaintingMap["style"], features: MapFeatures = {}): PaintingMap {
  const [pos] = convert(size, [base]);
  return { id, name, size, road: convert(size, road), pads: convert(size, pads), base: { kind: "outpost", pos: pos ?? { x: 0, y: 0 } }, style, features };
}

// Grassland painting (1280x854): the tunnel, the road over both bridges, the Outpost
const GRASSLAND = paintingMap(
  "grassland",
  "Grassland",
  { w: 1280, h: 854 },
  [
    [92, 133], [139, 161], [194, 183], [261, 194], [317, 203], [356, 228], [372, 261], [383, 289], [411, 308], [483, 322],
    [528, 328], [583, 344], [639, 372], [672, 400], [711, 422], [767, 439], [850, 448], [933, 458], [985, 488], [1033, 534],
    [1078, 567], [1110, 592], [1150, 605],
  ],
  [[403, 185], [269, 242], [672, 319], [947, 197], [989, 82], [861, 392], [247, 503], [503, 640], [964, 601]],
  [1150, 605],
  "nature",
);

// Cyber Arena painting (1600x1068): from the neon tunnel past the glass bridge to the Outpost.
// The first stretch is traced from the road surface, the curve to the Outpost by hand.
const CYBER = paintingMap(
  "cyber",
  "Cyber Arena",
  { w: 1600, h: 1068 },
  [
    [132, 172], [175, 218], [239, 265], [282, 278], [311, 281], [348, 299], [389, 299], [417, 308], [444, 334], [453, 352],
    [484, 361], [504, 389], [539, 417], [605, 422], [679, 440], [740, 480], [790, 515], [869, 535], [988, 552], [1100, 560],
    [1170, 580], [1220, 610], [1270, 655], [1330, 705], [1385, 735], [1430, 755], [1510, 765],
  ],
  [[444, 244], [679, 328], [319, 354], [1229, 513], [412, 644], [675, 800]],
  [1512, 765],
  "neon",
  {
    // the hologram globe above the central tower, and the "CYBER ARENA" billboard lettering
    globe: { x: 956, y: 108, rx: 60, ry: 57 },
    sign: { x0: 1450, y0: 250, x1: 1547, y1: 334 },
  },
);

export const PAINTINGS: Record<PaintingId, PaintingMap> = { grassland: GRASSLAND, cyber: CYBER };
