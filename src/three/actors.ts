import * as THREE from "three";
import type { Biome, Enemy, Game } from "@/types";
import type { Pic, UprightViews } from "@/three/art";
import { enemySkinOf } from "@/three/skins";
import type { EnemySkin } from "@/three/skins";
import { COS, toWorld } from "@/three/stage";
import { BURROW_TIME, DROP_TIME, SWIM_TIME } from "@/game/enemies";
import { CREATURE_ENTRANCE_TIME, creatureEntrance, entranceProgress } from "@/config/bosses";
import { syncBossProps } from "@/three/bossprops";
import { gaitFor, stridePhase, strike, swimPose, walkPose } from "@/three/gait";
import type { Pose, Style } from "@/three/gait";
import { BONES, poseRig } from "@/three/rig";
import type { RigMode } from "@/three/rig";
import { rigOf, setLit } from "@/three/lit";
import { BASE_SPRITE_H, BIOME_GLOW, BOSS_OVERLORD_H, ENEMY_H, UPRIGHT_SCALE, castShadow, halo, mirror, placeCast, shadowUnder, sprite } from "@/three/actorkit";
import type { Actor, Actors } from "@/three/actorkit";
import { dropModels, syncTower } from "@/three/turrets";
import { dropEnemyModels, syncBaseModel, syncEnemyModel } from "@/three/units3d";
export { createActors } from "@/three/actorkit";
export type { Actors } from "@/three/actorkit";

// the alien renders face the camera, head down; the sprite is turned so the head points
// where the alien walks, with a small side to side scuttle
// which way each side view faces in its sheet (the Yeti and the Eel look left)
const FACES_RIGHT: Record<EnemySkin, Record<Enemy["kind"], boolean>> = {
  grassland: { scout: true, brute: true, overlord: false, titan: false },
  snow: { scout: true, brute: false, overlord: true, titan: true },
  water: { scout: true, brute: true, overlord: false, titan: true },
  desert: { scout: false, brute: false, overlord: false, titan: true },
  cyber: { scout: true, brute: true, overlord: false, titan: true },
};

// the Cyber Arena boss's car form faces left in its sheet
const CAR_FACES_RIGHT = false;

// Cold World enemies walk upright: front view coming down the screen, back view going up,
// the side view (mirrored as needed) going across
function viewFor(views: UprightViews, e: Enemy, facesRight: boolean): { pic: Pic; flip: boolean; side: boolean } {
  const dy = Math.sin(e.angle);
  if (dy > 0.6) return { pic: views.front, flip: false, side: false };
  if (dy < -0.6) return { pic: views.back, flip: false, side: false };
  const right = Math.cos(e.angle) > 0;
  return { pic: views.side, flip: right !== facesRight, side: true };
}

function uprightPic(actors: Actors, e: Enemy, biome: EnemySkin): { pic: Pic; flip: boolean; side: boolean } {
  return viewFor(actors.art.skins[biome][e.kind], e, FACES_RIGHT[biome][e.kind]);
}

// The Transformer Overlord drives in as a car, stops and transforms into the robot, then walks
// on. The transformation dissolves smoothly through its sheet's pictures in order (car, the
// eight transformation frames, the robot): each one fades into the next while the size eases
// up, so it never snaps. Returns the picture, the next picture blending in on top and how far,
// and how tall to draw it relative to the robot.
type Form = { view: { pic: Pic; flip: boolean; side: boolean }; next: Pic | null; blend: number; scale: number };

function bossForm(actors: Actors, e: Enemy): Form | null {
  if (actors.biome !== "cyber" || e.kind !== "titan" || e.morph >= 1) return null;
  const car = viewFor(actors.art.bossCar, e, CAR_FACES_RIGHT);
  if (e.morph <= 0) return { view: car, next: null, blend: 0, scale: 0.42 };
  const sequence = [car.pic, ...actors.art.bossMorph, actors.art.skins.cyber.titan.front];
  const f = e.morph * (sequence.length - 1);
  const i = Math.min(sequence.length - 2, Math.floor(f));
  const pic = sequence[i];
  if (!pic) return null;
  // ease in and out so the size change starts and settles gently
  const k = e.morph * e.morph * (3 - 2 * e.morph);
  return { view: { pic, flip: i === 0 && car.flip, side: false }, next: sequence[i + 1] ?? null, blend: f - i, scale: 0.42 + 0.58 * k };
}

// the next transformation picture, drawn over the current one and fading in
function syncGhost(actors: Actors, e: Enemy, actor: Actor, form: Form | null): void {
  let ghost = actors.ghosts.get(e.id);
  if (!form || !form.next || form.blend <= 0.01) {
    if (ghost) {
      actors.group.remove(ghost);
      ghost.material.dispose();
      actors.ghosts.delete(e.id);
    }
    return;
  }
  if (!ghost) {
    ghost = sprite(form.next, 1, 0.08, actors.biome, true);
    ghost.renderOrder = 4;
    actors.group.add(ghost);
    actors.ghosts.set(e.id, ghost);
  }
  const mat = ghost.material;
  if (mat.map !== form.next.tex) {
    mat.map = form.next.tex;
    mat.needsUpdate = true;
  }
  const h = actor.sprite.scale.y;
  ghost.scale.set(h * form.next.aspect, h, 1);
  ghost.position.copy(actor.sprite.position);
  ghost.center.copy(actor.sprite.center);
  mat.opacity = form.blend * actor.sprite.material.opacity;
  mat.color.copy(actor.sprite.material.color);
  // the picture underneath fades out as the next one fades in
  actor.sprite.material.opacity *= 1 - form.blend * 0.85;
}

// How a final boss looks during its entrance (k: 0..1 through it): how far it has risen out of
// the ground (scale), how high above it is still falling, its opacity and its brightness.
// Desert follows the Mummy King's sheet: hidden in the sandstorm until 2.5s, a dark
// silhouette until 3s, then fully revealed. The Colossus grows out of its stump, Damyaan
// rises and fades in from the whirlpool, the Ice Dragon breaks up out of the ice.
type Show = { rise: number; fall: number; alpha: number; light: number };

function bossShow(k: number | null, biome: Biome): Show | null {
  if (k === null) return null;
  // smoothstep between two points of the timeline
  const ease = (a: number, b: number): number => {
    const x = Math.max(0, Math.min(1, (k - a) / (b - a)));
    return x * x * (3 - 2 * x);
  };
  if (biome === "desert") return { rise: 1, fall: 0, alpha: ease(0.6, 0.72), light: 0.12 + 0.88 * ease(0.72, 0.86) };
  if (biome === "grassland") return { rise: ease(0, 0.85), fall: 0, alpha: ease(0, 0.12), light: 0.7 + 0.3 * ease(0.3, 1) };
  if (biome === "water") return { rise: ease(0, 1), fall: 0, alpha: ease(0, 0.6), light: 1 };
  if (biome === "snow") {
    // hidden in the blizzard, claws break the ice at 1.5s, it rises to full height by 3s and
    // flares bright with its roar
    const roar = Math.max(0, 1 - Math.abs(k - 0.75) / 0.1);
    return { rise: 0.2 + 0.8 * ease(0.375, 0.75), fall: 0, alpha: ease(0.36, 0.48), light: 1 + roar * roar * 0.7 };
  }
  return { rise: 1, fall: (1 - Math.min(1, k / 0.85)) ** 2 * 460, alpha: 1, light: 1 };
}

// each creature's own arrival (src/config/bosses.ts)
function creatureShow(e: Enemy, biome: Biome, world: boolean): Show | null {
  const way = world && e.intro > 0 ? creatureEntrance(biome, e.kind, e.boss) : null;
  if (!way) return null;
  const k = 1 - e.intro / CREATURE_ENTRANCE_TIME[way];
  if (way === "emerge" || way === "burrow") return { rise: k, fall: 0, alpha: Math.min(1, k * 2), light: 0.75 + 0.25 * k };
  if (way === "swoop") return { rise: 1, fall: (1 - k) ** 2 * 380, alpha: 1, light: 1 };
  if (way === "drop") return { rise: 1, fall: (1 - k) ** 2 * 320, alpha: 1, light: 1 };
  if (way === "form") return { rise: k ** 0.5, fall: 0, alpha: k, light: 1.5 - 0.5 * k };
  // fade: flickers in, bright at first
  return { rise: 1, fall: 0, alpha: k * (0.75 + 0.25 * Math.sin(e.intro * 60)), light: 1.6 - 0.6 * k };
}

// which bones move for a style of movement
function rigMode(transforming: boolean, style: Style, side: boolean): RigMode {
  if (transforming || style === "hover" || style === "roll") return "none";
  if (style === "fly") return "flap";
  if (style === "swim" || style === "slither") return side ? "swimSide" : "swimFront";
  return side ? "walkSide" : "walkFront";
}

// how big a creature is drawn relative to its type's usual height: the Nightwing Harrier is an
// owl, much smaller than the other elites
function creatureSize(skin: EnemySkin | null, kind: Enemy["kind"]): number {
  return skin === "grassland" && kind === "brute" ? 0.6 : 1;
}

function headOnShrink(skin: EnemySkin | null, kind: Enemy["kind"], side: boolean): number {
  return skin === "grassland" && kind === "overlord" && !side ? 0.5 : 1;
}

function syncEnemy(actors: Actors, e: Enemy, frozen: boolean, skin: EnemySkin | null): void {
  const upright = skin !== null;
  const form = bossForm(actors, e);
  const view = form ? form.view : skin !== null ? uprightPic(actors, e, skin) : { pic: actors.art.enemies[e.kind], flip: false, side: false };
  const species = creatureSize(skin, e.kind);
  const solidHeight = (e.boss && e.kind === "overlord" ? BOSS_OVERLORD_H : ENEMY_H[e.kind]) * (upright ? UPRIGHT_SCALE : 1) * species;
  // a long creature seen head on (the anaconda's front and back views) is drawn smaller: its
  // picture is all width
  const baseHeight = solidHeight * (headOnShrink(skin, e.kind, view.side));
  const pic = view.pic;
  // long side views (a chameleon, a scorpion) would be very wide at full height: cap the width
  const gait = gaitFor(skin, e.kind);
  // long side views would be very wide at full height, so cap the width; the anaconda is
  // allowed to be long, it is a giant snake
  const maxAspect = gait.style === "slither" ? 4.5 : 1.35;
  const height = form ? baseHeight * form.scale : baseHeight * Math.min(1, maxAspect / pic.aspect);
  let actor = actors.enemies.get(e.id);
  if (!actor) {
    // every enemy stands (or floats) upright on its feet; the gait animates it
    actor = { sprite: sprite(pic, height, 0.08, actors.biome, true), shadow: shadowUnder(actors, e.pos, height * 1.1), glow: halo(actors, BIOME_GLOW[actors.biome]), cast: castShadow(actors, pic.tex) };
    actor.sprite.geometry = actors.rigGeo;
    actors.group.add(actor.cast, actor.glow, actor.sprite, actor.shadow);
    actors.enemies.set(e.id, actor);
  }
  const mat = actor.sprite.material;
  const map = view.flip ? mirror(actors, pic.tex) : pic.tex;
  if (mat.map !== map) {
    mat.map = map;
    mat.needsUpdate = true;
  }
  // underwater everything swims; in the Cyber Arena the Phase Wraith hovers
  const swim = gait.style === "swim";
  // the boss's car rolls smoothly and its transformation frames play as drawn
  const still: Pose = { lift: 0, rot: 0, sx: 1, sy: 1, dx: 0, dy: 0 };
  const pose = form ? still : swim ? swimPose(e, actors.time, height, Math.cos(e.angle) > 0) : walkPose(e, gait, actors.time, height);
  // pose the skeleton: legs and arms from the step cycle, a swimming wave underwater
  const rig = rigOf(mat);
  if (rig) {
    const mode = rigMode(form !== null, gait.style, view.side);
    const phase = swim ? actors.time * 1.2 + e.id : gait.style === "fly" ? actors.time * 3.2 + e.id : stridePhase(e, gait);
    // a giant boss bends far less: what reads as a stride on a small creature looks rubbery
    // on something that big
    const bones = BONES[skin ?? "alien"][e.kind];
    const calm = e.boss ? { ...bones, leg: bones.leg * 0.55, arm: bones.arm * 0.55 } : bones;
    poseRig(rig, mode, calm, phase, Math.cos(e.angle) >= 0 ? 1 : -1, Math.max(0, strike(e)));
  }
  // ease the roll so turning a corner swings the lean over instead of snapping it
  mat.rotation += (pose.rot - mat.rotation) * 0.25;
  // entering: burrowers grow out of the ground, drop-zone enemies fall from the sky
  // a final boss's entrance replaces the normal entry (src/config/bosses.ts)
  const show = bossShow(entranceProgress(e, actors.biome), actors.biome) ?? creatureShow(e, actors.biome, actors.world);
  const entry = e.intro > 0 && !show ? actors.entries.get(e.routeIndex) : undefined;
  const rise = show ? show.rise : entry === "burrow" ? 1 - e.intro / BURROW_TIME : 1;
  const fall = show ? show.fall : entry === "drop" ? (e.intro / DROP_TIME) ** 2 * 320 : entry === "swim" ? (e.intro / SWIM_TIME) ** 1.5 * 280 : 0;
  const s = 0.15 + 0.85 * rise;
  actor.sprite.scale.set(height * pic.aspect * s * pose.sx, height * s * pose.sy, 1);
  const lift = (fall + pose.lift) / COS;
  const at = { x: e.pos.x + pose.dx, y: e.pos.y + pose.dy };
  actor.sprite.position.copy(toWorld(at, lift));
  actor.shadow.position.copy(toWorld(at, 0.8));
  // the higher the body, the smaller and fainter its shadow (strides, swimming, falling)
  const shrink = Math.max(0.2, (1 - fall / 500) * (1 - pose.lift / (height * 1.4)));
  actor.shadow.scale.set(height * 1.1 * shrink, 1, height * 0.88 * shrink);
  setLit(mat, view.flip, mat.rotation);
  placeCast(actor.cast, map, at, height * pic.aspect * s * shrink, height * s * 0.7 * shrink, 0.08, 0.45 * shrink * (1 - e.warp));
  mat.opacity = (1 - e.warp) * (show ? show.alpha : 1);
  // rim light: a soft biome-coloured glow behind the enemy, brighter on bosses
  actor.glow.position.copy(toWorld(at, lift + height * 0.45));
  actor.glow.scale.set(height * 1.5, height * 1.5, 1);
  // kept faint so a crowd's overlapping glows do not wash the enemies out on bright maps
  actor.glow.material.opacity = (e.boss ? 0.3 : 0.12) * (1 - e.warp) + (e.hitFlash > 0 ? 0.3 : 0);
  const tint = new THREE.Color(1, 1, 1);
  if (e.slowTime > 0 || frozen) tint.setRGB(0.65, 0.9, 1.35);
  if (e.burnTime > 0) tint.setRGB(1.35, 0.95, 0.7);
  if (e.hitFlash > 0) tint.setRGB(e.boss ? 1.3 : 1.9, e.boss ? 1.3 : 1.9, e.boss ? 1.3 : 1.9);
  if (show) tint.multiplyScalar(show.light);
  mat.color.copy(tint);
  syncGhost(actors, e, actor, form);
  // a real 3D model takes over from the sprite when one exists (not while the Cyber boss is
  // still transforming from its car, which plays its sheet's frames)
  const phase = swim ? actors.time * 1.2 + e.id : gait.style === "fly" ? actors.time * 3.2 + e.id : stridePhase(e, gait);
  const solid = syncEnemyModel(actors, e, { at, lift, height: solidHeight, grow: s, pose, alpha: mat.opacity, tint, phase, strike: Math.max(0, strike(e)) }, form === null);
  actor.sprite.visible = !solid;
  actor.cast.visible = !solid;
}

function removeGone(actors: Actors, map: Map<number, Actor>, alive: Set<number>): void {
  for (const [id, actor] of map) {
    if (alive.has(id)) continue;
    actors.group.remove(actor.sprite, actor.shadow, actor.glow, actor.cast);
    actor.sprite.material.dispose();
    actor.cast.material.dispose();
    actor.glow.material.dispose();
    const ghost = actors.ghosts.get(id);
    if (ghost) {
      actors.group.remove(ghost);
      ghost.material.dispose();
      actors.ghosts.delete(id);
    }
    map.delete(id);
  }
}

export function syncActors(actors: Actors, game: Game): void {
  actors.biome = game.level.biome;
  actors.world = game.level.mapArt === "world";
  actors.time = game.time;
  for (const tower of game.towers) syncTower(actors, tower);
  removeGone(actors, actors.towers, new Set(game.towers.map((tw) => tw.id)));
  dropModels(actors, new Set(game.towers.map((tw) => tw.id)));
  const frozen = game.power.cryo > 0;
  actors.entries = new Map(game.routes.map((r, i) => [i, r.entry]));
  // Cold World, Aqua Realm, Desert and Cyber Arena have their own enemy skins from the sheets
  const biome = game.level.biome;
  actors.water = biome === "water";
  // world levels use the world's own creatures; the legacy level maps and paintings keep
  // the original alien swarm
  const skin = game.level.mapArt === "world" ? enemySkinOf(biome) : biome === "grassland" ? null : enemySkinOf(biome);
  for (const e of game.enemies) syncEnemy(actors, e, frozen, skin);
  syncBases(actors, game);
  syncBossProps(actors.group, actors.props, game);
  removeGone(actors, actors.enemies, new Set(game.enemies.map((e) => e.id)));
  dropEnemyModels(actors, new Set(game.enemies.map((e) => e.id)));
}

// on-screen height of an actor's sprite, so the overlay can put health bars above it
export function spriteHeight(actors: Actors, kind: "tower" | "enemy", id: number): number {
  const a = (kind === "tower" ? actors.towers : actors.enemies).get(id);
  return a ? a.sprite.scale.y : 40;
}

// World maps paint an empty base platform; the base sprite from the base sheet stands on it,
// showing the art for its current upgrade level (or the highest level drawn so far).
function syncBases(actors: Actors, game: Game): void {
  // each world's own base
  const set = actors.art.bases[enemySkinOf(actors.biome)];
  if (game.level.mapArt !== "world" || set.length === 0) return;
  game.bases.forEach((base, i) => {
    const pic = set[Math.min(base.level, set.length) - 1];
    if (!pic) return;
    let s = actors.bases[i];
    if (!s) {
      s = sprite(pic, BASE_SPRITE_H, 0.18, actors.biome, true);
      s.position.copy(toWorld(base.pos, 2));
      const cast = castShadow(actors, pic.tex);
      actors.group.add(cast, s);
      actors.bases[i] = s;
      actors.baseCasts[i] = cast;
    }
    const mat = s.material;
    if (mat.map !== pic.tex) {
      mat.map = pic.tex;
      mat.needsUpdate = true;
      s.scale.set(BASE_SPRITE_H * (1 + (base.level - 1) * 0.12) * pic.aspect, BASE_SPRITE_H * (1 + (base.level - 1) * 0.12), 1);
    }
    const dead = base.hp <= 0;
    mat.color.setRGB(dead ? 0.35 : base.flash > 0 ? 1.8 : 1, dead ? 0.35 : base.flash > 0 ? 0.7 : 1, dead ? 0.35 : base.flash > 0 ? 0.7 : 1);
    // the core crystal glows and pulses, stronger with each upgrade level; a slow
    // breathing scale keeps the structure from looking frozen
    let g = actors.baseGlows[i];
    if (!g) {
      g = halo(actors, BIOME_GLOW[actors.biome]);
      actors.group.add(g);
      actors.baseGlows[i] = g;
    }
    const h = BASE_SPRITE_H * (1 + (base.level - 1) * 0.12);
    g.position.copy(toWorld(base.pos, h * 0.62));
    const pulse = 0.5 + 0.5 * Math.sin(actors.time * 2.2 + i);
    g.scale.set(h * (1.1 + pulse * 0.15), h * (1.1 + pulse * 0.15), 1);
    g.material.opacity = dead ? 0 : 0.22 + base.level * 0.08 + pulse * 0.12;
    const breathe = 1 + Math.sin(actors.time * 1.4 + i) * 0.008;
    s.scale.set(h * pic.aspect * breathe, h * breathe, 1);
    const cast = actors.baseCasts[i];
    if (cast) placeCast(cast, pic.tex, base.pos, h * pic.aspect, h * 0.7, 0.18, dead ? 0.2 : 0.5);
    // a real 3D model of the base at this level takes over when one exists
    const solid = syncBaseModel(actors, i, base.level, base.pos, h * breathe, mat.color);
    s.visible = !solid;
    if (cast) cast.visible = !solid;
  });
}
