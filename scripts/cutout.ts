// Sprite cut-out library shared by the art scripts (extract-art.ts). Sheets are screenshots
// with panel borders, labels and JPEG noise. Each sprite gets a cell; inside it, pixels that
// differ from the background (sampled at the cell corners, judged by brightness and
// saturation, or flood-filled from the cell border through smooth gradients) form a mask,
// thin panel lines are removed by a morphological opening, the blobs that reach the middle
// of the cell are merged, small enclosed holes are filled so dark metal stays opaque, and
// the edge is feathered. Glow effects get alpha from their brightness.


export const SRC = `${import.meta.dir}/../art/source`;
export const OUT = `${import.meta.dir}/../src/assets`;

export type Img = { data: Uint8Array; w: number; h: number };
export type Box = { x0: number; y0: number; x1: number; y1: number };
type Blob = Box & { area: number; pixels: Int32Array };

export function convert(args: string[], stdin?: Uint8Array): Uint8Array {
  const proc = Bun.spawnSync(["convert", ...args], { stdin: stdin ?? "ignore", stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) throw new Error(`convert ${args.join(" ")}\n${proc.stderr.toString()}`);
  return proc.stdout;
}

export function load(name: string): Img {
  const path = `${SRC}/${name}`;
  const [w = 0, h = 0] = new TextDecoder().decode(convert([path, "-format", "%w %h", "info:"])).trim().split(" ").map(Number);
  return { data: convert([path, "-depth", "8", "rgb:-"]), w, h };
}

export function px(img: Img, x: number, y: number, ch: number): number {
  return img.data[(y * img.w + x) * 3 + ch] ?? 0;
}

function bgColor(img: Img, x: number, y: number): [number, number, number] {
  return [px(img, x, y, 0), px(img, x, y, 1), px(img, x, y, 2)];
}

// 1 where the pixel is clearly not background
function foreground(img: Img, bg: [number, number, number], thr: number): Uint8Array {
  const m = new Uint8Array(img.w * img.h);
  for (let i = 0; i < img.w * img.h; i++) {
    const dr = (img.data[i * 3] ?? 0) - bg[0];
    const dg = (img.data[i * 3 + 1] ?? 0) - bg[1];
    const db = (img.data[i * 3 + 2] ?? 0) - bg[2];
    m[i] = Math.hypot(dr, dg, db) > thr ? 1 : 0;
  }
  return m;
}

// for sheets whose background is not one flat colour (blurred page behind a white sheet,
// vignetted dark renders): background = bright-or-dark AND unsaturated
export type BgMode = "corner" | "light" | "dark" | "flood" | "snowflood";

// magic-wand background: grow from the cell border through dark pixels whose colour changes
// only gradually from their neighbour. Vignettes and glows behind a sprite are smooth, a
// sprite's outline is a sharp step, so the fill stops at the outline even where the
// sprite's dark metal is as dark as the background.
// "snowflood" is the same fill over a light snowy backdrop: it spreads through bright,
// unsaturated pixels (snow, frost, pale rocks) and stops at dark metal and saturated glows.
function foregroundByFlood(img: Img, limit: number, maxStep: number, light = false): Uint8Array {
  const n = img.w * img.h;
  const bg = new Uint8Array(n);
  const at = (i: number, ch: number): number => img.data[i * 3 + ch] ?? 0;
  const tone = (i: number): number => Math.max(at(i, 0), at(i, 1), at(i, 2));
  const sat = (i: number): number => tone(i) - Math.min(at(i, 0), at(i, 1), at(i, 2));
  const isBg = (i: number): boolean => (light ? tone(i) >= limit && sat(i) <= 160 : tone(i) <= limit);
  const stack: number[] = [];
  const seed = (i: number): void => {
    if (bg[i] === 0 && isBg(i)) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < img.w; x++) {
    seed(x);
    seed((img.h - 1) * img.w + x);
  }
  for (let y = 0; y < img.h; y++) {
    seed(y * img.w);
    seed(y * img.w + img.w - 1);
  }
  while (stack.length > 0) {
    const i = stack.pop() ?? 0;
    const x = i % img.w;
    for (const j of [x > 0 ? i - 1 : -1, x < img.w - 1 ? i + 1 : -1, i - img.w, i + img.w]) {
      if (j < 0 || j >= n || bg[j] === 1 || !isBg(j)) continue;
      const step = Math.abs(at(i, 0) - at(j, 0)) + Math.abs(at(i, 1) - at(j, 1)) + Math.abs(at(i, 2) - at(j, 2));
      if (step > maxStep) continue;
      bg[j] = 1;
      stack.push(j);
    }
  }
  const fg = new Uint8Array(n);
  for (let i = 0; i < n; i++) fg[i] = bg[i] === 1 ? 0 : 1;
  return fg;
}

function foregroundByTone(img: Img, mode: "light" | "dark", thr: number): Uint8Array {
  const m = new Uint8Array(img.w * img.h);
  for (let i = 0; i < img.w * img.h; i++) {
    const r = img.data[i * 3] ?? 0;
    const g = img.data[i * 3 + 1] ?? 0;
    const b = img.data[i * 3 + 2] ?? 0;
    const max = Math.max(r, g, b);
    const sat = max - Math.min(r, g, b);
    const isBg = mode === "light" ? max > thr && sat < 34 : max < thr && sat < 26;
    m[i] = isBg ? 0 : 1;
  }
  return m;
}

function morph(m: Uint8Array, w: number, h: number, r: number, grow: boolean): Uint8Array {
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let hit = !grow;
      for (let dy = -r; dy <= r && hit !== grow; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          const v = xx >= 0 && yy >= 0 && xx < w && yy < h ? (m[yy * w + xx] ?? 0) : 0;
          if (grow && v === 1) {
            hit = true;
            break;
          }
          if (!grow && v === 0) {
            hit = false;
            break;
          }
        }
      }
      out[y * w + x] = hit ? 1 : 0;
    }
  }
  return out;
}

function blobsIn(m: Uint8Array, w: number, band: Box): Blob[] {
  const seen = new Uint8Array(m.length);
  const blobs: Blob[] = [];
  for (let y = band.y0; y < band.y1; y++) {
    for (let x = band.x0; x < band.x1; x++) {
      const start = y * w + x;
      if (m[start] !== 1 || seen[start] === 1) continue;
      const stack = [start];
      const pixels: number[] = [];
      seen[start] = 1;
      let bx0 = x, by0 = y, bx1 = x, by1 = y;
      while (stack.length > 0) {
        const i = stack.pop() ?? 0;
        pixels.push(i);
        const cx = i % w;
        const cy = Math.floor(i / w);
        bx0 = Math.min(bx0, cx);
        bx1 = Math.max(bx1, cx);
        by0 = Math.min(by0, cy);
        by1 = Math.max(by1, cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + (dx ?? 0);
          const ny = cy + (dy ?? 0);
          if (nx < band.x0 || ny < band.y0 || nx >= band.x1 || ny >= band.y1) continue;
          const j = ny * w + nx;
          if (m[j] === 1 && seen[j] === 0) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
      blobs.push({ x0: bx0, y0: by0, x1: bx1, y1: by1, area: pixels.length, pixels: Int32Array.from(pixels) });
    }
  }
  return blobs;
}

// enclosed holes larger than maxHole are background showing through (gaps between legs),
// smaller ones are dark detail inside the sprite and stay opaque
function clearBigHoles(inside: Uint8Array, outside: Uint8Array, bw: number, maxHole: number): void {
  const seen = new Uint8Array(inside.length);
  for (let start = 0; start < inside.length; start++) {
    if (inside[start] === 1 || outside[start] === 1 || seen[start] === 1) continue;
    const hole: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const i = stack.pop() ?? 0;
      hole.push(i);
      const x = i % bw;
      for (const j of [x > 0 ? i - 1 : -1, x < bw - 1 ? i + 1 : -1, i - bw, i + bw]) {
        if (j < 0 || j >= inside.length || seen[j] === 1 || inside[j] === 1 || outside[j] === 1) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    if (hole.length > maxHole) for (const i of hole) outside[i] = 1;
  }
}

// alpha mask for one blob: its pixels plus enclosed holes, feathered by one pixel
function blobAlpha(blob: Blob, w: number, pad: number, maxHole: number): { box: Box; alpha: Float32Array } {
  const box = { x0: blob.x0 - pad, y0: blob.y0 - pad, x1: blob.x1 + pad, y1: blob.y1 + pad };
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  const inside = new Uint8Array(bw * bh);
  for (const i of blob.pixels) inside[(Math.floor(i / w) - box.y0) * bw + ((i % w) - box.x0)] = 1;
  // flood the outside from the border; anything not reached and not inside is a hole
  const outside = new Uint8Array(bw * bh);
  const stack: number[] = [];
  for (let x = 0; x < bw; x++) stack.push(x, (bh - 1) * bw + x);
  for (let y = 0; y < bh; y++) stack.push(y * bw, y * bw + bw - 1);
  while (stack.length > 0) {
    const i = stack.pop() ?? 0;
    if (outside[i] === 1 || inside[i] === 1) continue;
    outside[i] = 1;
    const x = i % bw;
    const y = Math.floor(i / bw);
    if (x > 0) stack.push(i - 1);
    if (x < bw - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - bw);
    if (y < bh - 1) stack.push(i + bw);
  }
  clearBigHoles(inside, outside, bw, maxHole);
  const alpha = new Float32Array(bw * bh);
  for (let i = 0; i < alpha.length; i++) alpha[i] = outside[i] === 1 ? 0 : 1;
  const soft = new Float32Array(alpha.length);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) continue;
          sum += alpha[yy * bw + xx] ?? 0;
          n += 1;
        }
      }
      soft[y * bw + x] = (alpha[y * bw + x] ?? 0) === 0 ? 0 : sum / n;
    }
  }
  return { box, alpha: soft };
}

export function writeRgba(img: Img, box: Box, alpha: Float32Array | null, out: string, extra: string[] = []): void {
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  const buf = new Uint8Array(bw * bh * 4);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const sx = Math.max(0, Math.min(img.w - 1, box.x0 + x));
      const sy = Math.max(0, Math.min(img.h - 1, box.y0 + y));
      const o = (y * bw + x) * 4;
      buf[o] = px(img, sx, sy, 0);
      buf[o + 1] = px(img, sx, sy, 1);
      buf[o + 2] = px(img, sx, sy, 2);
      buf[o + 3] = alpha ? Math.round((alpha[y * bw + x] ?? 0) * 255) : 255;
    }
  }
  // a light unsharp mask after any resize: crisper detail, which keeps sprites from looking
  // soft in game (several sheets only give small views that have to be scaled up)
  // the alpha edge is softened slightly so silhouettes come out smooth and anti-aliased
  // rather than stair-stepped (the masks are built per pixel)
  convert(["-size", `${bw}x${bh}`, "-depth", "8", "rgba:-", "-channel", "A", "-blur", "0x0.8", "+channel", ...extra, "-unsharp", "0x0.9+0.9+0.02", `${OUT}/${out}`], buf);
}

// One named cell per sprite. Inside a cell every significant blob is kept and merged, so a
// sprite that fragments (dark metal close to the background colour) still comes out whole,
// while label pills and neighbouring sprites are excluded by the cell bounds.
export type Cell = { name: string; box: Box; extra?: string[] };
// peel: passes of stripping the dark navy backdrop left around the outline (see peelNavy);
// peelGrey: also strip neutral grey floor and shadow (sheets on a grey studio floor);
// largest: keep only the biggest piece instead of merging every piece in the cell;
// oval: keep only what lies inside an oval filling the cell, scaled by this factor (drops
// scenery in the corners around a centred subject)
export type Sheet = { src: string; centre?: number; floodStep?: number; bgMode: BgMode; maxHole: number; thr: number; open: number; close: number; minArea: number; cells: Cell[]; exclude?: Box[]; peel?: number; peelGrey?: boolean; largest?: boolean; oval?: number };
function mergeBlobs(blobs: Blob[]): Blob | null {
  const first = blobs[0];
  if (!first) return null;
  const merged: Blob = { x0: first.x0, y0: first.y0, x1: first.x1, y1: first.y1, area: 0, pixels: new Int32Array(0) };
  const parts: number[] = [];
  for (const b of blobs) {
    merged.x0 = Math.min(merged.x0, b.x0);
    merged.y0 = Math.min(merged.y0, b.y0);
    merged.x1 = Math.max(merged.x1, b.x1);
    merged.y1 = Math.max(merged.y1, b.y1);
    merged.area += b.area;
    for (const p of b.pixels) parts.push(p);
  }
  merged.pixels = Int32Array.from(parts);
  return merged;
}

function subImage(img: Img, b: Box): Img {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let ch = 0; ch < 3; ch++) data[(y * w + x) * 3 + ch] = px(img, b.x0 + x, b.y0 + y, ch);
    }
  }
  return { data, w, h };
}

// background = per-channel median of the four cell corners, so gradients and
// panel tints around each sprite are handled locally
function cornerBg(img: Img): [number, number, number] {
  const corners = [bgColor(img, 2, 2), bgColor(img, img.w - 3, 2), bgColor(img, 2, img.h - 3), bgColor(img, img.w - 3, img.h - 3)];
  const median = (ch: number): number => {
    const v = corners.map((c) => c[ch] ?? 0).sort((a, b) => a - b);
    return ((v[1] ?? 0) + (v[2] ?? 0)) / 2;
  };
  return [median(0), median(1), median(2)];
}

// labels and panel lines hug the cell edges; the sprite always reaches the middle
function reachesCentre(b: Blob, w: number, h: number, margin: number): boolean {
  const mx = w * margin;
  const my = h * margin;
  return b.x1 >= mx && b.x0 <= w - mx && b.y1 >= my && b.y0 <= h - my;
}

// zero the mask inside a sheet-space box (titles, row labels), given the cell's origin
function clearBox(mask: Uint8Array, w: number, h: number, ex: Box, origin: Box): void {
  for (let y = Math.max(0, ex.y0 - origin.y0); y < Math.min(h, ex.y1 - origin.y0); y++) {
    for (let x = Math.max(0, ex.x0 - origin.x0); x < Math.min(w, ex.x1 - origin.x0); x++) mask[y * w + x] = 0;
  }
}

// The Cyber Arena sheets sit on a dark navy backdrop with a vignette and floor shadows that
// the flood fill only partly removes. Each pass strips outline pixels that are dark and
// bluish (navy backdrop) while leaving neutral or warm dark metal, so the fringe peels away
// without eating into the sprite.
function peelNavy(img: Img, mask: Uint8Array, passes: number, grey: boolean): Uint8Array {
  const m = Uint8Array.from(mask);
  const at = (i: number, ch: number): number => img.data[i * 3 + ch] ?? 0;
  for (let pass = 0; pass < passes; pass++) {
    const strip: number[] = [];
    for (let i = 0; i < m.length; i++) {
      if (m[i] !== 1) continue;
      const x = i % img.w;
      const edge = [x > 0 ? i - 1 : -1, x < img.w - 1 ? i + 1 : -1, i - img.w, i + img.w].some((j) => j < 0 || j >= m.length || m[j] === 0);
      if (!edge) continue;
      const r = at(i, 0);
      const g = at(i, 1);
      const b = at(i, 2);
      const max = Math.max(r, g, b);
      const navy = max <= 62 && b - r >= 8 && b >= g;
      // grey floor: unsaturated and not bright; warm brown wood or metal is left alone
      const floor = grey && max <= 100 && max - Math.min(r, g, b) <= 14 && b + 4 >= r;
      if (navy || floor) strip.push(i);
    }
    if (strip.length === 0) break;
    for (const i of strip) m[i] = 0;
  }
  return m;
}

function ovalMask(mask: Uint8Array, w: number, h: number, k: number): Uint8Array {
  const m = Uint8Array.from(mask);
  const rx = (w / 2) * k;
  const ry = (h / 2) * k;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / rx;
      const dy = (y - h / 2) / ry;
      if (dx * dx + dy * dy > 1) m[y * w + x] = 0;
    }
  }
  return m;
}

export function extractSheet(sheet: Sheet): string[] {
  const img = load(sheet.src);
  const written: string[] = [];
  for (const cell of sheet.cells) {
    const local = subImage(img, cell.box);
    let mask =
      sheet.bgMode === "corner"
        ? foreground(local, cornerBg(local), sheet.thr)
        : sheet.bgMode === "flood"
          ? foregroundByFlood(local, sheet.thr, sheet.floodStep ?? 14)
          : sheet.bgMode === "snowflood"
          ? foregroundByFlood(local, sheet.thr, sheet.floodStep ?? 14, true)
          : foregroundByTone(local, sheet.bgMode, sheet.thr);
    if (sheet.peel) mask = peelNavy(local, mask, sheet.peel, sheet.peelGrey ?? false);
    if (sheet.oval) mask = ovalMask(mask, local.w, local.h, sheet.oval);
    for (const ex of sheet.exclude ?? []) clearBox(mask, local.w, local.h, ex, cell.box);
    mask = morph(morph(mask, local.w, local.h, sheet.open, false), local.w, local.h, sheet.open, true);
    mask = morph(mask, local.w, local.h, sheet.close, true);
    const blobs = blobsIn(mask, local.w, { x0: 0, y0: 0, x1: local.w, y1: local.h }).filter((b) => b.area >= sheet.minArea && reachesCentre(b, local.w, local.h, sheet.centre ?? 0.32));
    const blob = sheet.largest ? blobs.reduce<typeof blobs[number] | undefined>((m, b) => (!m || b.area > m.area ? b : m), undefined) : mergeBlobs(blobs);
    if (!blob) throw new Error(`${sheet.src}: nothing found for ${cell.name}`);
    const { box, alpha } = blobAlpha(blob, local.w, 1, sheet.maxHole);
    writeRgba(local, box, alpha, `sprites/${cell.name}.png`, cell.extra ?? []);
    written.push(cell.name);
  }
  return written;
}

// glow effects: keep the black background, the game draws them additively
export function glowAlpha(img: Img, box: Box): Float32Array {
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  const alpha = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const v = Math.max(px(img, box.x0 + x, box.y0 + y, 0), px(img, box.x0 + x, box.y0 + y, 1), px(img, box.x0 + x, box.y0 + y, 2));
      alpha[y * bw + x] = Math.max(0, Math.min(1, (v - 40) / 90));
    }
  }
  return alpha;
}

