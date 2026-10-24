import type { Biome, EnemyKind } from "@/types";
import { CODEX_ART } from "@/config/codexart";
import { BASE_LORE, CREATURE_LORE, TURRET_LORE } from "@/config/codex";
import { BIOME_NAMES, enemyName } from "@/config/biomes";
import { worldTowerName } from "@/config/towers";
import { levelName } from "@/ui/basemenu";
import { WORLDS } from "@/config/campaign";
import { button, h, show } from "@/ui/dom";

// The Codex: every world's creatures, turrets and bases as their 3D model renders, with what
// each one does. One tab per world.

const KINDS: EnemyKind[] = ["scout", "brute", "overlord", "titan"];

function card(art: string | undefined, name: string, lore: string, boss: boolean): HTMLElement {
  const el = h("div", `codex-card${boss ? " boss" : ""}`);
  el.innerHTML = `${art ? `<img src="${art}" alt="${name}" loading="lazy">` : '<div class="codex-noart">?</div>'}<b>${name}</b><small>${lore}</small>`;
  return el;
}

function section(title: string, cards: HTMLElement[]): HTMLElement {
  const box = h("div", "codex-section");
  box.appendChild(h("h3", "", title));
  const grid = h("div", "codex-grid");
  for (const c of cards) grid.appendChild(c);
  box.appendChild(grid);
  return box;
}

function worldPage(body: HTMLElement, biome: Biome): void {
  body.innerHTML = "";
  body.appendChild(section("CREATURES", KINDS.map((k) => card(CODEX_ART[`${biome}-${k}`], enemyName(k, biome), CREATURE_LORE[biome][k], k === "titan"))));
  body.appendChild(section("TURRETS (UPGRADE LEVELS 1, 2, 3)", [1, 2, 3].map((l) => card(CODEX_ART[`${biome}-tower-${l}`], worldTowerName(l, biome), TURRET_LORE[biome][l - 1] ?? "", false))));
  body.appendChild(section("BASE (UPGRADE LEVELS 1, 2, 3)", [1, 2, 3].map((l) => card(CODEX_ART[`${biome}-base-${l}`], levelName(l, biome), BASE_LORE[l - 1] ?? "", false))));
}

export function showCodex(el: HTMLElement, onBack: () => void): void {
  el.innerHTML = "";
  el.className = "screen camp profile codex";
  el.style.backgroundImage = "";
  const bar = h("div", "camp-bar");
  bar.appendChild(button("small back", "TITLE", onBack));
  bar.appendChild(h("div", "camp-title", "CODEX"));
  el.appendChild(bar);
  const tabs = h("div", "codex-tabs");
  const body = h("div", "codex-body");
  const pick = (biome: Biome): void => {
    for (const t of tabs.children) t.classList.toggle("on", t.getAttribute("data-biome") === biome);
    worldPage(body, biome);
  };
  for (const w of WORLDS) {
    const t = button("codex-tab", BIOME_NAMES[w.biome], () => pick(w.biome));
    t.setAttribute("data-biome", w.biome);
    t.style.setProperty("--c", w.color);
    tabs.appendChild(t);
  }
  el.append(tabs, body);
  pick("grassland");
  show(el, true);
}
