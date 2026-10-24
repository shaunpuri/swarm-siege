import type { Game, SendKind } from "@/types";
import type { Snapshot } from "@/net/protocol";
import { ENEMY_STRIDE, TOWER_STRIDE } from "@/net/protocol";
import type { VersusSession } from "@/net/versus";
import { SENDS } from "@/config/sends";
import { enemyName } from "@/config/biomes";
import { canBuy, sendCost } from "@/game/match";
import { WORLD_THUMBS } from "@/three/worldart";
import { button, h, setText, show } from "@/ui/dom";

// In-game panels for online versus: the rival card (name, waves, base health and a live mini
// map of their defence, drawn from their snapshots on top of the same map) and the send shop
// along the bottom, where coins buy enemies, boosts and bosses for the rival.

export type VersusHud = {
  root: HTMLElement;
  rival: HTMLElement;
  rivalName: HTMLElement;
  rivalStats: HTMLElement;
  rivalFill: HTMLElement;
  mini: HTMLCanvasElement;
  map: HTMLImageElement;
  shop: HTMLElement;
  items: Map<SendKind, HTMLButtonElement>;
  you: HTMLElement;
};

const MINI_W = 256;
const MINI_H = 144;

export function createVersusHud(host: HTMLElement, onBuy: (kind: SendKind) => void, onSplit: () => void): VersusHud {
  const root = h("div", "vs-hud hidden");
  const rival = h("div", "vs-rival");
  const rivalName = h("b", "", "RIVAL");
  const rivalStats = h("span", "vs-rival-stats");
  const track = h("div", "vs-rival-track");
  const rivalFill = h("div", "");
  track.appendChild(rivalFill);
  const mini = document.createElement("canvas");
  mini.width = MINI_W;
  mini.height = MINI_H;
  rival.append(rivalName, rivalStats, track, mini, button("small split", "WATCH RIVAL (V)", onSplit));
  const you = h("div", "vs-you");
  const shop = h("div", "vs-shop");
  shop.appendChild(h("small", "vs-shop-title", "SEND TO RIVAL"));
  const items = new Map<SendKind, HTMLButtonElement>();
  for (const s of SENDS) {
    const item = button("vs-item", "", () => onBuy(s.kind));
    items.set(s.kind, item);
    shop.appendChild(item);
  }
  root.append(rival, you, shop);
  host.appendChild(root);
  return { root, rival, rivalName, rivalStats, rivalFill, mini, map: new Image(), shop, items, you };
}

export function showVersusHud(hud: VersusHud, visible: boolean): void {
  show(hud.root, visible);
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function drawMini(hud: VersusHud, game: Game, opp: Snapshot | null): void {
  const ctx = hud.mini.getContext("2d");
  if (!ctx) return;
  const url = WORLD_THUMBS[game.level.id]?.[game.level.biome] ?? "";
  if (url && hud.map.src !== new URL(url, location.href).href) hud.map.src = url;
  ctx.clearRect(0, 0, MINI_W, MINI_H);
  if (hud.map.complete && hud.map.naturalWidth > 0) ctx.drawImage(hud.map, 0, 0, MINI_W, MINI_H);
  ctx.fillStyle = "rgba(2,6,23,0.35)";
  ctx.fillRect(0, 0, MINI_W, MINI_H);
  if (!opp) return;
  const sx = MINI_W / 1280;
  const sy = MINI_H / 720;
  for (let i = 0; i + TOWER_STRIDE - 1 < opp.towers.length; i += TOWER_STRIDE) {
    const level = opp.towers[i + 2] ?? 1;
    ctx.fillStyle = level >= 3 ? "#facc15" : level === 2 ? "#38bdf8" : "#e2e8f0";
    ctx.fillRect((opp.towers[i] ?? 0) * sx - 3, (opp.towers[i + 1] ?? 0) * sy - 3, 6, 6);
  }
  for (let i = 0; i + ENEMY_STRIDE - 1 < opp.enemies.length; i += ENEMY_STRIDE) {
    const boss = (opp.enemies[i + 2] ?? 0) >= 4;
    ctx.fillStyle = boss ? "#ef4444" : "#fb7185";
    ctx.beginPath();
    ctx.arc((opp.enemies[i] ?? 0) * sx, (opp.enemies[i + 1] ?? 0) * sy, boss ? 4.5 : 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function updateVersusHud(hud: VersusHud, game: Game, session: VersusSession): void {
  const opp = session.opp;
  const rivalName = session.names[1 - session.you] ?? "RIVAL";
  setText(hud.rivalName, rivalName.toUpperCase());
  setText(hud.rivalStats, opp ? `WAVE ${Math.max(1, opp.wave)}  |  ${opp.cleared} CLEARED  |  ${clock(opp.time)}${opp.baseHp <= 0 ? "  |  BASE FALLEN" : ""}` : "waiting...");
  hud.rivalFill.style.width = `${opp && opp.baseMax > 0 ? (opp.baseHp / opp.baseMax) * 100 : 100}%`;
  drawMini(hud, game, opp);
  const match = game.match;
  setText(hud.you, `YOU: ${match?.cleared ?? 0} CLEARED  |  ${clock(game.time)}  |  +${match?.income ?? 0} BONUS/WAVE`);
  if (!match) return;
  for (const s of SENDS) {
    const item = hud.items.get(s.kind);
    if (!item) continue;
    const label = s.pack ? `${s.pack.count > 1 ? `${s.pack.count}x ` : ""}${enemyName(s.pack.kind, game.level.biome)}` : s.desc;
    const soldOut = match.bought[s.kind] >= s.max;
    const key = `${s.kind}|${label}|${sendCost(match, s.kind)}|${canBuy(game, s.kind)}|${soldOut}`;
    if (item.dataset["key"] === key) continue;
    item.dataset["key"] = key;
    item.className = `vs-item ${s.kind} ${canBuy(game, s.kind) ? "" : "poor"} ${s.pack?.boss ? "boss" : ""}`;
    item.innerHTML = `<b>${s.name}</b><small>${label}</small><em>${soldOut ? "MAX" : sendCost(match, s.kind)}</em>`;
  }
}
