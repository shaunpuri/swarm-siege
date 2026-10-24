import type { Biome, Difficulty, EnemyKind, LevelDef } from "@/types";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "@/config/difficulty";
import type { World } from "@/config/campaign";
import { enemyName } from "@/config/biomes";
import { AQUA_ENEMY_ART, CYBER_ENEMY_ART, DESERT_ENEMY_ART, FOREST_ENEMY_ART, SNOW_ENEMY_ART } from "@/three/manifest";
import { WORLD_THUMBS } from "@/three/worldart";
import { button, h } from "@/ui/dom";

// The level briefing that opens over the level map: the map itself, what to expect (waves,
// entrances, the enemies and the boss, shown with their own art), the best stars so far,
// the difficulty (remembered between levels) and PLAY.

const DIFF_KEY = "swarm-siege-difficulty";

function savedDifficulty(): Difficulty {
  try {
    return DIFFICULTY_ORDER.find((d) => d === localStorage.getItem(DIFF_KEY)) ?? "medium";
  } catch {
    return "medium";
  }
}

function saveDifficulty(d: Difficulty): void {
  try {
    localStorage.setItem(DIFF_KEY, d);
  } catch {
    // the choice just will not be remembered
  }
}

function difficultyPicker(best: number, onPick: (d: Difficulty) => void): HTMLElement {
  const wrap = h("div", "diff-pick");
  wrap.appendChild(h("small", "", "DIFFICULTY"));
  let current = savedDifficulty();
  const buttons = DIFFICULTY_ORDER.map((d, i) => {
    const def = DIFFICULTIES[d];
    const b = button(`diff ${d} ${d === current ? "on" : ""}`, `${def.name.toUpperCase()}${best >= i + 1 ? " <i>CLEARED</i>" : ""}`, () => {
      current = d;
      saveDifficulty(d);
      for (const x of buttons) x.classList.toggle("on", x === b);
      onPick(d);
    });
    b.style.setProperty("--c", def.color);
    return b;
  });
  for (const b of buttons) wrap.appendChild(b);
  onPick(current);
  return wrap;
}

function portrait(kind: EnemyKind, biome: Biome): string {
  if (biome === "snow") return SNOW_ENEMY_ART[kind].front;
  if (biome === "water") return AQUA_ENEMY_ART[kind].front;
  if (biome === "desert") return DESERT_ENEMY_ART[kind].front;
  if (biome === "cyber") return CYBER_ENEMY_ART[kind].front;
  return FOREST_ENEMY_ART[kind].front;
}

const ENTRY_TEXT: Record<string, string> = {
  tunnel: "Tunnel",
  burrow: "Burrow: they dig out of the ground",
  drop: "Drop zone: they fall from the sky",
  swim: "From above: they swim down",
};

function entrances(level: LevelDef): string {
  const kinds = [...new Set(level.entries)].map((e) => ENTRY_TEXT[e] ?? e);
  const portals = level.jumps.some((j) => j.length > 0) ? ["Portal: they teleport across the map"] : [];
  return [...kinds, ...portals].join("  |  ");
}

// best: hardest difficulty cleared so far (0 none, 1 easy, 2 medium, 3 hard)
export function showBriefing(host: HTMLElement, world: World, level: LevelDef, stars: number, best: number, onPlay: (difficulty: Difficulty) => void): void {
  host.querySelector(".briefing-wrap")?.remove();
  const wrap = h("div", "briefing-wrap");
  const card = h("div", "briefing");
  card.style.setProperty("--tint", world.color);
  const close = (): void => wrap.remove();
  wrap.addEventListener("click", (ev) => {
    if (ev.target === wrap) close();
  });
  const map = h("div", "brief-map");
  map.style.backgroundImage = `url("${WORLD_THUMBS[level.id]?.[level.biome] ?? ""}")`;
  card.appendChild(map);
  const info = h("div", "brief-info");
  const foes = [...level.enemies, ...(level.boss ? [level.boss] : [])];
  info.innerHTML =
    `<small>${world.name.toUpperCase()}  |  LEVEL ${level.id}</small><h2>${level.name.toUpperCase()}</h2>` +
    `<p>${level.keyChange}</p>` +
    `<div class="brief-stats"><span><b>${level.waves}</b> waves</span><span><b>${level.startCoins}</b> coins</span><span><b>${level.pads.length}</b> pads</span><span><b>${level.bases.length}</b> base${level.bases.length > 1 ? "s" : ""}</span></div>` +
    `<div class="brief-entries">${entrances(level)}</div>` +
    `<div class="foes">${foes
      .map((k, i) => {
        const boss = level.boss === k && i === foes.length - 1;
        return `<figure class="${boss ? "boss" : ""}"><img src="${portrait(k, level.biome)}" alt=""><figcaption>${boss ? "BOSS: " : ""}${enemyName(k, level.biome)}</figcaption></figure>`;
      })
      .join("")}</div>` +
    `<div class="brief-best">BEST <span class="stars">${[1, 2, 3].map((n) => `<i class="star ${n <= stars ? "on" : ""}"></i>`).join("")}</span></div>`;
  let difficulty: Difficulty = "medium";
  info.appendChild(difficultyPicker(best, (d) => {
    difficulty = d;
  }));
  const row = h("div", "row");
  row.appendChild(button("big", "BACK", close));
  row.appendChild(button("big primary", "PLAY", () => onPlay(difficulty)));
  info.appendChild(row);
  card.appendChild(info);
  wrap.appendChild(card);
  host.appendChild(wrap);
}
