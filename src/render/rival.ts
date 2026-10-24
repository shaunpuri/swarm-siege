import type { Game } from "@/types";
import type { Art, Pic } from "@/three/art";
import type { Snapshot } from "@/net/protocol";
import { ENEMY_STRIDE, TOWER_STRIDE } from "@/net/protocol";
import { ENEMY_KINDS } from "@/config/enemies";
import { TOWER_KINDS } from "@/config/towers";
import { enemySkinOf, skinOf } from "@/three/skins";
import { WORLD_ART } from "@/three/worldart";
import { bar, hpColor, W, H } from "@/render/canvas";

// The rival's screen for split view: both players defend the same map, so their game is
// redrawn from their latest snapshot on top of that map, with the same sheet art for their
// turrets, enemies (with health bars) and base. It is a 2D picture, refreshed four times a
// second by the snapshots, so it costs almost nothing next to the 3D game.

export type RivalView = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; map: HTMLImageElement };

export function createRivalView(canvas: HTMLCanvasElement): RivalView {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas not supported");
  canvas.width = W;
  canvas.height = H;
  return { canvas, ctx, map: new Image() };
}

const ENEMY_H = [46, 60, 68, 150];

function drawPic(ctx: CanvasRenderingContext2D, pic: Pic | undefined, x: number, y: number, height: number, anchor: number): void {
  if (!pic) return;
  const w = height * pic.aspect;
  ctx.drawImage(pic.img, x - w / 2, y - height * (1 - anchor), w, height);
}

function towerPic(art: Art, game: Game, level: number, kindIndex: number): Pic | undefined {
  // the design follows the upgrade level
  const design = level - 1;
  if (game.level.biome === "water" || game.level.biome === "desert") return art.sideTowers[game.level.biome][design]?.front;
  const skin = skinOf(game.level.biome);
  if (skin) return art.biomeTowers[skin][design];
  const forest = game.level.mapArt === "world" ? art.sideTowers.grassland[design] : undefined;
  if (forest) return forest.front;
  const kind = TOWER_KINDS[kindIndex] ?? "basic";
  return kind === "frost" ? art.biomeTowers.snow[level - 1] : art.towers[kind].front;
}

function enemyPic(art: Art, game: Game, kindIndex: number): Pic | undefined {
  const kind = ENEMY_KINDS[kindIndex] ?? "scout";
  return art.skins[enemySkinOf(game.level.biome)][kind].front;
}

export function drawRival(view: RivalView, art: Art, game: Game, opp: Snapshot | null, name: string): void {
  const { ctx } = view;
  const url = WORLD_ART[game.level.id]?.[game.level.biome] ?? "";
  if (url && view.map.dataset["src"] !== url) {
    view.map.dataset["src"] = url;
    view.map.src = url;
  }
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, W, H);
  if (view.map.complete && view.map.naturalWidth > 0) {
    // the world maps are shown whole and scaled to the stage height (src/config/worlds.ts)
    const scale = H / view.map.naturalHeight;
    const mw = view.map.naturalWidth * scale;
    ctx.drawImage(view.map, (W - mw) / 2, 0, mw, H);
  }
  const basePic = art.bases[enemySkinOf(game.level.biome)][0];
  for (const b of game.bases) drawPic(ctx, basePic, b.pos.x, b.pos.y, 150, 0.18);
  if (!opp) {
    ctx.fillStyle = "rgba(2,6,23,0.6)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "700 40px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Waiting for ${name}...`, W / 2, H / 2);
    return;
  }
  const towers: { x: number; y: number; level: number; kind: number }[] = [];
  for (let i = 0; i + TOWER_STRIDE - 1 < opp.towers.length; i += TOWER_STRIDE) towers.push({ x: opp.towers[i] ?? 0, y: opp.towers[i + 1] ?? 0, level: opp.towers[i + 2] ?? 1, kind: opp.towers[i + 3] ?? 0 });
  const enemies: { x: number; y: number; code: number; hp: number }[] = [];
  for (let i = 0; i + ENEMY_STRIDE - 1 < opp.enemies.length; i += ENEMY_STRIDE) enemies.push({ x: opp.enemies[i] ?? 0, y: opp.enemies[i + 1] ?? 0, code: opp.enemies[i + 2] ?? 0, hp: opp.enemies[i + 3] ?? 100 });
  // painter's order: things further up the screen first
  const items = [...towers.map((t) => ({ y: t.y, draw: () => drawPic(ctx, towerPic(art, game, t.level, t.kind), t.x, t.y, 78 * (1 + (t.level - 1) * 0.07), 0.14) })), ...enemies.map((e) => ({ y: e.y, draw: () => drawEnemy(ctx, art, game, e) }))];
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
  // their scoreboard, top left
  ctx.fillStyle = "rgba(2,6,23,0.75)";
  ctx.fillRect(12, 12, 360, 70);
  ctx.textAlign = "left";
  ctx.fillStyle = "#facc15";
  ctx.font = "800 24px Orbitron, sans-serif";
  ctx.fillText(name.toUpperCase(), 26, 42);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "700 20px Rajdhani, sans-serif";
  ctx.fillText(`WAVE ${Math.max(1, opp.wave)}   ${opp.cleared} CLEARED   ${opp.coins} COINS`, 26, 68);
  bar(ctx, 390, 32, 220, 14, opp.baseMax > 0 ? opp.baseHp / opp.baseMax : 1, hpColor(opp.baseMax > 0 ? opp.baseHp / opp.baseMax : 1));
  if (opp.baseHp <= 0) {
    ctx.fillStyle = "rgba(127,29,29,0.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fecaca";
    ctx.font = "800 54px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("BASE DESTROYED", W / 2, H / 2);
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, art: Art, game: Game, e: { x: number; y: number; code: number; hp: number }): void {
  const kind = e.code % 4;
  const boss = e.code >= 4;
  const height = (ENEMY_H[kind] ?? 50) * (boss && kind === 2 ? 1.6 : 1) * 1.2;
  drawPic(ctx, enemyPic(art, game, kind), e.x, e.y, height, 0.08);
  bar(ctx, e.x - 18, e.y - height - 8, 36, 4, e.hp / 100, hpColor(e.hp / 100));
}
