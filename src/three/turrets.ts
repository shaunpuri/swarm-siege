import * as THREE from "three";
import type { Tower } from "@/types";
import type { Pic } from "@/three/art";
import { skinOf } from "@/three/skins";
import { SPECS } from "@/config/towers";
import { toWorld } from "@/three/stage";
import { setLit } from "@/three/lit";
import { BIOME_GLOW, TOWER_H, TURN_SPEED, castShadow, halo, mirror, placeCast, shadowUnder, sprite } from "@/three/actorkit";
import type { Actors } from "@/three/actorkit";
import { modelKey, placeModel } from "@/three/models";
import { addMotion } from "@/three/motion";
import { RIM_COLOR } from "@/three/units3d";

// a 3D model of height 1 is drawn this many times the sprite height (its depth also shows
// on screen, so it needs a little less height than a flat sprite)
const MODEL_SCALE = 0.95;

// Turrets: the side of the sheet art facing the target, or a real 3D model when the turret
// has one (src/three/models.ts), turning smoothly onto its target and kicking back on each shot.
// The sheets render each turret from four sides. The "left" view shows the barrel pointing
// right and the "right" view shows it pointing left; "front" aims down-right and is mirrored
// for down-left.
function towerFrame(actors: Actors, tower: Tower, aim: number): { pic: Pic; flip: boolean } {
  const set = actors.art.towers[tower.kind];
  const a = ((((aim * 180) / Math.PI) % 360) + 360) % 360;
  // every biome with its own tower sheet (Cold World, Aqua Realm, Desert, Cyber Arena) uses
  // that tower for all its turrets, one render per upgrade level (barrel up and to the
  // right), mirrored when the target is on the left
  // Forest World, Aqua Realm and Desert towers come from four sides: show the side facing the target
  // (the sheets' left view points right, the right view points left, front faces the viewer)
  const sides = actors.biome === "water" || actors.biome === "desert" ? actors.art.sideTowers[actors.biome] : actors.world && actors.biome === "grassland" ? actors.art.sideTowers.grassland : undefined;
  // upgrades change the design: level 1, 2 and 3 are the sheet's three towers
  const design = tower.level - 1;
  const sided = sides?.[design];
  if (sided) {
    if (a < 45 || a >= 315) return { pic: sided.left, flip: false };
    if (a < 135) return { pic: sided.front, flip: false };
    if (a < 225) return { pic: sided.right, flip: false };
    return { pic: sided.back, flip: false };
  }
  const own = skinOf(actors.biome);
  if (own || tower.kind === "frost") {
    const pic = actors.art.biomeTowers[own ?? "snow"][design] ?? set.front;
    return { pic, flip: a > 90 && a < 270 };
  }
  if (a < 30 || a >= 330) return { pic: set.left, flip: false };
  if (a < 90) return { pic: set.front, flip: false };
  if (a < 150) return { pic: set.front, flip: true };
  if (a < 210) return { pic: set.right, flip: false };
  return { pic: set.back, flip: false };
}

// the turret's real 3D model at its upgrade level, if one has been made (null otherwise)
function syncModel(actors: Actors, tower: Tower, aim: number, size: number, kick: number): THREE.Object3D | null {
  const key = modelKey(actors.biome, tower.level);
  const source = actors.world ? actors.art.models.towers.get(key) : undefined;
  let entry = actors.models.get(tower.id);
  if (entry && entry.key !== key) {
    actors.group.remove(entry.obj);
    actors.models.delete(tower.id);
    entry = undefined;
  }
  if (!source) return null;
  if (!entry) {
    entry = { key, obj: placeModel(source), born: actors.time };
    addMotion(entry.obj, "still", 0, RIM_COLOR[actors.biome]);
    actors.group.add(entry.obj);
    actors.models.set(tower.id, entry);
  }
  const back = tower.recoil * 7;
  entry.obj.position.copy(toWorld({ x: tower.pos.x - Math.cos(aim) * back, y: tower.pos.y - Math.sin(aim) * back }, 2));
  // Tripo's turrets point their barrels along -x; turning by PI - aim points them at the
  // target on the ground plane
  entry.obj.rotation.y = Math.PI - aim;
  // built or upgraded: it springs up out of the ground with a bounce (Clash of Clans style)
  const pop = buildPop(actors.time - entry.born);
  entry.obj.scale.set(size * pop.wide * (1 + tower.recoil * 0.05), size * pop.tall * kick, size * pop.wide * (1 + tower.recoil * 0.05));
  return entry.obj;
}

// the build pop, t seconds after a turret appears: it shoots up past full height, squashes, and
// settles (wide and tall multiply its size)
const POP_TIME = 0.5;
function buildPop(t: number): { wide: number; tall: number } {
  if (t >= POP_TIME || t < 0) return { wide: 1, tall: 1 };
  const k = t / POP_TIME;
  // ease out with an overshoot, then a little squash and stretch as it lands
  const c = 1.9;
  const grow = 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2;
  const wobble = Math.sin(k * Math.PI * 3) * (1 - k) * 0.12;
  return { wide: grow * (1 + wobble), tall: grow * (1 - wobble) };
}

// removes the models of turrets that are gone (sold or destroyed)
export function dropModels(actors: Actors, alive: Set<number>): void {
  for (const [id, entry] of actors.models) {
    if (alive.has(id)) continue;
    actors.group.remove(entry.obj);
    actors.models.delete(id);
  }
}

export function syncTower(actors: Actors, tower: Tower): void {
  let actor = actors.towers.get(tower.id);
  if (!actor) {
    const front = actors.art.towers[tower.kind].front;
    actor = { sprite: sprite(front, TOWER_H, 0.14, actors.biome, true), shadow: shadowUnder(actors, tower.pos, 56), glow: halo(actors, BIOME_GLOW[actors.biome]), cast: castShadow(actors, front.tex) };
    actor.sprite.position.copy(toWorld(tower.pos, 4));
    actor.glow.position.copy(toWorld(tower.pos, TOWER_H * 0.55));
    actors.group.add(actor.cast, actor.sprite, actor.shadow, actor.glow);
    actors.towers.set(tower.id, actor);
  }
  // like a Clash of Clans cannon, the turret swings round onto its target at a set turn
  // speed instead of snapping, sweeping through its side views as it goes
  const prev = actors.aims.get(tower.id) ?? tower.angle;
  let turn = tower.angle - prev;
  while (turn > Math.PI) turn -= Math.PI * 2;
  while (turn < -Math.PI) turn += Math.PI * 2;
  const aim = prev + Math.sign(turn) * Math.min(Math.abs(turn), TURN_SPEED / 60);
  actors.aims.set(tower.id, aim);
  const grow0 = tower.spec !== null ? 1.2 : 1 + (tower.level - 1) * 0.07;
  const model = syncModel(actors, tower, aim, TOWER_H * MODEL_SCALE * grow0, 1 - tower.recoil * 0.1);
  // with a real 3D model the flat sprite and its painted shadow step aside
  actor.sprite.visible = model === null;
  actor.cast.visible = model === null;
  const { pic, flip } = towerFrame(actors, tower, aim);
  const mat = actor.sprite.material;
  const map = flip ? mirror(actors, pic.tex) : pic.tex;
  if (mat.map !== map) {
    mat.map = map;
    mat.needsUpdate = true;
  }
  // each upgrade is a new design, and a little bigger
  const grow = tower.spec !== null ? 1.2 : 1 + (tower.level - 1) * 0.07;
  // firing: squashes down and widens, then springs back (the Clash of Clans cannon punch),
  // and the whole turret jolts back away from its target
  const kick = 1 - tower.recoil * 0.1;
  const widen = 1 + tower.recoil * 0.06;
  const back = tower.recoil * 7;
  actor.sprite.position.copy(toWorld({ x: tower.pos.x - Math.cos(aim) * back, y: tower.pos.y - Math.sin(aim) * back }, 4));
  // idle: the turret breathes slightly; its energy core glows, flaring when it fires
  const breathe = 1 + Math.sin(actors.time * 2.2 + tower.id) * 0.012;
  actor.sprite.scale.set(TOWER_H * grow * pic.aspect * breathe * widen, TOWER_H * grow * kick * breathe, 1);
  setLit(mat, flip, 0);
  placeCast(actor.cast, map, tower.pos, TOWER_H * grow * pic.aspect, TOWER_H * grow * 0.6, 0.14, 0.55);
  // the core glows brighter with every upgrade level
  const core = 0.22 + 0.12 * tower.level + 0.12 * Math.sin(actors.time * 3 + tower.id) + tower.firing * 2.5;
  actor.glow.material.opacity = Math.min(0.95, core);
  const gs = TOWER_H * grow * (0.9 + tower.firing * 1.5);
  actor.glow.scale.set(gs, gs, 1);
  // abilities tint the turret toward their colour; damage flashes it
  const tint = new THREE.Color(1, 1, 1);
  if (tower.spec !== null) tint.lerp(new THREE.Color(SPECS[tower.spec].color), 0.35);
  if (tower.flash > 0) tint.setRGB(2, 1.4, 1.4);
  mat.color.copy(tint);
}

