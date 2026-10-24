import type { ArenaClientMsg, ArenaPlayer, ArenaServerMsg, Bet, Payout } from "@/net/arenaproto";
import type { ClientMsg, Snapshot, Standing } from "@/net/protocol";
import type { MatchStart, VersusHooks, VersusSession } from "@/net/versus";
import type { Biome } from "@/types";
import { parseArenaServer } from "@/net/arenaproto";
import { newSession, onMessage } from "@/net/versus";
import { apiBase } from "@/net/account";

// The game's side of an Arena Stakes room: one WebSocket to /arena. It tracks the room, the
// roles, the bets and both fighters' boards (for investors), and for a fighter it feeds the
// versus messages into an ordinary VersusSession, so their match is a normal online 1 vs 1.

export type ArenaPhase = "connecting" | "lobby" | "betting" | "playing" | "result";

export type ArenaSession = {
  socket: WebSocket;
  phase: ArenaPhase;
  code: string;
  you: number;
  players: ArenaPlayer[];
  fighters: number[];
  match: (MatchStart & { biome: Biome }) | null;
  bets: Bet[];
  betEndsAt: number;
  boards: (Snapshot | null)[];
  payouts: Payout[];
  stats: Standing[];
  winner: number;
  error: string;
  // the fighter's versus session (null for investors)
  fight: VersusSession | null;
};

export type ArenaHooks = { onChange: () => void; onFight: (start: MatchStart) => void; onFightResult: () => void };

export function arenaUrl(): string {
  const base = apiBase();
  if (base) return `${base.replace("http", "ws")}/arena`;
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/arena`;
}

export function arenaSend(s: ArenaSession, msg: ArenaClientMsg): void {
  if (s.socket.readyState === WebSocket.OPEN) s.socket.send(JSON.stringify(msg));
}

export function amFighter(s: ArenaSession): boolean {
  return s.fighters.includes(s.you);
}

function onArena(s: ArenaSession, msg: ArenaServerMsg, hooks: ArenaHooks, fightHooks: VersusHooks): void {
  if (msg.t === "a-room") {
    s.code = msg.code;
    s.you = msg.you;
    s.players = msg.players;
    s.error = "";
    if (s.phase === "connecting") s.phase = "lobby";
  } else if (msg.t === "a-roles") {
    s.fighters = msg.fighters;
    s.you = msg.you;
    s.match = { seed: msg.seed, biome: msg.biome, layout: msg.layout };
    s.bets = [];
    s.boards = [null, null];
    s.payouts = [];
    s.betEndsAt = performance.now() + msg.seconds * 1000;
    s.phase = "betting";
    if (amFighter(s)) {
      // the fighter's game reports state, sends and its fall; room messages stay with the arena
      const send = (m: ClientMsg): void => {
        if (m.t === "state" || m.t === "send" || m.t === "over") arenaSend(s, m);
      };
      const fight = newSession({ send, close: () => {}, tick: () => {} }, false);
      fight.you = s.fighters.indexOf(s.you);
      fight.names = s.fighters.map((f) => s.players[f]?.name ?? "Fighter");
      fight.phase = "lobby";
      s.fight = fight;
    } else s.fight = null;
  } else if (msg.t === "a-bets") {
    s.bets = msg.bets;
    s.betEndsAt = performance.now() + msg.seconds * 1000;
  } else if (msg.t === "a-live") s.phase = "playing";
  else if (msg.t === "a-snap") s.boards[msg.fighter] = msg.s;
  else if (msg.t === "a-result") {
    s.phase = "result";
    s.payouts = msg.payouts;
    s.stats = msg.stats;
    s.winner = msg.winner;
  } else if (msg.t === "error") s.error = msg.msg;
  else if (s.fight) {
    // a versus message for the fighter's game
    onMessage(s.fight, msg, fightHooks);
    return;
  }
  hooks.onChange();
}

export function connectArena(join: ArenaClientMsg, hooks: ArenaHooks): ArenaSession {
  const socket = new WebSocket(arenaUrl());
  const s: ArenaSession = { socket, phase: "connecting", code: "", you: 0, players: [], fighters: [], match: null, bets: [], betEndsAt: 0, boards: [null, null], payouts: [], stats: [], winner: -1, error: "", fight: null };
  const fightHooks: VersusHooks = { onChange: () => {}, onStart: hooks.onFight, onResult: hooks.onFightResult };
  socket.addEventListener("open", () => arenaSend(s, join));
  socket.addEventListener("message", (ev) => {
    const msg = typeof ev.data === "string" ? parseArenaServer(ev.data) : null;
    if (msg) onArena(s, msg, hooks, fightHooks);
  });
  socket.addEventListener("close", () => {
    if (s.phase === "result") return;
    s.error = "Connection to the arena lost";
    hooks.onChange();
  });
  socket.addEventListener("error", () => {
    s.error = "Could not reach the arena";
    hooks.onChange();
  });
  return s;
}

export function closeArena(s: ArenaSession): void {
  arenaSend(s, { t: "leave" });
  s.socket.close();
}
