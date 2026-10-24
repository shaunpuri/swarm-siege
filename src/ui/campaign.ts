import type { LevelDef } from "@/types";
import type { World } from "@/config/campaign";
import { WORLDS, levelCount, worldOpen } from "@/config/campaign";
import { levelsFor } from "@/config/levels";
import type { Progress } from "@/progress";
import { bestDifficulty, cleared, starsFor, totalStars, worldProgress } from "@/progress";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "@/config/difficulty";
import { WORLD_THUMBS } from "@/three/worldart";
import { button, h, show } from "@/ui/dom";
import { BADGES } from "@/badges";
import { badgeSvg } from "@/ui/badgeart";
import { startMenuFx } from "@/ui/menufx";

// The campaign screens, laid out like the classic tower defense games:
//   title: the logo over the first world, and PLAY
//   world select: the five worlds as cards with their progress; locked until the world
//     before is cleared
//   level map: the world's ten levels as medallions along a winding trail; cleared levels
//     show their stars, the next one to play pulses with a marker over it, later ones are
//     locked. Clicking an open level opens its briefing.

function starRow(n: number, of = 3): string {
  return Array.from({ length: of }, (_, i) => `<i class="star ${i < n ? "on" : ""}"></i>`).join("");
}

function thumb(level: LevelDef): string {
  return WORLD_THUMBS[level.id]?.[level.biome] ?? "";
}

function cover(world: World): string {
  return WORLD_THUMBS[1]?.[world.biome] ?? "";
}

export function showTitle(el: HTMLElement, opts: { onPlay: () => void; onVersus: () => void; onAi: () => void; onArena: () => void; onBadges: () => void; onCodex: () => void; badges: string }): void {
  el.innerHTML = "";
  el.className = "screen camp title-screen";
  el.style.backgroundImage = `linear-gradient(180deg, rgba(2,6,23,0.25), rgba(2,6,23,0.85) 75%), url("${WORLD_THUMBS[1]?.grassland ?? ""}")`;
  const fx = document.createElement("canvas");
  fx.className = "menu-fx";
  el.appendChild(fx);
  startMenuFx(fx, "grassland");
  const head = h("div", "logo");
  head.innerHTML = `<h1>SWARM SIEGE</h1><p>The swarm learns from every wave. Adapt or fall.</p>`;
  el.appendChild(head);
  const menu = h("div", "title-menu");
  menu.appendChild(button("big primary play", "CAMPAIGN", opts.onPlay));
  menu.appendChild(button("big play versus", "ONLINE 1 VS 1", opts.onVersus));
  menu.appendChild(button("big play ai", "PLAY VS AI", opts.onAi));
  menu.appendChild(button("big play arena", "ARENA STAKES", opts.onArena));
  const row = h("div", "title-row");
  row.append(button("big", `BADGES  ${opts.badges}`, opts.onBadges), button("big", "CODEX", opts.onCodex));
  menu.appendChild(row);
  el.appendChild(menu);
  const how = h("div", "howto");
  how.innerHTML =
    "<b>HOW TO PLAY</b> Click a glowing pad to build a turret, click a turret to upgrade, repair or sell it. " +
    "Enemies attack your turrets, one at a time, and grow stronger every wave. Spend coins on powers (Q W E R T Y). " +
    "<b>The twist:</b> after each wave the swarm evolves armour against the turret that hurt it most, so mix your defence.";
  el.appendChild(how);
  show(el, true);
}

export function showWorlds(el: HTMLElement, progress: Progress, unlockAll: boolean, onWorld: (world: World) => void, onTitle: () => void): void {
  el.innerHTML = "";
  el.className = "screen camp worlds";
  el.style.backgroundImage = "";
  const bar = h("div", "camp-bar");
  bar.appendChild(button("small back", "TITLE", onTitle));
  const all = WORLDS.reduce((s, w) => s + totalStars(progress, w.mode), 0);
  const max = WORLDS.reduce((s, w) => s + levelCount(w.mode) * 3, 0);
  bar.appendChild(h("div", "camp-title", "CHOOSE A WORLD"));
  const total = h("div", "camp-stars");
  total.innerHTML = `${starRow(1, 1)} ${all} / ${max}`;
  bar.appendChild(total);
  el.appendChild(bar);
  const row = h("div", "world-row");
  WORLDS.forEach((world, i) => {
    const count = levelCount(world.mode);
    const open = count > 0 && worldOpen(progress, i, unlockAll);
    const card = button(`world-card ${open ? "" : "locked"}`, "", () => open && onWorld(world));
    card.style.setProperty("--tint", world.color);
    const art = h("div", "world-art");
    art.style.backgroundImage = `url("${cover(world)}")`;
    card.appendChild(art);
    if (open) {
      const fx = document.createElement("canvas");
      fx.className = "menu-fx card";
      card.appendChild(fx);
      startMenuFx(fx, world.biome);
    }
    const prev = WORLDS[i - 1];
    const lock = count === 0 ? "COMING SOON" : prev ? `CLEAR ${prev.name.toUpperCase()} TO UNLOCK` : "";
    const info = h("div", "world-info");
    info.innerHTML =
      `<small>WORLD ${i + 1}</small><b>${world.name.toUpperCase()}</b><span>${world.blurb}</span>` +
      `<em>${starRow(1, 1)} ${totalStars(progress, world.mode)} / ${count * 3}   |   ${Math.min(cleared(progress, world.mode), count)} / ${count} cleared</em>` +
      (open ? "" : `<div class="lock-tag">${lock}</div>`);
    card.appendChild(info);
    row.appendChild(card);
  });
  el.appendChild(row);
  show(el, true);
}

// a coloured gem on a medallion: the hardest difficulty that level was cleared on
function gem(best: number): string {
  const d = DIFFICULTY_ORDER[best - 1];
  return d ? `<span class="gem" style="--c:${DIFFICULTIES[d].color}" title="Cleared on ${DIFFICULTIES[d].name}"></span>` : "";
}

// medallion positions along the trail, as % of the screen (left to right, climbing)
const NODES: [number, number][] = [
  [8, 80],
  [19, 63],
  [29, 77],
  [39, 58],
  [48, 40],
  [58, 55],
  [68, 72],
  [77, 54],
  [85, 36],
  [92, 18],
];

// A winding adventure trail through the medallions: a smooth curve through them, and between
// each pair a big sideways S-bend that dies away at both medallions, so the path snakes and
// curls across the map but always lands exactly on each level.
function trailPath(points: [number, number][]): string {
  const p = points.map(([x, y]): [number, number] => [x * 12.8, y * 7.2]);
  const out: string[] = [];
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] ?? p[i];
    const b = p[i];
    const c = p[i + 1];
    const e = p[i + 2] ?? c;
    if (!a || !b || !c || !e) continue;
    const dx = c[0] - b[0];
    const dy = c[1] - b[1];
    const len = Math.hypot(dx, dy) || 1;
    // perpendicular to the link; bends alternate sides from one link to the next
    const nx = -dy / len;
    const ny = dx / len;
    const amp = Math.min(70, len * 0.38) * (i % 2 === 0 ? 1 : -1);
    for (let k = 0; k <= 24; k++) {
      if (i > 0 && k === 0) continue;
      const t = k / 24;
      // Catmull-Rom between b and c
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (q: number): number => 0.5 * (2 * (b[q] ?? 0) + (-(a[q] ?? 0) + (c[q] ?? 0)) * t + (2 * (a[q] ?? 0) - 5 * (b[q] ?? 0) + 4 * (c[q] ?? 0) - (e[q] ?? 0)) * t2 + (-(a[q] ?? 0) + 3 * (b[q] ?? 0) - 3 * (c[q] ?? 0) + (e[q] ?? 0)) * t3);
      // one full S-wave across the link, zero at both ends
      const bend = Math.sin(t * Math.PI * 2) * Math.sin(t * Math.PI) * amp;
      out.push(`${(cr(0) + nx * bend).toFixed(1)} ${(cr(1) + ny * bend).toFixed(1)}`);
    }
  }
  return out.length > 0 ? `M ${out.join(" L ")}` : "";
}

export function showLevelMap(el: HTMLElement, world: World, progress: Progress, unlockAll: boolean, onLevel: (level: LevelDef) => void, onBack: () => void): void {
  el.innerHTML = "";
  el.className = "screen camp levelmap";
  el.style.backgroundImage = "";
  el.style.setProperty("--tint", world.color);
  const bg = h("div", "map-bg");
  bg.style.backgroundImage = `url("${cover(world)}")`;
  el.appendChild(bg);
  // the world's weather / sea life drifting over the map
  const fx = document.createElement("canvas");
  fx.className = `menu-fx ${world.biome}`;
  el.appendChild(fx);
  startMenuFx(fx, world.biome);
  const levels = levelsFor(world.mode);
  const unlocked = worldProgress(progress, world.mode).unlocked;
  const shown = NODES.slice(0, levels.length);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 1280 720");
  svg.setAttribute("class", "trail");
  const d = trailPath(shown);
  svg.innerHTML = `<path class="trail-edge" d="${d}"/><path class="trail-road" d="${d}"/><path class="trail-dash" d="${d}"/>`;
  el.appendChild(svg);
  levels.forEach((level, i) => {
    const at = NODES[i];
    if (!at) return;
    const open = unlockAll || level.id <= unlocked;
    const beaten = level.id < unlocked;
    const next = level.id === unlocked;
    const node = button(`node ${open ? "" : "locked"} ${next ? "next" : ""} ${beaten ? "beaten" : ""}`, "", () => open && onLevel(level));
    node.style.left = `${at[0]}%`;
    // medallions bob gently, out of step with each other
    node.style.animationDelay = `${-i * 0.37}s`;
    node.style.top = `${at[1]}%`;
    node.innerHTML =
      `<span class="medal" style="background-image:url('${thumb(level)}')"></span>` +
      `<span class="num">${level.id}</span>` +
      (level.boss ? '<span class="boss-tag">BOSS</span>' : "") +
      `<span class="node-stars">${starRow(starsFor(progress, world.mode, level.id))}</span>` +
      gem(bestDifficulty(progress, world.mode, level.id)) +
      (next && !beaten ? '<span class="flag"></span>' : "");
    node.title = open ? `${level.id}. ${level.name}` : "Locked";
    el.appendChild(node);
  });
  const bar = h("div", "camp-bar");
  bar.appendChild(button("small back", "WORLDS", onBack));
  bar.appendChild(h("div", "camp-title", world.name.toUpperCase()));
  const total = h("div", "camp-stars");
  total.innerHTML = `${starRow(1, 1)} ${totalStars(progress, world.mode)} / ${levels.length * 3}`;
  bar.appendChild(total);
  el.appendChild(bar);
  show(el, true);
}

// every badge, earned ones lit up
export function showBadges(el: HTMLElement, earned: Set<string>, onBack: () => void): void {
  el.innerHTML = "";
  el.className = "screen camp worlds";
  el.style.backgroundImage = "";
  const bar = h("div", "camp-bar");
  bar.appendChild(button("small back", "TITLE", onBack));
  bar.appendChild(h("div", "camp-title", "BADGES"));
  bar.appendChild(h("div", "camp-stars", `${earned.size} / ${BADGES.length}`));
  el.appendChild(bar);
  const grid = h("div", "badge-grid");
  for (const b of BADGES) {
    const card = h("div", `badge-card ${earned.has(b.id) ? "on" : ""}`);
    card.style.setProperty("--c", b.color);
    card.innerHTML = `${badgeSvg(b, earned.has(b.id), 64)}<b>${b.name}</b><small>${b.desc}</small>`;
    grid.appendChild(card);
  }
  el.appendChild(grid);
  show(el, true);
}
