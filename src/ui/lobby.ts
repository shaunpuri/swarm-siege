import type { Biome } from "@/types";
import type { VersusSession } from "@/net/versus";
import { ROOM_CODE_LENGTH } from "@/net/protocol";
import { BIOME_NAMES } from "@/config/biomes";
import type { BadgeDef } from "@/badges";
import { button, h, show } from "@/ui/dom";

// Online versus screens, laid out like the party panel in DEADSHOT.io: your name on top, a
// party card to CREATE a room or JOIN one by code, then the room itself with its big code, a
// copy invite link button, the two player slots (the host wears the crown) and START for the
// host once both slots are filled. After the match, the result card with both standings.

const NAME_KEY = "swarm-siege-name";

export function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // the name just will not be remembered
  }
}

export function inviteLink(code: string): string {
  return `${location.origin}${location.pathname}?room=${code}`;
}

export function frame(el: HTMLElement, title: string, onBack: () => void): HTMLElement {
  el.innerHTML = "";
  el.className = "screen camp versus";
  el.style.backgroundImage = "";
  const bar = h("div", "camp-bar");
  bar.appendChild(button("small back", "BACK", onBack));
  bar.appendChild(h("div", "camp-title", title));
  bar.appendChild(h("div", "camp-stars"));
  el.appendChild(bar);
  const body = h("div", "vs-body");
  el.appendChild(body);
  show(el, true);
  return body;
}

export function input(className: string, placeholder: string, value: string, max: number): HTMLInputElement {
  const el = document.createElement("input");
  el.className = className;
  el.placeholder = placeholder;
  el.value = value;
  el.maxLength = max;
  el.spellcheck = false;
  return el;
}

export function showVersusMenu(el: HTMLElement, opts: { code: string; error: string; onCreate: (name: string) => void; onJoin: (name: string, code: string) => void; onBack: () => void }): void {
  const body = frame(el, "ONLINE VERSUS", opts.onBack);
  const intro = h("div", "vs-intro");
  intro.innerHTML = "<b>TWO PLAYERS. SAME MAP. ENDLESS WAVES.</b><span>Make a room and share its code. Whoever survives the most waves wins; on a tie, whoever lasted longer. Spend coins to send enemies, boosts and bosses at your rival.</span>";
  body.appendChild(intro);
  const name = input("vs-name", "YOUR NAME", savedName(), 16);
  const nameRow = h("label", "vs-field");
  nameRow.appendChild(h("small", "", "PLAYER NAME"));
  nameRow.appendChild(name);
  body.appendChild(nameRow);
  const cards = h("div", "vs-cards");
  const create = h("div", "vs-card");
  create.innerHTML = "<small>HOST</small><b>CREATE ROOM</b><span>Get a room code to share with a friend.</span>";
  const named = (): string => {
    const n = name.value.trim() || "Player";
    saveName(n);
    return n;
  };
  create.appendChild(button("big primary", "CREATE ROOM", () => opts.onCreate(named())));
  const join = h("div", "vs-card");
  join.innerHTML = "<small>GUEST</small><b>JOIN ROOM</b><span>Type the code your friend shared.</span>";
  const code = input("vs-code", "CODE", opts.code, ROOM_CODE_LENGTH);
  code.addEventListener("input", () => {
    code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });
  join.appendChild(code);
  join.appendChild(button("big primary", "JOIN", () => code.value.length === ROOM_CODE_LENGTH && opts.onJoin(named(), code.value)));
  cards.appendChild(create);
  cards.appendChild(join);
  body.appendChild(cards);
  if (opts.error) body.appendChild(h("div", "vs-error", opts.error));
}

function slot(name: string | undefined, host: boolean, you: boolean): HTMLElement {
  const el = h("div", `vs-slot ${name ? "filled" : "empty"}`);
  el.innerHTML = name
    ? `<span class="avatar">${name.slice(0, 1).toUpperCase()}</span><b>${name}${you ? " (YOU)" : ""}</b>${host ? '<em class="crown">HOST</em>' : ""}`
    : '<span class="avatar">?</span><b>Waiting for a player...</b>';
  return el;
}

export function showRoom(el: HTMLElement, session: VersusSession, opts: { onStart: () => void; onLeave: () => void }): void {
  const body = frame(el, "ROOM", opts.onLeave);
  if (session.phase === "connecting") {
    body.appendChild(h("div", "vs-wait", "Connecting to the room server..."));
    if (session.error) body.appendChild(h("div", "vs-error", session.error));
    return;
  }
  const codeCard = h("div", "vs-roomcode");
  codeCard.innerHTML = `<small>ROOM CODE</small><b>${session.code}</b>`;
  const copy = button("small copy", "COPY INVITE LINK", () => {
    void navigator.clipboard?.writeText(inviteLink(session.code));
    copy.textContent = "LINK COPIED";
  });
  codeCard.appendChild(copy);
  body.appendChild(codeCard);
  const slots = h("div", "vs-slots");
  slots.appendChild(slot(session.names[0], true, session.you === 0));
  slots.appendChild(h("div", "vs-versus", "VS"));
  slots.appendChild(slot(session.names[1], false, session.you === 1));
  body.appendChild(slots);
  const full = session.names.length >= 2;
  if (session.you === 0) {
    const start = button(`big primary ${full ? "" : "disabled"}`, full ? "START MATCH" : "WAITING FOR PLAYER 2", () => full && opts.onStart());
    body.appendChild(start);
  } else body.appendChild(h("div", "vs-wait", "Waiting for the host to start..."));
  body.appendChild(h("div", "vs-note", "The map is picked at random when the match starts."));
  if (session.error) body.appendChild(h("div", "vs-error", session.error));
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function showVersusResult(el: HTMLElement, session: VersusSession, badges: BadgeDef[], biome: Biome, opts: { onRematch: () => void; onLeave: () => void }): void {
  const result = session.result;
  if (!result) return;
  el.innerHTML = "";
  const won = result.winner === session.you;
  el.className = `screen end ${result.reason === "draw" ? "won" : won ? "won" : "lost"}`;
  el.style.backgroundImage = "";
  const card = h("div", "end-card vs-result");
  const title = result.reason === "draw" ? "DRAW" : won ? "VICTORY" : "DEFEAT";
  const why = result.reason === "forfeit" ? (won ? "Your rival left the match." : "You left the match.") : result.reason === "draw" ? "Same waves, same time." : won ? "You outlasted your rival." : "Your rival outlasted you.";
  const rows = result.stats
    .map((s, i) => `<tr class="${i === result.winner ? "win" : ""}"><td>${i === result.winner ? "WINNER" : ""}</td><td>${s.name}${i === session.you ? " (YOU)" : ""}</td><td>${s.cleared}</td><td>${clock(s.time)}</td></tr>`)
    .join("");
  card.innerHTML =
    `<h2>${title}</h2><p>${why}</p><p class="meta">Map: ${BIOME_NAMES[biome]}</p>` +
    `<table class="vs-table"><tr><th></th><th>PLAYER</th><th>WAVES</th><th>TIME</th></tr>${rows}</table>` +
    (badges.length > 0 ? `<div class="badge-row">${badges.map((b) => `<span class="badge-chip" style="--c:${b.color}">BADGE: ${b.name}</span>`).join("")}</div>` : "");
  const row = h("div", "row");
  if (session.you === 0 && session.names.length >= 2) row.appendChild(button("big primary", "REMATCH", opts.onRematch));
  else if (session.names.length >= 2) row.appendChild(h("span", "vs-wait", "Waiting for the host to start a rematch..."));
  row.appendChild(button("big", "LEAVE ROOM", opts.onLeave));
  card.appendChild(row);
  el.appendChild(card);
  show(el, true);
}
