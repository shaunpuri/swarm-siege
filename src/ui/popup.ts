import type { Game, SpecKind, Tower, TowerKind } from "@/types";
import { ROLE_NAMES, SPECS, TOWERS, TOWER_KINDS, nextUpgradeCost, towerStats, worldTowerName } from "@/config/towers";
import { LEVELS } from "@/config/levels";
import { uiZoom } from "@/render/canvas";
import { repairCost, sellValue } from "@/game/towers";
import { button, h, show } from "@/ui/dom";

// Context menu that appears next to a clicked pad (build) or turret (upgrade/repair/sell).

export type PopupActions = {
  build: (padIndex: number, kind: TowerKind) => void;
  upgrade: (tower: Tower) => void;
  specialize: (tower: Tower, spec: SpecKind) => void;
  repair: (tower: Tower) => void;
  sell: (tower: Tower) => void;
  mode: (tower: Tower) => void;
  preview: (kind: TowerKind | null) => void;
};

const MODE_LABEL = { first: "FIRST", strong: "STRONGEST", close: "CLOSEST" };

function unlockLevel(kind: TowerKind): number {
  return LEVELS.find((l) => l.towers.includes(kind))?.id ?? 1;
}

// enlarged on small screens (uiZoom) so its text and buttons stay readable and tappable
export function place(el: HTMLElement, x: number, y: number): void {
  const zoom = uiZoom();
  const width = 270 * zoom;
  el.style.left = `${Math.max(8, Math.min(1280 - width - 8, x - width / 2))}px`;
  el.style.transformOrigin = y < 380 ? "top left" : "bottom left";
  if (y < 380) {
    el.style.top = `${Math.min(y + 34, 720 - 8)}px`;
    el.style.transform = `scale(${zoom})`;
  } else {
    el.style.top = `${y - 40}px`;
    el.style.transform = `translateY(-100%) scale(${zoom})`;
  }
}

// what each turret type does, for the world build menu (the names come from the world's sheet)
const ROLE: Record<TowerKind, string> = {
  basic: "Steady single-target damage. Good range.",
  rapid: "Fast fire that shreds swarms up close.",
  heavy: "Slow, heavy splash shots against packs and armour.",
  frost: "Heavy splash shots against packs, ricocheting blasts at level 3.",
};

export function renderPadMenu(el: HTMLElement, game: Game, padIndex: number, actions: PopupActions): void {
  const pad = game.pads[padIndex];
  if (!pad) return;
  el.innerHTML = "";
  el.appendChild(h("div", "pop-title", "BUILD TURRET"));
  // the worlds swap the Heavy Tower for their own tower, so it is never listed there; in the
  // legacy modes the biome tower is only listed where it exists
  const world = game.level.mapArt === "world";
  for (const kind of TOWER_KINDS.filter((k) => (world ? k !== "heavy" : k !== "frost" || game.level.towers.includes(k)))) {
    const def = TOWERS[kind];
    const locked = !game.level.towers.includes(kind);
    const poor = game.coins < def.cost;
    // in the worlds every turret starts as the sheet's level 1 design; the type is its role
    const name = world ? `${worldTowerName(1, game.level.biome)} (${ROLE_NAMES[kind]})` : def.name;
    const label = locked
      ? `<b>${name}</b><small>Unlocks in Level ${unlockLevel(kind)}</small>`
      : world
        ? `<b>${name}</b><small>${ROLE[kind]}</small>`
        : `<b>${def.name}</b><small>${def.desc}</small>`;
    const btn = button(`opt ${kind} ${locked ? "locked" : ""} ${poor ? "poor" : ""}`, `<i class="swatch"></i><span>${label}</span><em>${locked ? "LOCKED" : def.cost}</em>`, () => {
      if (!locked && !poor) actions.build(padIndex, kind);
    });
    btn.addEventListener("mouseenter", () => actions.preview(locked ? null : kind));
    btn.addEventListener("mouseleave", () => actions.preview(null));
    el.appendChild(btn);
  }
  place(el, pad.pos.x, pad.pos.y);
  show(el, true);
}

export function stat(label: string, value: string): string {
  return `<span class="stat"><small>${label}</small>${value}</span>`;
}

export function renderTowerMenu(el: HTMLElement, game: Game, tower: Tower, actions: PopupActions): void {
  const s = towerStats(tower);
  el.innerHTML = "";
  const head = h("div", "pop-title");
  head.textContent = (game.level.mapArt === "world" && tower.spec === null ? `${worldTowerName(tower.level, game.level.biome)} (${ROLE_NAMES[tower.kind]})` : s.name).toUpperCase();
  el.appendChild(head);
  const hpFrac = tower.hp / tower.maxHp;
  const hp = h("div", "hpline");
  hp.innerHTML = `<div class="hptrack"><div style="width:${hpFrac * 100}%;background:${hpFrac > 0.6 ? "#4ade80" : hpFrac > 0.3 ? "#facc15" : "#f87171"}"></div></div><span>${Math.ceil(tower.hp)}/${tower.maxHp} HP</span>`;
  el.appendChild(hp);
  const stats = h("div", "stats");
  stats.innerHTML = stat("DMG", s.damage.toFixed(0)) + stat("RATE", `${s.rate.toFixed(2)}/s`) + stat("RANGE", s.range.toFixed(0)) + (s.splash > 0 ? stat("SPLASH", s.splash.toFixed(0)) : "");
  el.appendChild(stats);

  const upCost = nextUpgradeCost(tower);
  if (upCost !== null) {
    const next = towerStats({ kind: tower.kind, level: tower.level + 1, spec: null });
    el.appendChild(
      button(`opt up ${game.coins < upCost ? "poor" : ""}`, `<i class="swatch up"></i><span><b>Upgrade to ${game.level.mapArt === "world" ? worldTowerName(tower.level + 1, game.level.biome) : `L${tower.level + 1}`}</b><small>DMG ${s.damage.toFixed(0)} > ${next.damage.toFixed(0)}, HP ${s.hp} > ${next.hp}</small></span><em>${upCost}</em>`, () => actions.upgrade(tower)),
    );
  } else if (tower.spec === null && TOWERS[tower.kind].specs.length > 0) {
    el.appendChild(h("div", "pop-sub", "CHOOSE AN ABILITY"));
    for (const spec of TOWERS[tower.kind].specs) {
      const def = SPECS[spec];
      el.appendChild(
        button(`opt spec ${game.coins < def.cost ? "poor" : ""}`, `<i class="swatch" style="background:${def.color}"></i><span><b>${def.name}</b><small>${def.desc}</small></span><em>${def.cost}</em>`, () => actions.specialize(tower, spec)),
      );
    }
  }

  const row = h("div", "row");
  const rCost = repairCost(tower);
  row.appendChild(button(`small ${rCost === 0 || game.coins < rCost ? "poor" : "repair"}`, rCost === 0 ? "FULL HP" : `REPAIR ${rCost}`, () => actions.repair(tower)));
  row.appendChild(button("small", `TARGET: ${MODE_LABEL[tower.mode]}`, () => actions.mode(tower)));
  row.appendChild(button("small sell", `SELL +${sellValue(tower)}`, () => actions.sell(tower)));
  el.appendChild(row);
  place(el, tower.pos.x, tower.pos.y);
  show(el, true);
}

// a cheap fingerprint so the menu only re-renders when something on it changed
export function towerMenuKey(game: Game, tower: Tower): string {
  const cost = nextUpgradeCost(tower) ?? 0;
  return [tower.id, tower.level, tower.spec, Math.ceil(tower.hp), tower.mode, game.coins >= cost, game.coins >= repairCost(tower), game.coins >= 300].join("|");
}

export function padMenuKey(game: Game, padIndex: number): string {
  return [padIndex, ...TOWER_KINDS.map((k) => game.coins >= TOWERS[k].cost)].join("|");
}
