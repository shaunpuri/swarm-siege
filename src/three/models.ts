import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { Biome } from "@/types";
import { BASE_MODELS, ENEMY_MODELS, TOWER_MODELS } from "@/three/modelart";
import { dropIslands } from "@/three/islands";
import { tracked } from "@/loadprogress";

// Real 3D models of the turrets, bases and enemies, built with the Tripo API from the views on
// each concept sheet (scripts/tripo.ts) and slimmed for the web. Each is centred on its foot
// and scaled to a height of 1; width and depth keep their proportions (a snake is long and
// low), so placing one only needs a position, a size and a heading.

export type Model = { obj: THREE.Object3D; width: number; depth: number };
export type Models = { towers: Map<string, Model>; bases: Map<string, Model>; enemies: Map<string, Model> };

export function modelKey(biome: Biome, part: number | string): string {
  return `${biome}-${part}`;
}

// The painted maps are bright and saturated; Tripo's materials come out darker and more
// realistic. Lift them toward the art: less metal (metal reads dark under a sky light), more
// colour, and a glow from their own texture. Bases are big dark masses of stone and metal, so
// they get the most lift.
type Lift = { colour: number; glow: number };
export const UNIT_LIFT: Lift = { colour: 1.18, glow: 0.34 };
export const BASE_LIFT: Lift = { colour: 1.3, glow: 0.62 };

function brighten(root: THREE.Object3D, lift: Lift): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      m.metalness = Math.min(m.metalness, 0.35);
      m.roughness = Math.max(m.roughness, 0.45);
      m.color.multiplyScalar(lift.colour);
      if (m.map) {
        m.emissiveMap = m.map;
        m.emissive = new THREE.Color(0xffffff);
        m.emissiveIntensity = lift.glow;
      }
    }
  });
}

function normalize(root: THREE.Object3D): Model {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  root.position.set(-centre.x, -box.min.y, -centre.z);
  const holder = new THREE.Group();
  holder.add(root);
  const h = Math.max(0.0001, size.y);
  holder.scale.setScalar(1 / h);
  return { obj: holder, width: size.x / h, depth: size.z / h };
}

// models Tripo built standing the wrong way up, and the turn that sets them right: the Aqua
// eel came out upright on its tail, so it is laid down with its head (at the bottom) forward
// along -x like every other model
const UPRIGHT: Record<string, THREE.Euler> = { "water-overlord": new THREE.Euler(0, 0, -Math.PI / 2) };

async function loadSet(loader: GLTFLoader, urls: Record<string, string>, lift: Lift): Promise<Map<string, Model>> {
  const out = new Map<string, Model>();
  await Promise.all(
    Object.entries(urls).map(async ([key, url]) => {
      const gltf = await tracked(loader.loadAsync(url));
      brighten(gltf.scene, lift);
      dropIslands(gltf.scene);
      // turned in the mesh data itself, so the swimming bend (which works in the mesh's own
      // coordinates, head at -x) runs along the body
      const turn = UPRIGHT[key];
      if (turn) {
        const m = new THREE.Matrix4().makeRotationFromEuler(turn);
        gltf.scene.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.applyMatrix4(m);
        });
      }
      out.set(key, normalize(gltf.scene));
    }),
  );
  return out;
}

export async function loadModels(): Promise<Models> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const [towers, bases, enemies] = await Promise.all([loadSet(loader, TOWER_MODELS, UNIT_LIFT), loadSet(loader, BASE_MODELS, BASE_LIFT), loadSet(loader, ENEMY_MODELS, UNIT_LIFT)]);
  return { towers, bases, enemies };
}

// a copy for one unit in the scene; materials are copied too (sharing the textures) so each
// unit can be tinted on its own (hit flashes, frost)
// The copy sits inside its own group: callers place, turn and size the group, and the copy
// keeps the scale that normalized it to a height of 1 (setting the copy's scale directly would
// throw that away, leaving flat models like the anaconda drawn many times too small).
export function placeModel(model: Model): THREE.Object3D {
  const copy = model.obj.clone(true);
  copy.traverse((o) => {
    if (o instanceof THREE.Mesh) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
  });
  const placed = new THREE.Group();
  placed.add(copy);
  return placed;
}

// tints a placed copy (1,1,1 = its own colours, lifted as it was loaded)
export function tintModel(obj: THREE.Object3D, tint: THREE.Color, lift: number): void {
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      m.color.setRGB(lift * tint.r, lift * tint.g, lift * tint.b);
    }
  });
}
