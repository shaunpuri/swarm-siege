import { nowMs } from "@/clock";
import type { Biome, EnemyKind, Game, TowerKind } from "@/types";
import { enemyName } from "@/config/biomes";
import type { Progress } from "@/progress";
import { MAP_MODES, levelsFor } from "@/config/levels";
import type { MapMode } from "@/config/levels";
import { ENEMIES } from "@/config/enemies";
import { ADAPTATIONS } from "@/game/adapt";
import { ROLE_NAMES, TOWERS } from "@/config/towers";
import { starsFor, worldProgress } from "@/progress";
import { button, h, show } from "@/ui/dom";
import type { BadgeDef } from "@/badges";

// Full-screen overlays: title + level select, pause, victory, defeat. Plus the
// centre-top banner used for wave starts, evolution reports and boss warnings.

function starRow(n: number): string {
  return [1, 2, 3].map((i) => `<i class="star ${i <= n ? "on" : ""}"></i>`).join("");
}

export function showLoading(el: HTMLElement): void {
  el.className = "screen";
  el.style.backgroundImage = "";
  el.innerHTML = `<div class="loading"><b>SWARM SIEGE</b><span>Loading the five worlds...</span></div>`;
  show(el, true);
}

const MODE_LABELS: Record<MapMode, string> = {
  maps: "LEVEL MAPS",
  grassland: "GRASSLAND PAINTING",
  cyber: "CYBER ARENA PAINTING",
  "world-grassland": "GRASSLAND",
  "world-snow": "COLD WORLD",
  "world-desert": "DESERT",
  "world-water": "AQUA REALM",
  "world-cyber": "CYBER ARENA",
};

// title backdrop is the Grassland painting itself, darkened so the menu stays readable
export function showLevelSelect(
  el: HTMLElement,
  progress: Progress,
  unlockAll: boolean,
  thumbs: Map<number, HTMLImageElement>,
  backdrop: string,
  onPick: (id: number) => void,
  mode: { current: MapMode; pick: (mode: MapMode) => void },
): void {
  el.innerHTML = "";
  el.className = "screen title";
  el.style.backgroundImage = `linear-gradient(180deg, rgba(2,6,23,0.55), rgba(2,6,23,0.88) 70%), url("${backdrop}")`;
  const head = h("div", "title-head");
  head.innerHTML = `<h1>SWARM SIEGE</h1><p class="tag">The swarm learns from every wave. Adapt or fall.</p>`;
  el.appendChild(head);
  const modes = h("div", "map-modes");
  for (const m of MAP_MODES) {
    // a world only appears once at least one of its maps is painted
    if (levelsFor(m).length === 0) continue;
    modes.appendChild(button(`mode ${mode.current === m ? "on" : ""}`, MODE_LABELS[m], () => mode.current !== m && mode.pick(m)));
  }
  el.appendChild(modes);
  el.appendChild(h("div", "world-label", MODE_LABELS[mode.current]));
  const grid = h("div", "level-grid");
  for (const level of levelsFor(mode.current)) {
    const locked = !unlockAll && level.id > worldProgress(progress, mode.current).unlocked;
    const card = button(`level-card ${locked ? "locked" : ""}`, "", () => {
      if (!locked) onPick(level.id);
    });
    const thumb = thumbs.get(level.id);
    if (thumb) {
      const wrap = h("div", "thumb-wrap");
      wrap.appendChild(thumb);
      card.appendChild(wrap);
    }
    const info = h("div", "card-info");
    info.innerHTML = `<span class="num">${level.id}</span><b>${level.name}</b><small>${level.waves} waves${level.boss ? "  BOSS" : ""}</small><span class="stars">${starRow(starsFor(progress, mode.current, level.id))}</span>${locked ? '<span class="lock">LOCKED</span>' : ""}`;
    card.appendChild(info);
    grid.appendChild(card);
  }
  el.appendChild(grid);
  const how = h("div", "howto");
  how.innerHTML =
    "<b>HOW TO PLAY</b> Click a glowing pad to build. Click a turret to upgrade, repair, sell or change targeting. " +
    "At level 3 every turret unlocks an ability (Ricochet, Laser, Flamethrower, Cryo, Cluster, Nuke). " +
    "Spend coins on power-ups (Q W E R T Y). Call waves early for bonus coins. " +
    "<b>The twist:</b> after each wave the swarm evolves armour against your most used turret, so mix your defence. " +
    "Brutes and Overlords damage turrets, and the final boss grows poison vines: click them to cut them.";
  el.appendChild(how);
  show(el, true);
}

// next: the label for going on after a win (NEXT LEVEL, or NEXT WORLD after a world's last
// level), or null when there is nothing after this level
export function showEndScreen(el: HTMLElement, game: Game, won: boolean, stars: number, next: string | null, actions: { retry: () => void; next: () => void; menu: () => void }, badges: BadgeDef[] = []): void {
  el.innerHTML = "";
  el.className = `screen end ${won ? "won" : "lost"}`;
  el.style.backgroundImage = "";
  const card = h("div", "end-card");
  const baseHp = game.bases.reduce((s, b) => s + b.hp, 0);
  const maxHp = game.bases.reduce((s, b) => s + b.maxHp, 0);
  card.innerHTML = won
    ? `<h2>VICTORY</h2><div class="stars big">${starRow(stars)}</div><p>Level ${game.level.id} ${game.level.name} cleared.</p><p class="meta">${game.kills} enemies defeated  |  bases ${Math.ceil(baseHp)}/${maxHp} HP</p>`
    : `<h2>BASE DESTROYED</h2><p>The swarm broke through on wave ${game.wave} of ${game.level.waves}.</p><p class="meta">Tip: mix turret types so evolution cannot counter you, and repair turrets between waves.</p>`;
  if (badges.length > 0) card.innerHTML += `<div class="badge-row">${badges.map((b) => `<span class="badge-chip" style="--c:${b.color}">BADGE: ${b.name}</span>`).join("")}</div>`;
  const row = h("div", "row");
  if (won && next) row.appendChild(button("big primary", next, actions.next));
  row.appendChild(button(`big ${won && next ? "" : "primary"}`, won ? "REPLAY" : "RETRY", actions.retry));
  row.appendChild(button("big", "MAP", actions.menu));
  card.appendChild(row);
  el.appendChild(card);
  show(el, true);
}

export function showPause(el: HTMLElement, actions: { resume: () => void; restart: () => void; menu: () => void }): void {
  el.innerHTML = "";
  el.className = "screen end";
  el.style.backgroundImage = "";
  const card = h("div", "end-card");
  card.innerHTML = "<h2>PAUSED</h2>";
  const row = h("div", "row");
  row.appendChild(button("big primary", "RESUME", actions.resume));
  row.appendChild(button("big", "RESTART", actions.restart));
  row.appendChild(button("big", "MAP", actions.menu));
  card.appendChild(row);
  el.appendChild(card);
  show(el, true);
}

// when the banner on show goes away (on the page clock, so recordings keep it up as long)
let bannerHideAt = 0;

export function banner(el: HTMLElement, html: string, kind: "info" | "evolve" | "boss" | "good" | "victory", seconds: number): void {
  el.innerHTML = html;
  el.className = `banner ${kind}`;
  // restart the CSS entry animation
  void el.offsetWidth;
  el.classList.add("in");
  bannerHideAt = nowMs() + seconds * 1000;
}

// every frame: hides the banner once its time is up
export function tickBanner(el: HTMLElement): void {
  if (bannerHideAt > 0 && nowMs() >= bannerHideAt) {
    el.classList.add("hidden");
    bannerHideAt = 0;
  }
}

// world: name the turret by the world's own design (Sun Reflector, Flame Cannon...)
export function evolveBanner(family: TowerKind, share: number, biome: Biome | null): string {
  const a = ADAPTATIONS[family];
  const turret = biome ? `${ROLE_NAMES[family]} turret` : TOWERS[family].name;
  return `<small>THE SWARM EVOLVED</small><b style="color:${a.color}">${a.name.toUpperCase()}</b><span>${Math.round(share * 100)}% of our losses came from your ${turret}s. Next wave takes 50% less damage from them.</span>`;
}

// a boss's name, as its warning banner names it
export function bossName(kind: EnemyKind, biome: Biome): string {
  if (kind === "titan") {
    const titans: Record<Biome, string> = { grassland: "Elderwood Colossus", snow: "Ice Dragon", desert: "Mummy King", water: "Damyaan", cyber: "Transformer Overlord" };
    return titans[biome];
  }
  return `${enemyName(kind, biome)} Commander`;
}

// the gold banner when a boss falls
export function bossDownBanner(kind: EnemyKind, biome: Biome, reward: number): string {
  return `<small>BOSS DEFEATED</small><b>${bossName(kind, biome).toUpperCase()}</b><span>+${reward} coins</span>`;
}

export function bossBanner(kind: EnemyKind, biome: Biome): string {
  if (biome === "water" && kind === "titan") {
    return `<small>WARNING</small><b>DAMYAAN</b><span>The Serpent Lord of the Ocean. His water tendrils drown turrets: click them to cut them.</span>`;
  }
  if (biome === "grassland" && kind === "titan") {
    return `<small>WARNING</small><b>ELDERWOOD COLOSSUS</b><span>The ancient forest guardian awakens. Its poison vines rot turrets: click them to cut them.</span>`;
  }
  if (biome === "cyber") {
    return kind === "titan"
      ? `<small>WARNING</small><b>TRANSFORMER OVERLORD</b><span>It races in as a car, then transforms into a giant robot. Its energy cables fry turrets: click them to cut them.</span>`
      : `<small>WARNING</small><b>${enemyName(kind, biome).toUpperCase()} COMMANDER</b><span>Huge HP. It fires energy bolts at your turrets.</span>`;
  }
  if (biome === "desert") {
    return kind === "titan"
      ? `<small>WARNING</small><b>MUMMY KING</b><span>The ancient ruler awakened from the sands. His cursed bandages bind turrets: click them to cut them.</span>`
      : `<small>WARNING</small><b>${enemyName(kind, biome).toUpperCase()} COMMANDER</b><span>Huge HP. It hurls sand blasts at your turrets.</span>`;
  }
  if (biome === "water") return `<small>WARNING</small><b>${enemyName(kind, biome).toUpperCase()} COMMANDER</b><span>Huge HP. It blasts your turrets with water.</span>`;
  if (biome === "snow") {
    return kind === "titan"
      ? `<small>WARNING</small><b>ICE DRAGON</b><span>Final boss. Its ice chains freeze turrets: click them to cut them.</span>`
      : `<small>WARNING</small><b>${enemyName(kind, biome).toUpperCase()} COMMANDER</b><span>Huge HP. It hurls ice at your turrets.</span>`;
  }
  const def = ENEMIES[kind];
  return kind === "titan"
    ? `<small>WARNING</small><b>HIVE TITAN</b><span>It summons poison vines. Click vines to cut them, or use Orbital Strike.</span>`
    : `<small>WARNING</small><b>${(biome === "grassland" ? enemyName(kind, biome) : def.name).toUpperCase()} COMMANDER</b><span>Huge HP. It strikes your turrets from range.</span>`;
}

export function tip(el: HTMLElement, text: string | null): void {
  if (text === null) {
    show(el, false);
    return;
  }
  if (el.textContent !== text) el.textContent = text;
  show(el, true);
}
