import * as THREE from "three";
import type { Game } from "@/types";
import type { Art } from "@/three/art";
import type { Stage } from "@/three/stage";
import type { Actors } from "@/three/actors";
import type { MapFx } from "@/three/map";
import { SIN, clearWorld, setBloomFor, setLightFor, toWorld } from "@/three/stage";
import { buildMap } from "@/three/map";
import { createActors } from "@/three/actors";
import { MAP } from "@/config/mapspace";
import { PAINTINGS } from "@/config/painting";
import { WORLD_SIZE } from "@/config/worlds";
import { WORLD_ART } from "@/three/worldart";

// One level's scene: its animated painted map, the extra build pads on sparse maps, and the
// live turret and alien sprites.

export type LevelScene = { actors: Actors; map: MapFx };

// generated pads lie flat on the ground, the same size as the painted ones
const PAD_W = 158;

function extraPads(game: Game, art: Art): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: art.pad.tex, transparent: true, depthWrite: false });
  const geo = new THREE.PlaneGeometry(PAD_W, PAD_W / art.pad.aspect / SIN).rotateX(-Math.PI / 2);
  for (const pad of game.pads.slice(game.level.pads.length)) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(toWorld(pad.pos, 0.5));
    group.add(mesh);
  }
  return group;
}

// world maps load on demand (there are up to 50 of them), so they stream in when a level starts
const worldTextures = new Map<string, THREE.Texture>();

function worldTexture(url: string): THREE.Texture {
  const cached = worldTextures.get(url);
  if (cached) return cached;
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  worldTextures.set(url, tex);
  return tex;
}

function mapFor(game: Game, art: Art): MapFx {
  const mode = game.level.mapArt;
  if (mode === "world") {
    const url = WORLD_ART[game.level.id]?.[game.level.biome];
    if (!url) throw new Error(`no world map for level ${game.level.id} ${game.level.biome}`);
    const style = game.level.biome === "cyber" ? "neon" : game.level.biome === "water" ? "aqua" : game.level.biome === "snow" ? "frost" : "nature";
    return buildMap(worldTexture(url), WORLD_SIZE, style);
  }
  if (mode === "level") {
    const tex = art.maps[game.level.id - 1];
    if (!tex) throw new Error(`no map art for level ${game.level.id}`);
    return buildMap(tex, MAP, "nature");
  }
  return buildMap(art.paintings[mode], PAINTINGS[mode].size, PAINTINGS[mode].style, PAINTINGS[mode].features);
}

export function buildLevelScene(stage: Stage, game: Game, art: Art): LevelScene {
  clearWorld(stage);
  setBloomFor(stage, game.level.biome === "snow" || game.level.biome === "desert");
  setLightFor(stage, game.level.biome);
  const map = mapFor(game, art);
  const actors = createActors(art);
  stage.world.add(map.group, extraPads(game, art), actors.group);
  return { actors, map };
}
