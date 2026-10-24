import * as THREE from "three";

// Tripo sometimes builds a stray scrap from the concept sheet into a model: a thin bar from a
// caption strip floating above a turret, a chip of the backdrop. They are small pieces that
// touch nothing. This drops every piece of a mesh that is both small (a few percent of the
// main body's triangles) and either clear of the main body's bounds or a straight thin strip,
// keeping real separate parts that sit on or inside the body (a trident in a hand, a ring
// around a core).

const SMALL = 0.04;

function find(parent: Int32Array, i: number): number {
  let r = i;
  while (parent[r] !== r) r = parent[r] ?? r;
  let n = i;
  while (parent[n] !== r) {
    const next = parent[n] ?? r;
    parent[n] = r;
    n = next;
  }
  return r;
}

// welds vertices at the same spot (meshes split them along texture seams), so a piece is one
// connected surface
function weld(pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, tolerance: number): Int32Array {
  const ids = new Int32Array(pos.count);
  const seen = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) / tolerance)},${Math.round(pos.getY(i) / tolerance)},${Math.round(pos.getZ(i) / tolerance)}`;
    const found = seen.get(key);
    if (found === undefined) seen.set(key, i);
    ids[i] = found ?? i;
  }
  return ids;
}

// a straight thin strip (the caption bars): far longer than it is wide either way
function isBar(box: THREE.Box3): boolean {
  const size = box.getSize(new THREE.Vector3());
  const sides = [size.x, size.y, size.z].sort((x, y) => y - x);
  return (sides[0] ?? 0) > (sides[1] ?? 0) * 8;
}

function cleanGeometry(geo: THREE.BufferGeometry): void {
  const pos = geo.getAttribute("position");
  const index = geo.getIndex();
  if (!index) return;
  geo.computeBoundingBox();
  const bounds = geo.boundingBox;
  if (!bounds) return;
  const span = bounds.getSize(new THREE.Vector3()).length();
  const ids = weld(pos, span * 1e-4);
  const parent = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) parent[i] = i;
  const tris = index.count / 3;
  for (let t = 0; t < tris; t++) {
    const a = find(parent, ids[index.getX(t * 3)] ?? 0);
    const b = find(parent, ids[index.getX(t * 3 + 1)] ?? 0);
    const c = find(parent, ids[index.getX(t * 3 + 2)] ?? 0);
    parent[b] = a;
    parent[find(parent, c)] = a;
  }
  // each piece's triangle count and bounds
  const pieces = new Map<number, { count: number; box: THREE.Box3 }>();
  const rootOf = new Int32Array(tris);
  const p = new THREE.Vector3();
  for (let t = 0; t < tris; t++) {
    const r = find(parent, ids[index.getX(t * 3)] ?? 0);
    rootOf[t] = r;
    let piece = pieces.get(r);
    if (!piece) {
      piece = { count: 0, box: new THREE.Box3() };
      pieces.set(r, piece);
    }
    piece.count += 1;
    for (let k = 0; k < 3; k++) piece.box.expandByPoint(p.fromBufferAttribute(pos, index.getX(t * 3 + k)));
  }
  let main: { count: number; box: THREE.Box3 } | undefined;
  for (const piece of pieces.values()) if (!main || piece.count > main.count) main = piece;
  if (!main) return;
  const body = main.box.clone().expandByScalar(span * 0.015);
  const drop = new Set<number>();
  for (const [r, piece] of pieces) if (piece.count < main.count * SMALL && (!body.intersectsBox(piece.box) || isBar(piece.box))) drop.add(r);
  if (drop.size === 0) return;
  const kept: number[] = [];
  for (let t = 0; t < tris; t++) {
    if (drop.has(rootOf[t] ?? -1)) continue;
    kept.push(index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2));
  }
  geo.setIndex(kept);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
}

export function dropIslands(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) cleanGeometry(o.geometry);
  });
}
