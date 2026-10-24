import * as THREE from "three";
import type { Game } from "@/types";
import type { Art } from "@/three/art";
import { entranceProgress, isFinalBoss, stageDist } from "@/config/bosses";
import { pointAt } from "@/game/geometry";
import { litMaterial } from "@/three/lit";
import { toWorld } from "@/three/stage";

// Set pieces for boss entrances. On the Desert's last level the Mummy King's pyramid stands
// over his entrance for the whole level. When he arrives it follows the timeline on his
// sheet: a golden glow (0s), cracks with light pouring out (0.5s), then it bursts (1s) and
// is gone, leaving the sandstorm and stones (drawn by src/render/bossintro.ts).

export type BossProps = { art: Art; pyramid: THREE.Sprite | null; burst: boolean };

const PYRAMID_H = 190;

export function createBossProps(art: Art): BossProps {
  return { art, pyramid: null, burst: false };
}

export function hasPyramid(game: Game): boolean {
  return game.level.biome === "desert" && game.level.mapArt === "world" && game.level.boss === "titan";
}

// where the Mummy King appears: out in the open along the boss's road (the last route); the
// pyramid stands just beside the road there, on the side away from it
export function bossStage(game: Game): { x: number; y: number; angle: number } {
  const route = game.routes[game.routes.length - 1];
  if (!route) return { x: 640, y: 200, angle: 0 };
  const at = pointAt(route, stageDist(route));
  return { x: at.pos.x, y: at.pos.y, angle: at.angle };
}

export function pyramidSpot(game: Game): { x: number; y: number } {
  const s = bossStage(game);
  // step off the road, toward the top of the screen so the road stays in front of it
  const side = Math.sin(s.angle + Math.PI / 2) < 0 ? 1 : -1;
  return { x: s.x + Math.cos(s.angle + Math.PI / 2) * 70 * side, y: s.y + Math.sin(s.angle + Math.PI / 2) * 70 * side - 10 };
}

export function syncBossProps(group: THREE.Group, props: BossProps, game: Game): void {
  if (!hasPyramid(game) || props.burst) return;
  const [whole, cracked] = props.art.pyramid;
  if (!whole || !cracked) return;
  let s = props.pyramid;
  if (!s) {
    s = new THREE.Sprite(litMaterial(whole.tex, "desert", true));
    s.center.set(0.5, 0.06);
    s.scale.set(PYRAMID_H * whole.aspect, PYRAMID_H, 1);
    s.position.copy(toWorld(pyramidSpot(game), 1));
    s.renderOrder = 3;
    group.add(s);
    props.pyramid = s;
  }
  const boss = game.enemies.find(isFinalBoss);
  const k = boss ? entranceProgress(boss, game.level.biome) : null;
  const mat = s.material;
  if (k === null) {
    // waiting for the last wave: a faint golden glow breathes inside
    const glow = 1 + 0.06 * Math.sin(game.time * 1.5);
    mat.color.setRGB(glow, glow, glow * 0.95);
    return;
  }
  if (k >= 0.25) {
    // it bursts open
    group.remove(s);
    mat.dispose();
    props.pyramid = null;
    props.burst = true;
    return;
  }
  const map = k < 0.125 ? whole.tex : cracked.tex;
  if (mat.map !== map) {
    mat.map = map;
    mat.needsUpdate = true;
  }
  const flare = 1.15 + k * 3;
  mat.color.setRGB(flare, flare * 0.92, flare * 0.6);
  // it shudders as the cracks spread
  const shake = k > 0.125 ? Math.sin(game.time * 60) * 3 : 0;
  s.position.copy(toWorld({ x: pyramidSpot(game).x + shake, y: pyramidSpot(game).y }, 1));
}
