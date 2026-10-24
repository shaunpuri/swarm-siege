import type { Biome, Game } from "@/types";
import { baseLevel, nextBaseLevel } from "@/config/bases";
import { canUpgradeBase } from "@/game/bases";
import { button, h, show } from "@/ui/dom";
import { place, stat } from "@/ui/popup";

// Menu for a clicked base: its level, HP and defences, and the coin upgrade to the next level.

// Aqua Realm, Desert and Cyber Arena bases have their own names (from their base sheets)
const BASE_NAMES: Partial<Record<Biome, string[]>> = {
  grassland: ["Seedling Sanctuary", "Elderwood Fortress", "Ancient Root Forge"],
  water: ["Coral Outpost", "Trident Gateway", "Ocean Palace"],
  desert: ["Sand Outpost", "Sun Temple", "Ancient Temple Sanctuary"],
  cyber: ["Nexus Core", "Robot Deployment", "Factory Carrier"],
};

export function levelName(level: number, biome: Biome): string {
  return BASE_NAMES[biome]?.[level - 1] ?? baseLevel(level).name;
}

export function renderBaseMenu(el: HTMLElement, game: Game, index: number, upgrade: () => void): void {
  const base = game.bases[index];
  if (!base) return;
  const cur = baseLevel(base.level);
  const next = nextBaseLevel(base.level);
  el.innerHTML = "";
  el.appendChild(h("div", "pop-title", `${levelName(cur.level, game.level.biome).toUpperCase()}  (LEVEL ${base.level})`));
  const frac = base.hp / base.maxHp;
  const hp = h("div", "hpline");
  hp.innerHTML = `<div class="hptrack"><div style="width:${frac * 100}%;background:${frac > 0.6 ? "#4ade80" : frac > 0.3 ? "#facc15" : "#f87171"}"></div></div><span>${Math.ceil(base.hp)}/${base.maxHp} HP</span>`;
  el.appendChild(hp);
  const stats = h("div", "stats");
  stats.innerHTML = cur.weapons.length === 0 ? stat("DEFENCES", "none") : cur.weapons.map((w) => stat(w.name.toUpperCase(), `${w.damage}`)).join("") + (cur.shield > 0 ? stat("SHIELD", `${base.shield}/${cur.shield}`) : "");
  el.appendChild(stats);
  if (next) {
    const unlocks = next.weapons.map((w) => w.name).filter((n, i, all) => all.indexOf(n) === i).join(", ") + (next.shield > 0 ? ", Cryo Shield" : "");
    el.appendChild(
      button(
        `opt up ${canUpgradeBase(game, base) ? "" : "poor"}`,
        `<i class="swatch up"></i><span><b>Upgrade to ${levelName(next.level, game.level.biome)}</b><small>+${Math.round(next.hpBonus * base.startHp - cur.hpBonus * base.startHp)} max HP. ${unlocks}</small></span><em>${next.cost}</em>`,
        upgrade,
      ),
    );
  } else {
    el.appendChild(h("div", "pop-sub", "FULLY UPGRADED"));
  }
  place(el, base.pos.x, base.pos.y - 40);
  show(el, true);
}

export function baseMenuKey(game: Game, index: number): string {
  const base = game.bases[index];
  if (!base) return "";
  const next = nextBaseLevel(base.level);
  return ["base", index, base.level, Math.ceil(base.hp), base.shield, next !== null && game.coins >= next.cost].join("|");
}
