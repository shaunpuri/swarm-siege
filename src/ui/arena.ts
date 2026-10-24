import type { ArenaSession } from "@/net/arena";
import type { Creds, WalletProfile } from "@/net/account";
import { amFighter } from "@/net/arena";
import { ARENA_MAX, FIGHTER_LOSS, FIGHTER_WIN, STAKES } from "@/net/arenaproto";
import { ROOM_CODE_LENGTH } from "@/net/protocol";
import { button, h, show } from "@/ui/dom";
import { frame, input } from "@/ui/lobby";

// Arena Stakes screens, in the same style as the versus rooms: sign in (name + PIN) and create
// or join a room; the room with its five slots; the betting window (investors pick a fighter
// and a stake, fighters wait); the investors' live view of both boards; the payout card.

export const GEM = '<svg class="diamond-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z" fill="#67e8f9"/><path d="M2 9h20M8 3l4 6 4-6M12 9v12" stroke="#0e7490" stroke-width="1.2" fill="none"/></svg>';

export function gems(n: number): string {
  return `<span class="gems">${GEM}${n}</span>`;
}

function errorLine(body: HTMLElement, error: string): void {
  if (error) body.appendChild(h("div", "vs-error", error));
}

export function showArenaMenu(el: HTMLElement, opts: { creds: Creds | null; profile: WalletProfile | null; error: string; code: string; onSignIn: (c: Creds) => void; onSignOut: () => void; onCreate: () => void; onJoin: (code: string) => void; onBack: () => void }): void {
  const body = frame(el, "ARENA STAKES", opts.onBack);
  const intro = h("div", "vs-intro");
  intro.innerHTML = `<b>2 FIGHTERS. UP TO 3 INVESTORS. ONE MATCH.</b><span>Roles are drawn at random. Fighters play a 1 vs 1. Investors bet diamonds on a fighter and watch both boards live: winners share the losers' stakes. Fighters win ${FIGHTER_WIN} diamonds (${FIGHTER_LOSS} for losing).</span>`;
  body.appendChild(intro);
  if (!opts.creds || !opts.profile) {
    const card = h("div", "vs-card arena-signin");
    card.innerHTML = "<small>DIAMOND WALLET</small><b>SIGN IN</b><span>Pick a name and a 4 digit PIN. New names get 200 diamonds to start.</span>";
    const name = input("vs-name", "NAME", opts.creds?.name ?? "", 16);
    const pin = input("vs-code", "PIN", "", 4);
    pin.inputMode = "numeric";
    pin.type = "password";
    card.append(name, pin, button("big primary", "SIGN IN", () => opts.onSignIn({ name: name.value.trim(), pin: pin.value.trim() })));
    body.appendChild(card);
    errorLine(body, opts.error);
    return;
  }
  const who = h("div", "arena-who");
  who.innerHTML = `<span>Signed in as <b>${opts.profile.name}</b></span>${gems(opts.profile.diamonds)}`;
  who.appendChild(button("small", "SIGN OUT", opts.onSignOut));
  body.appendChild(who);
  const cards = h("div", "vs-cards");
  const create = h("div", "vs-card");
  create.innerHTML = "<small>HOST</small><b>CREATE ROOM</b><span>Get a code for up to 4 friends.</span>";
  create.appendChild(button("big primary", "CREATE ROOM", opts.onCreate));
  const join = h("div", "vs-card");
  join.innerHTML = "<small>GUEST</small><b>JOIN ROOM</b><span>Type the code you were given.</span>";
  const code = input("vs-code", "CODE", opts.code, ROOM_CODE_LENGTH);
  code.addEventListener("input", () => {
    code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });
  join.append(code, button("big primary", "JOIN", () => code.value.length === ROOM_CODE_LENGTH && opts.onJoin(code.value)));
  cards.append(create, join);
  body.appendChild(cards);
  errorLine(body, opts.error);
}

export function showArenaRoom(el: HTMLElement, s: ArenaSession, opts: { onStart: () => void; onLeave: () => void }): void {
  const body = frame(el, "ARENA ROOM", opts.onLeave);
  if (s.phase === "connecting") {
    body.appendChild(h("div", "vs-wait", "Connecting to the arena..."));
    errorLine(body, s.error);
    return;
  }
  const codeCard = h("div", "vs-roomcode");
  codeCard.innerHTML = `<small>ROOM CODE</small><b>${s.code}</b>`;
  body.appendChild(codeCard);
  const slots = h("div", "arena-slots");
  for (let i = 0; i < ARENA_MAX; i++) {
    const p = s.players[i];
    const slot = h("div", `vs-slot ${p ? "filled" : "empty"}`);
    slot.innerHTML = p
      ? `<span class="avatar">${p.name.slice(0, 1).toUpperCase()}</span><b>${p.name}${i === s.you ? " (YOU)" : ""}</b>${gems(p.diamonds)}${i === 0 ? '<em class="crown">HOST</em>' : ""}`
      : '<span class="avatar">?</span><b>Open slot</b>';
    slots.appendChild(slot);
  }
  body.appendChild(slots);
  const ready = s.players.length >= 2;
  if (s.you === 0) body.appendChild(button(`big primary ${ready ? "" : "disabled"}`, ready ? "DRAW ROLES AND START" : "WAITING FOR PLAYERS", () => ready && opts.onStart()));
  else body.appendChild(h("div", "vs-wait", "Waiting for the host to start..."));
  body.appendChild(h("div", "vs-note", "2 players fight, everyone else invests. The map is picked at random."));
  errorLine(body, s.error);
}

function fighterCard(s: ArenaSession, side: number, picked: number): HTMLElement {
  const slot = s.fighters[side] ?? -1;
  const p = s.players[slot];
  const backing = s.bets.filter((b) => b.fighter === slot);
  const total = backing.reduce((t, b) => t + b.stake, 0);
  const card = h("div", `arena-fighter ${side === 0 ? "blue" : "red"} ${picked === slot ? "picked" : ""}`);
  card.innerHTML = `<small>FIGHTER ${side + 1}</small><b>${p?.name ?? "?"}${slot === s.you ? " (YOU)" : ""}</b><span>${backing.length} backer${backing.length === 1 ? "" : "s"}</span>${gems(total)}`;
  return card;
}

export function showBetting(el: HTMLElement, s: ArenaSession, opts: { onBet: (fighter: number, stake: number) => void; onLeave: () => void }): void {
  const body = frame(el, "PLACE YOUR BETS", opts.onLeave);
  const left = Math.max(0, Math.ceil((s.betEndsAt - performance.now()) / 1000));
  const head = h("div", "arena-timer");
  head.innerHTML = `<b data-timer>${left}</b><small>SECONDS TO BET</small>`;
  body.appendChild(head);
  const mine = s.bets.find((b) => b.name === s.players[s.you]?.name);
  const pair = h("div", "arena-pair");
  pair.append(fighterCard(s, 0, mine?.fighter ?? -1), h("div", "vs-versus", "VS"), fighterCard(s, 1, mine?.fighter ?? -1));
  body.appendChild(pair);
  if (amFighter(s)) {
    body.appendChild(h("div", "vs-wait", `You are a FIGHTER. The investors are betting on you: the match starts when betting closes.`));
  } else {
    const me = s.players[s.you];
    const wallet = (me?.diamonds ?? 0) + (mine?.stake ?? 0);
    const pick = h("div", "arena-bet");
    s.fighters.forEach((slot, side) => {
      const col = h("div", "arena-col");
      col.appendChild(h("small", "", `BACK ${(s.players[slot]?.name ?? "?").toUpperCase()}`));
      for (const stake of STAKES) {
        const on = mine?.fighter === slot && mine.stake === stake;
        const chip = button(`stake ${side === 0 ? "blue" : "red"} ${on ? "on" : ""} ${wallet < stake ? "disabled" : ""}`, `${GEM}${stake}`, () => wallet >= stake && opts.onBet(slot, stake));
        col.appendChild(chip);
      }
      pick.appendChild(col);
    });
    body.appendChild(pick);
    body.appendChild(h("div", "vs-note", mine ? `Your bet: ${mine.stake} on ${s.players[mine.fighter]?.name ?? "?"}. You can change it until betting closes.` : "Pick a fighter and a stake. Winners share the losing side's stakes."));
  }
  errorLine(body, s.error);
}

// the investors' live view: both boards side by side, drawn every frame (src/render/rival.ts)
export function showWatch(el: HTMLElement, s: ArenaSession, onLeave: () => void): HTMLCanvasElement[] {
  el.innerHTML = "";
  el.className = "screen camp versus arena-watch";
  el.style.backgroundImage = "";
  const bar = h("div", "camp-bar");
  bar.appendChild(button("small back", "LEAVE", onLeave));
  bar.appendChild(h("div", "camp-title", "LIVE MATCH"));
  const mine = s.bets.find((b) => b.name === s.players[s.you]?.name);
  bar.appendChild(h("div", "camp-stars", mine ? `YOUR BET: ${mine.stake} ON ${(s.players[mine.fighter]?.name ?? "?").toUpperCase()}` : "NO BET"));
  el.appendChild(bar);
  const boards = h("div", "arena-boards");
  const canvases = s.fighters.map((_, side) => {
    const c = document.createElement("canvas");
    c.width = 1280;
    c.height = 720;
    c.className = side === 0 ? "blue" : "red";
    boards.appendChild(c);
    return c;
  });
  el.appendChild(boards);
  show(el, true);
  return canvases;
}

export function showArenaResult(el: HTMLElement, s: ArenaSession, opts: { onAgain: () => void; onLeave: () => void }): void {
  el.innerHTML = "";
  const me = s.payouts.find((p) => p.name === s.players[s.you]?.name);
  const gain = me?.delta ?? 0;
  el.className = `screen end ${gain >= 0 ? "won" : "lost"}`;
  el.style.backgroundImage = "";
  const card = h("div", "end-card vs-result");
  const winnerName = s.winner < 0 ? "" : (s.stats[s.winner]?.name ?? "?");
  const title = s.winner < 0 ? "DRAW" : `${winnerName.toUpperCase()} WINS`;
  const rows = s.payouts
    .map((p) => `<tr class="${p.delta > 0 ? "win" : ""}"><td>${p.role.toUpperCase()}</td><td>${p.name}${p.name === s.players[s.you]?.name ? " (YOU)" : ""}</td><td class="${p.delta >= 0 ? "plus" : "minus"}">${p.delta >= 0 ? "+" : ""}${p.delta}</td><td>${gems(p.diamonds)}</td></tr>`)
    .join("");
  card.innerHTML =
    `<h2>${title}</h2><p>${gain > 0 ? `You won ${gain} diamonds.` : gain < 0 ? `You lost ${-gain} diamonds.` : "No diamonds won or lost."}</p>` +
    `<table class="vs-table"><tr><th>ROLE</th><th>PLAYER</th><th>DIAMONDS</th><th>WALLET</th></tr>${rows}</table>`;
  const row = h("div", "row");
  if (s.you === 0) row.appendChild(button("big primary", "NEXT ROUND", opts.onAgain));
  else row.appendChild(h("span", "vs-wait", "Waiting for the host to start the next round..."));
  row.appendChild(button("big", "LEAVE ROOM", opts.onLeave));
  card.appendChild(row);
  el.appendChild(card);
  show(el, true);
}
