import type { Game, PowerKind, Vec } from "@/types";
import { POWER_KINDS, POWERS } from "@/config/enemies";
import { TOWER_KINDS } from "@/config/towers";
import { startWave } from "@/game/loop";
import { towerById } from "@/game/state";
import { buildTower, cycleMode, repairTower, sellTower, specializeTower, upgradeTower } from "@/game/towers";
import { usePower } from "@/game/powers";
import { slashVineAt } from "@/game/vines";
import { dist } from "@/game/geometry";
import { upgradeBase } from "@/game/bases";
import { toLogical } from "@/render/canvas";
import { unlockAudio } from "@/audio/sfx";
import { show } from "@/ui/dom";
import { baseAt, padAt, towerAt } from "@/ui/hittest";
import { baseMenuKey, renderBaseMenu } from "@/ui/basemenu";
import { padMenuKey, renderPadMenu, renderTowerMenu, towerMenuKey } from "@/ui/popup";
import type { PopupActions } from "@/ui/popup";
import { popup, ui, view } from "@/ui/state";

// What the player does with mouse and keyboard during a level: the build / upgrade popup,
// clicks on pads, turrets, bases and vines, powers, and calling waves.

export function closePopup(): void {
  ui.selection = null;
  ui.previewKind = null;
  ui.menuKey = "";
  show(popup, false);
}

export const actions: PopupActions = {
  build: (padIndex, kind) => {
    if (!ui.game) return;
    const tower = buildTower(ui.game, padIndex, kind);
    if (tower) ui.selection = { kind: "tower", id: tower.id };
    ui.previewKind = null;
    ui.menuKey = "";
  },
  upgrade: (t) => {
    if (ui.game) upgradeTower(ui.game, t);
    ui.menuKey = "";
  },
  specialize: (t, spec) => {
    if (ui.game) specializeTower(ui.game, t, spec);
    ui.menuKey = "";
  },
  repair: (t) => {
    if (ui.game) repairTower(ui.game, t);
    ui.menuKey = "";
  },
  sell: (t) => {
    if (ui.game) sellTower(ui.game, t);
    closePopup();
  },
  mode: (t) => {
    cycleMode(t);
    ui.menuKey = "";
  },
  preview: (kind) => {
    ui.previewKind = kind;
  },
};

export function refreshPopup(game: Game): void {
  const sel = ui.selection;
  if (sel?.kind === "tower") {
    const tower = towerById(game, sel.id);
    if (!tower) {
      closePopup();
      return;
    }
    const key = towerMenuKey(game, tower);
    if (key !== ui.menuKey) {
      ui.menuKey = key;
      renderTowerMenu(popup, game, tower, actions);
    }
    return;
  }
  if (sel?.kind === "base") {
    const key = baseMenuKey(game, sel.index);
    if (key !== ui.menuKey) {
      ui.menuKey = key;
      renderBaseMenu(popup, game, sel.index, () => {
        const base = game.bases[sel.index];
        if (base) upgradeBase(game, base);
        ui.menuKey = "";
      });
    }
    return;
  }
  if (sel?.kind === "pad") {
    const key = padMenuKey(game, sel.index);
    if (key !== ui.menuKey) {
      ui.menuKey = key;
      renderPadMenu(popup, game, sel.index, actions);
    }
  }
}

function handleClick(p: Vec): void {
  const game = ui.game;
  if (!game) return;
  unlockAudio();
  if (ui.aiming === "strike") {
    usePower(game, "strike", p);
    ui.aiming = null;
    return;
  }
  if (slashVineAt(game, p)) {
    ui.slashed = true;
    return;
  }
  const tower = game.towers.find((t) => dist({ x: t.pos.x, y: t.pos.y - 22 }, p) < 34);
  if (tower) {
    ui.selection = { kind: "tower", id: tower.id };
    ui.menuKey = "";
    return;
  }
  const pad = padAt(game, p);
  if (pad >= 0) {
    ui.selection = { kind: "pad", index: pad };
    ui.menuKey = "";
    return;
  }
  const base = baseAt(game, p);
  if (base >= 0) {
    ui.selection = { kind: "base", index: base };
    ui.menuKey = "";
    return;
  }
  closePopup();
}

export function triggerPower(kind: PowerKind): void {
  const game = ui.game;
  if (!game) return;
  if (kind === "strike") {
    ui.aiming = ui.aiming === "strike" ? null : "strike";
    return;
  }
  usePower(game, kind, null);
}

export function callWave(): void {
  if (ui.game) startWave(ui.game);
}

// pause and the game speed are owned by the main loop, which may lock them (versus)
export function bindInput(hooks: { togglePause: () => void; cycleSpeed: () => void; toggleSplit: () => void }): void {
  view.canvas.addEventListener("pointermove", (ev) => {
    const p = toLogical(view, ev.clientX, ev.clientY);
    ui.hover = p;
    ui.hoverPad = ui.game ? padAt(ui.game, p) : -1;
    const overTower = ui.game ? towerAt(ui.game, p) || baseAt(ui.game, p) >= 0 : false;
    view.canvas.style.cursor = ui.aiming ? "crosshair" : ui.hoverPad >= 0 || overTower ? "pointer" : "default";
  });
  view.canvas.addEventListener("pointerleave", () => {
    ui.hover = null;
    ui.hoverPad = -1;
  });
  view.canvas.addEventListener("pointerdown", (ev) => {
    if (ev.button === 2) {
      ui.aiming = null;
      return;
    }
    handleClick(toLogical(view, ev.clientX, ev.clientY));
  });
  view.canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());
  window.addEventListener("keydown", (ev) => {
    const game = ui.game;
    if (!game) return;
    const key = ev.key.toUpperCase();
    if (key === " ") {
      ev.preventDefault();
      hooks.togglePause();
      return;
    }
    if (key === "ESCAPE") {
      ui.aiming = null;
      closePopup();
      return;
    }
    if (key === "F") hooks.cycleSpeed();
    if (key === "V") hooks.toggleSplit();
    if (key === "N" || key === "ENTER") callWave();
    const power = POWER_KINDS.find((k) => POWERS[k].key === key);
    if (power) triggerPower(power);
    const sel = ui.selection;
    if (sel?.kind === "pad" && (key === "1" || key === "2" || key === "3")) {
      const kind = TOWER_KINDS[Number(key) - 1];
      if (kind) actions.build(sel.index, kind);
    }
    if (sel?.kind === "tower") {
      const tower = towerById(game, sel.id);
      if (!tower) return;
      if (key === "U") actions.upgrade(tower);
      if (key === "H") actions.repair(tower);
      if (key === "X") actions.sell(tower);
      if (key === "M") actions.mode(tower);
    }
  });

}
