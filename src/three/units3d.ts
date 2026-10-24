import * as THREE from "three";
import type { Biome, Enemy } from "@/types";
import type { Pose } from "@/three/gait";
import type { Actors } from "@/three/actorkit";
import { BASE_LIFT, UNIT_LIFT, modelKey, placeModel, tintModel } from "@/three/models";
import { toWorld } from "@/three/stage";
import { addMotion, motionFor } from "@/three/motion";
import type { MotionUniforms } from "@/three/motion";
import { enemySkinOf } from "@/three/skins";

// Real 3D enemies and bases (src/three/models.ts) where a model exists; the flat sheet art is
// used otherwise. A 3D enemy turns to face the way it walks and keeps everything the sprites
// do: the step bounce and squash, the sway, swimming and hovering heights, entrances (rising,
// falling, fading in), frost, burning and hit flashes.

type Placed = { key: string; obj: THREE.Object3D; tint: string; motion: MotionUniforms | null };

// Tripo turns the "front" of a sheet toward -x; this heading turns a model's front to face a
// direction (radians, on the ground) or the camera (+z)
export const MODEL_FRONT = Math.PI;
// the bases came out of Tripo facing +x (their stairs and gates; a backdrop panel from the
// sheet stands behind them), so this turns their front to the camera; turned the other way the
// panel hid the base
const FACE_CAMERA = -Math.PI / 2;
// rim light per world, in the colour of its map's light
export const RIM_COLOR: Record<Biome, THREE.Color> = { grassland: new THREE.Color(0xd9f99d), snow: new THREE.Color(0xbae6fd), desert: new THREE.Color(0xfff3d6), water: new THREE.Color(0x67e8f9), cyber: new THREE.Color(0xf0abfc) };
// the widest a creature may be on the ground, as a share of its height; creatures longer than
// LONG (snakes) are drawn LONG_LENGTH heights long instead
const FOOTPRINT = 1.2;
const LONG = 3;
const LONG_LENGTH = 2.1;

// phase: where the creature is in its step, wingbeat or stroke (radians); strike: 0..1 through
// an attack's lunge
export type EnemyLook = { at: { x: number; y: number }; lift: number; height: number; grow: number; pose: Pose; alpha: number; tint: THREE.Color; phase: number; strike: number };

function swap(actors: Actors, map: Map<number, Placed>, id: number, key: string): Placed | undefined {
  const old = map.get(id);
  if (old && old.key !== key) {
    actors.group.remove(old.obj);
    map.delete(id);
    return undefined;
  }
  return old;
}

function retint(p: Placed, tint: THREE.Color, lift: number): void {
  const key = tint.getHexString();
  if (p.tint === key) return;
  p.tint = key;
  tintModel(p.obj, tint, lift);
}

// places the enemy's 3D model; false when it has none (the sprite is drawn instead)
export function syncEnemyModel(actors: Actors, e: Enemy, look: EnemyLook, allowed: boolean): boolean {
  const key = modelKey(actors.biome, e.kind);
  const source = allowed && actors.world ? actors.art.models.enemies.get(key) : undefined;
  let placed = swap(actors, actors.enemyModels, e.id, key);
  if (!source) {
    if (placed) {
      actors.group.remove(placed.obj);
      actors.enemyModels.delete(e.id);
    }
    return false;
  }
  if (!placed) {
    const obj = placeModel(source);
    const animal = motionFor(enemySkinOf(actors.biome), e.kind);
    // a giant boss bends less: a big body moves with weight
    placed = { key, obj, tint: "", motion: addMotion(obj, animal.motion, e.boss ? animal.amp * 0.6 : animal.amp, RIM_COLOR[actors.biome]) };
    actors.group.add(placed.obj);
    actors.enemyModels.set(e.id, placed);
  }
  const obj = placed.obj;
  // a model is 1 tall; its footprint is capped so a wide spider stays about turret sized,
  // while a long snake keeps its length (the anaconda is a giant serpent)
  const span = Math.max(source.width, source.depth, 0.0001);
  const fit = span > LONG ? LONG_LENGTH / span : Math.min(1, FOOTPRINT / span);
  const size = look.height * fit * look.grow;
  // hit reaction: a brief stagger back away from where it faces
  const stagger = Math.min(1, e.hitFlash / 0.08) * 4;
  obj.position.copy(toWorld({ x: look.at.x - Math.cos(e.angle) * stagger, y: look.at.y - Math.sin(e.angle) * stagger }, look.lift));
  // turn smoothly toward the walking direction
  const target = MODEL_FRONT - e.angle;
  let turn = target - obj.rotation.y;
  while (turn > Math.PI) turn -= Math.PI * 2;
  while (turn < -Math.PI) turn += Math.PI * 2;
  obj.rotation.y += turn * 0.2;
  // the step's sway becomes a lean of the body
  obj.rotation.z = look.pose.rot * 0.6;
  obj.scale.set(size * look.pose.sx, size * look.pose.sy, size * look.pose.sx);
  obj.visible = look.alpha > 0.4;
  if (placed.motion) {
    placed.motion.uMotion.value.y = look.phase;
    placed.motion.uMotion.value.w = look.strike;
  }
  retint(placed, look.tint, UNIT_LIFT.colour);
  return true;
}

// A killed enemy's model does not vanish: it tips over sideways and sinks into the ground
// over a third of a second, shrinking as it goes, then is removed.
const FALL_TIME = 0.35;

export function dropEnemyModels(actors: Actors, alive: Set<number>): void {
  for (const [id, p] of actors.enemyModels) {
    if (alive.has(id)) continue;
    actors.enemyModels.delete(id);
    if (!p.obj.visible) {
      actors.group.remove(p.obj);
      continue;
    }
    actors.falling.push({ obj: p.obj, from: actors.time, scale: p.obj.scale.x, tip: id % 2 === 0 ? 1 : -1, y: p.obj.position.y });
  }
  actors.falling = actors.falling.filter((f) => {
    const k = (actors.time - f.from) / FALL_TIME;
    if (k >= 1 || k < 0) {
      actors.group.remove(f.obj);
      return false;
    }
    f.obj.rotation.x = f.tip * k * 1.3;
    f.obj.scale.setScalar(f.scale * (1 - k * 0.7));
    f.obj.position.y = f.y - k * f.scale * 0.4;
    return true;
  });
}

// places a base's 3D model at its upgrade level; false when it has none
export function syncBaseModel(actors: Actors, index: number, level: number, pos: { x: number; y: number }, height: number, tint: THREE.Color): boolean {
  const key = modelKey(actors.biome, level);
  const source = actors.world ? actors.art.models.bases.get(key) : undefined;
  let placed = swap(actors, actors.baseModels, index, key);
  if (!source) return false;
  if (!placed) {
    const obj = placeModel(source);
    placed = { key, obj, tint: "", motion: addMotion(obj, "still", 0, RIM_COLOR[actors.biome]) };
    actors.group.add(placed.obj);
    actors.baseModels.set(index, placed);
  }
  const fit = Math.min(1, 2.6 / Math.max(source.width, source.depth, 0.0001));
  placed.obj.position.copy(toWorld(pos, 2));
  placed.obj.rotation.y = FACE_CAMERA;
  placed.obj.scale.setScalar(height * 0.75 * fit);
  retint(placed, tint, BASE_LIFT.colour);
  return true;
}
