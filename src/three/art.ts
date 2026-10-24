import * as THREE from "three";
import type { EnemyKind, TowerKind } from "@/types";
import type { EnemySkin, Skin } from "@/three/skins";
import { AQUA_ENEMY_ART, AQUA_TOWER_ART, BOSS_CAR_ART, BOSS_MORPH_ART, COLD_TOWER_ART, CYBER_ART, CYBER_ENEMY_ART, CYBER_TOWER_ART, DESERT_ENEMY_ART, FOREST_ENEMY_ART, FOREST_TOWER_ART, AQUA_TOWER_VIEWS, DESERT_TOWER_VIEWS, PYRAMID_ART, DESERT_TOWER_ART, ENEMY_ART, ICE_BURST_ART, MAP_ART, PAD_ART, PAINTING_ART, SNOW_ENEMY_ART, TOWER_ART } from "@/three/manifest";
import { BASE_ART } from "@/three/worldart";
import { loadModels } from "@/three/models";
import type { Models } from "@/three/models";
import type { PaintingId } from "@/config/painting";

// Loads the 10 level maps and every sprite cut from the concept art as textures for the 3D
// scene, keeping the decoded images too for the 2D effects overlay.

export type Pic = { tex: THREE.Texture; img: HTMLImageElement; aspect: number };
export type TowerViews = { front: Pic; back: Pic; left: Pic; right: Pic; proj: Pic; hit: Pic };
export type UprightViews = { front: Pic; back: Pic; side: Pic };
export type SideViews = { front: Pic; back: Pic; left: Pic; right: Pic };

export type Art = {
  towers: Record<TowerKind, TowerViews>;
  enemies: Record<EnemyKind, Pic>;
  maps: THREE.Texture[];
  // enemy skins cut from each biome's sheets (Cold World, Aqua Realm, Desert, Cyber Arena)
  skins: Record<EnemySkin, Record<EnemyKind, UprightViews>>;
  // the Desert boss's pyramid, whole and cracked
  pyramid: Pic[];
  // real 3D models where they exist (src/three/models.ts)
  models: Models;
  // towers drawn from four sides per level (they turn to face their target)
  sideTowers: { grassland: SideViews[]; water: SideViews[]; desert: SideViews[] };
  // the Cyber Arena boss's car form and its eight transformation frames
  bossCar: UprightViews;
  bossMorph: Pic[];
  // base sprite per upgrade level, per biome (Grassland borrows the Cold World fortress)
  bases: Record<EnemySkin, Pic[]>;
  // each biome's own three-level tower
  biomeTowers: Record<Skin, Pic[]>;
  iceBurst: Pic[];
  paintings: Record<PaintingId, THREE.Texture>;
  pad: Pic;
  shadow: THREE.Texture;
  // soft white halo, tinted per use: turret cores, enemy rim light, base crystals
  glow: THREE.Texture;
};

async function pic(url: string): Promise<Pic> {
  const img = new Image();
  // onload rather than img.decode(): Chrome can hold decode() back while the tab is hidden,
  // which would leave the loading screen hanging for a player who switched tabs
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return { tex, img, aspect: img.naturalWidth / Math.max(1, img.naturalHeight) };
}

// soft white radial halo for additive glows
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d canvas not supported");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.35, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// soft round blob used as the ground shadow under every sprite
function shadowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d canvas not supported");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.6, "rgba(0,0,0,0.3)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

async function towerViews(t: (typeof TOWER_ART)["basic"]): Promise<TowerViews> {
  const [front, back, left, right, proj, hit] = await Promise.all([pic(t.front), pic(t.back), pic(t.left), pic(t.right), pic(t.proj), pic(t.hit)]);
  return { front, back, left, right, proj, hit };
}

export async function loadArt(): Promise<Art> {
  const upright = async (v: { front: string; back: string; side: string }): Promise<UprightViews> => ({ front: await pic(v.front), back: await pic(v.back), side: await pic(v.side) });
  const skin = async (set: Record<EnemyKind, { front: string; back: string; side: string }>): Promise<Record<EnemyKind, UprightViews>> => ({
    scout: await upright(set.scout),
    brute: await upright(set.brute),
    overlord: await upright(set.overlord),
    titan: await upright(set.titan),
  });
  const pics = (urls: string[]): Promise<Pic[]> => Promise.all(urls.map(pic));
  const [snow, water, desert, cyberSkin, forest, bossCar, bossMorph, pyramid] = await Promise.all([skin(SNOW_ENEMY_ART), skin(AQUA_ENEMY_ART), skin(DESERT_ENEMY_ART), skin(CYBER_ENEMY_ART), skin(FOREST_ENEMY_ART), upright(BOSS_CAR_ART), pics(BOSS_MORPH_ART), pics(PYRAMID_ART)]);
  const [snowBases, aquaBases, desertBases, cyberBases, forestBases] = await Promise.all(["snow", "aqua", "desert", "cyber", "forest"].map((k) => pics(BASE_ART[k] ?? [])));
  const sides = (set: { front: string; back: string; left: string; right: string }[]): Promise<SideViews[]> => Promise.all(set.map(async (v) => ({ front: await pic(v.front), back: await pic(v.back), left: await pic(v.left), right: await pic(v.right) })));
  const [forestTower, aquaSides, desertSides] = await Promise.all([sides(FOREST_TOWER_ART), sides(AQUA_TOWER_VIEWS), sides(DESERT_TOWER_VIEWS)]);
  const [coldTower, aquaTower, desertTower, cyberTower, iceBurst] = await Promise.all([pics(COLD_TOWER_ART), pics(AQUA_TOWER_ART), pics(DESERT_TOWER_ART), pics(CYBER_TOWER_ART), pics(ICE_BURST_ART)]);
  const [basic, rapid, heavy, scout, brute, overlord, titan, pad, painting, cyber, maps] = await Promise.all([
    towerViews(TOWER_ART.basic),
    towerViews(TOWER_ART.rapid),
    towerViews(TOWER_ART.heavy),
    pic(ENEMY_ART.scout),
    pic(ENEMY_ART.brute),
    pic(ENEMY_ART.overlord),
    pic(ENEMY_ART.titan),
    pic(PAD_ART),
    pic(PAINTING_ART),
    pic(CYBER_ART),
    Promise.all(MAP_ART.map(pic)),
  ]);
  return {
    // the Cold World Tower has one view per level; its glows reuse the basic turret's
    towers: { basic, rapid, heavy, frost: { ...basic, front: coldTower[0] ?? basic.front } },
    skins: { snow, water, desert, cyber: cyberSkin, grassland: forest },
    pyramid,
    sideTowers: { grassland: forestTower, water: aquaSides, desert: desertSides },
    bossCar,
    bossMorph,
    bases: { snow: snowBases ?? [], water: aquaBases ?? [], desert: desertBases ?? [], cyber: cyberBases ?? [], grassland: forestBases ?? [] },
    biomeTowers: { snow: coldTower, water: aquaTower, desert: desertTower, cyber: cyberTower },
    models: await loadModels(),
    iceBurst,
    enemies: { scout, brute, overlord, titan },
    maps: maps.map((m) => m.tex),
    paintings: { grassland: painting.tex, cyber: cyber.tex },
    pad,
    shadow: shadowTexture(),
    glow: glowTexture(),
  };
}
