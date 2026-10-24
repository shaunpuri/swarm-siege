import * as THREE from "three";
import type { MotionUniforms } from "@/three/motion";
import type { Biome, Enemy, Entry } from "@/types";
import type { Art, Pic } from "@/three/art";
import { toWorld } from "@/three/stage";
import { createBossProps } from "@/three/bossprops";
import type { BossProps } from "@/three/bossprops";
import { rigGeometry } from "@/three/rig";
import { castShadowGeometry, castShadowMaterial, litMaterial } from "@/three/lit";


// Keeps the 3D scene in step with the simulation: one sprite per turret and per alien
// (created and removed as they appear and die), each with a soft ground shadow. Sprites are screen aligned, so one world unit is one screen pixel and the
// art from the sheets shows at its true proportions.

// sprite heights in world units (= screen pixels)
export const TOWER_H = 78;
export const ENEMY_H: Record<Enemy["kind"], number> = { scout: 50, brute: 64, overlord: 72, titan: 170 };
export const BOSS_OVERLORD_H = 118;

// glow: an additive halo drawn with the sprite (turret core, enemy rim light)
// cast: the sprite's silhouette shadow falling across the map, away from the sun
export type Actor = { sprite: THREE.Sprite; shadow: THREE.Mesh; glow: THREE.Sprite; cast: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> };

// glow colour per biome: icy blue, sea cyan, neon magenta, warm amber, leaf green
export const BIOME_GLOW: Record<Biome, number> = { snow: 0x7dd3fc, water: 0x22d3ee, cyber: 0xe879f9, desert: 0xfbbf24, grassland: 0x86efac };

export function halo(actors: Actors, color: number): THREE.Sprite {
  const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: actors.art.glow, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
  g.renderOrder = 2;
  return g;
}

export type Actors = {
  group: THREE.Group;
  art: Art;
  towers: Map<number, Actor>;
  enemies: Map<number, Actor>;
  mirrored: Map<THREE.Texture, THREE.Texture>;
  shadowGeo: THREE.PlaneGeometry;
  shadowMat: THREE.MeshBasicMaterial;
  castGeo: THREE.PlaneGeometry;
  // grid mesh shared by every enemy sprite, bent by the rig
  rigGeo: THREE.PlaneGeometry;
  // how enemies enter each route (burrow, drop zone), for the entry animation
  entries: Map<number, Entry>;
  // base sprites standing on the world maps' empty base platforms, one per base
  bases: THREE.Sprite[];
  baseCasts: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[];
  // set pieces for boss entrances (the Desert pyramid)
  props: BossProps;
  // a world level (creature entrances only happen there)
  world: boolean;
  // each turret's drawn aim, easing toward the simulation's (tower id -> radians)
  aims: Map<number, number>;
  // the Cyber boss's next transformation picture, crossfading in (enemy id -> sprite)
  ghosts: Map<number, THREE.Sprite>;
  // turrets shown as real 3D models (tower id -> the model's key and its copy in the scene)
  // born: game time it was placed (the build pop animates from it)
  models: Map<number, { key: string; obj: THREE.Object3D; born: number }>;
  // enemies and bases shown as real 3D models (id or base index -> the placed copy)
  enemyModels: Map<number, { key: string; obj: THREE.Object3D; tint: string; motion: MotionUniforms | null }>;
  baseModels: Map<number, { key: string; obj: THREE.Object3D; tint: string; motion: MotionUniforms | null }>;
  // killed enemies' models playing their fall (tipping over and sinking), with when it began
  falling: { obj: THREE.Object3D; from: number; scale: number; tip: number; y: number }[];
  // Aqua Realm level: the biome tower uses the Aqua Map Tower art
  water: boolean;
  biome: Biome;
  // seconds of game time, for idle animations
  time: number;
  // glowing halo behind each base crystal
  baseGlows: THREE.Sprite[];
};

export const BASE_SPRITE_H = 150;

// how fast turrets swing round, in radians per second (drawn at 60 frames a second)
export const TURN_SPEED = 5;

// upright Cold World enemies are drawn a little taller than the flat alien sprites
export const UPRIGHT_SCALE = 1.35;

// standing: upright objects get ambient occlusion at their base (top down aliens do not)
export function sprite(pic: Pic, height: number, anchorY: number, biome: Biome, standing: boolean): THREE.Sprite {
  const s = new THREE.Sprite(litMaterial(pic.tex, biome, standing));
  s.center.set(0.5, anchorY);
  // drawn after the additive halos so a glow sits behind the sprite instead of washing it out
  s.renderOrder = 3;
  s.scale.set(height * pic.aspect, height, 1);
  return s;
}

export function createActors(art: Art): Actors {
  const group = new THREE.Group();
  return {
    group,
    art,
    towers: new Map(),
    enemies: new Map(),
    mirrored: new Map(),
    shadowGeo: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    shadowMat: new THREE.MeshBasicMaterial({ map: art.shadow, transparent: true, depthWrite: false }),
    castGeo: castShadowGeometry(),
    rigGeo: rigGeometry(),
    entries: new Map(),
    bases: [],
    baseCasts: [],
    props: createBossProps(art),
    world: false,
    aims: new Map(),
    ghosts: new Map(),
    models: new Map(),
    enemyModels: new Map(),
    baseModels: new Map(),
    falling: [],
    water: false,
    biome: "grassland",
    time: 0,
    baseGlows: [],
  };
}

export function shadowUnder(actors: Actors, pos: { x: number; y: number }, size: number): THREE.Mesh {
  const m = new THREE.Mesh(actors.shadowGeo, actors.shadowMat);
  m.position.copy(toWorld(pos, 0.8));
  m.scale.set(size, 1, size * 0.8);
  m.renderOrder = 1;
  return m;
}

export function castShadow(actors: Actors, tex: THREE.Texture): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const m = new THREE.Mesh(actors.castGeo, castShadowMaterial(tex));
  m.renderOrder = 1;
  return m;
}

// lay the silhouette shadow at a ground point: as wide as the sprite, stretched to `len`,
// shifted so the sprite's foot line (anchor, as a fraction of its height) sits on the point
export function placeCast(cast: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>, tex: THREE.Texture | null, pos: { x: number; y: number }, width: number, len: number, anchor: number, opacity: number): void {
  if (cast.material.map !== tex) {
    cast.material.map = tex;
    cast.material.needsUpdate = true;
  }
  cast.position.copy(toWorld(pos, 0.5));
  cast.position.z += anchor * len;
  cast.position.x -= anchor * len * 0.55;
  cast.scale.set(width, 1, len);
  cast.material.opacity = opacity;
}

export function mirror(actors: Actors, tex: THREE.Texture): THREE.Texture {
  const cached = actors.mirrored.get(tex);
  if (cached) return cached;
  const m = tex.clone();
  m.wrapS = THREE.RepeatWrapping;
  m.repeat.x = -1;
  m.offset.x = 1;
  m.needsUpdate = true;
  actors.mirrored.set(tex, m);
  return m;
}

