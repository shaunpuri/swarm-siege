import type { Progress } from "@/progress";
import type { MatchRecord } from "@/history";
import { BADGES } from "@/badges";
import { cleared, totalStars } from "@/progress";
import { WORLDS, levelCount } from "@/config/campaign";
import { BIOME_NAMES } from "@/config/biomes";
import { badgeSvg } from "@/ui/badgeart";
import type { WalletProfile } from "@/net/account";
import { shopItem } from "@/config/shop";
import { GEM, gems } from "@/ui/arena";
import { button, h, show } from "@/ui/dom";

// The player's profile: a chip in the top left corner of the title screen (avatar, name, badge
// count and 1 vs 1 record) that opens the profile page: the name (editable), campaign and
// versus stats, every badge (earned ones first, lit up) and the history of 1 vs 1 matches,
// online and against the AI.

export type ProfileData = { name: string; earned: Set<string>; progress: Progress; matches: MatchRecord[] };

function initial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}

function record(matches: MatchRecord[], ai: boolean): string {
  const mine = matches.filter((m) => m.ai === ai);
  const won = mine.filter((m) => m.outcome === "won").length;
  const lost = mine.filter((m) => m.outcome === "lost").length;
  return `${won}W ${lost}L`;
}

// the avatar, ringed by the equipped shop frame
function avatar(name: string, wallet: WalletProfile | null, large = false): string {
  const frame = wallet ? shopItem(wallet.frame) : undefined;
  const ring = frame ? ` style="box-shadow:0 0 0 3px ${frame.color},0 0 14px ${frame.color}"` : "";
  return `<span class="avatar${large ? " avatar-lg" : ""}"${ring}>${initial(name)}</span>`;
}

function titleLine(wallet: WalletProfile | null): string {
  const t = wallet ? shopItem(wallet.title) : undefined;
  return t ? `<em class="ptitle" style="color:${t.color}">${t.name}</em>` : "";
}

export function profileChip(host: HTMLElement, data: ProfileData, onOpen: () => void, wallet: WalletProfile | null): void {
  const chip = button("profile-chip", "", onOpen);
  const name = wallet?.name ?? data.name;
  const money = wallet ? ` | ${gems(wallet.diamonds)}` : "";
  chip.innerHTML = `${avatar(name, wallet)}<span class="who"><b>${name || "Player"}</b><small>${data.earned.size}/${BADGES.length} badges${money}</small></span>`;
  host.appendChild(chip);
}

function stat(label: string, value: string): string {
  return `<div class="pstat"><b>${value}</b><small>${label}</small></div>`;
}

function when(at: number): string {
  const d = new Date(at);
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

function historyTable(matches: MatchRecord[]): HTMLElement {
  const box = h("div", "phistory");
  box.appendChild(h("h3", "", "MATCH HISTORY"));
  if (matches.length === 0) {
    box.appendChild(h("p", "pempty", "No 1 vs 1 matches yet. Play online or against the AI."));
    return box;
  }
  const rows = matches
    .map((m) => `<tr class="${m.outcome}"><td>${when(m.at)}</td><td>${m.ai ? "vs AI" : "Online"}</td><td>${m.opponent}</td><td>${BIOME_NAMES[m.biome]}</td><td>${m.mine} : ${m.theirs}</td><td class="res">${m.outcome.toUpperCase()}</td></tr>`)
    .join("");
  box.innerHTML += `<table><thead><tr><th>When</th><th>Mode</th><th>Opponent</th><th>Map</th><th>Waves</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>`;
  return box;
}

export function showProfile(el: HTMLElement, data: ProfileData, opts: { onBack: () => void; onRename: (name: string) => void; onShop: () => void }, wallet: WalletProfile | null): void {
  el.innerHTML = "";
  el.className = "screen camp profile";
  el.style.backgroundImage = "";
  const bar = h("div", "camp-bar");
  bar.appendChild(button("small back", "TITLE", opts.onBack));
  bar.appendChild(h("div", "camp-title", "PROFILE"));
  bar.appendChild(button("small shop-btn", `${GEM} SHOP`, opts.onShop));
  el.appendChild(bar);

  const head = h("div", "phead");
  head.innerHTML = avatar(wallet?.name ?? data.name, wallet, true);
  const nameBox = h("div", "pname");
  const input = document.createElement("input");
  input.value = data.name;
  input.placeholder = "Your name";
  input.maxLength = 16;
  input.addEventListener("change", () => opts.onRename(input.value.trim()));
  nameBox.appendChild(input);
  nameBox.appendChild(h("small", "", "Shown to your rival in 1 vs 1"));
  if (wallet) nameBox.insertAdjacentHTML("beforeend", titleLine(wallet));
  head.appendChild(nameBox);
  const stars = WORLDS.reduce((s, w) => s + totalStars(data.progress, w.mode), 0);
  const maxStars = WORLDS.reduce((s, w) => s + levelCount(w.mode) * 3, 0);
  const levels = WORLDS.reduce((s, w) => s + cleared(data.progress, w.mode), 0);
  const stats = h("div", "pstats");
  stats.innerHTML = (wallet ? stat("Diamonds", gems(wallet.diamonds)) : stat("Diamonds", "sign in")) + stat("Stars", `${stars}/${maxStars}`) + stat("Levels cleared", `${levels}/50`) + stat("Badges", `${data.earned.size}/${BADGES.length}`) + stat("Online 1v1", record(data.matches, false)) + stat("vs AI", record(data.matches, true));
  head.appendChild(stats);
  el.appendChild(head);

  const badges = h("div", "pbadges");
  badges.appendChild(h("h3", "", "BADGES"));
  const grid = h("div", "pbadge-grid");
  const sorted = [...BADGES].sort((a, b) => Number(data.earned.has(b.id)) - Number(data.earned.has(a.id)));
  for (const b of sorted) {
    const on = data.earned.has(b.id);
    const card = h("div", `pbadge ${on ? "on" : ""}`);
    card.style.setProperty("--c", b.color);
    card.innerHTML = `${badgeSvg(b, on, 72)}<b>${b.name}</b><small>${b.desc}</small>`;
    grid.appendChild(card);
  }
  badges.appendChild(grid);
  el.appendChild(badges);
  el.appendChild(historyTable(data.matches));
  show(el, true);
}
