import type { Biome, Game, SendKind } from "@/types";
import type { ClientMsg, ServerMsg, Snapshot, Standing } from "@/net/protocol";
import { parseServerMsg } from "@/net/protocol";
import { receiveSend } from "@/game/match";
import { TOWER_KINDS } from "@/config/towers";
import { ENEMY_KINDS } from "@/config/enemies";

// The game's side of an online versus match: the WebSocket to the room server, the room and
// opponent as last heard, and the per-frame work while playing (apply what the opponent sent,
// report our own state a few times a second, say when our base has fallen).

export type VersusPhase = "connecting" | "lobby" | "playing" | "result";
export type MatchStart = { seed: number; biome: Biome; layout: number };
export type MatchResult = { winner: number; reason: "outlasted" | "forfeit" | "draw"; stats: Standing[] };

// what the session talks to: the room server over a WebSocket, or a local AI rival
// (src/net/airival.ts) that plays the same protocol
export type Link = { send: (msg: ClientMsg) => void; close: () => void; tick: (dt: number) => void };

export type VersusSession = {
  link: Link;
  // a match against the local AI rather than a person online
  ai: boolean;
  phase: VersusPhase;
  code: string;
  you: number;
  names: string[];
  error: string;
  opp: Snapshot | null;
  result: MatchResult | null;
  incoming: SendKind[];
  reportedOver: boolean;
  snapTimer: number;
};

export type VersusHooks = { onChange: () => void; onStart: (start: MatchStart) => void; onResult: () => void };

// how often our snapshot goes to the opponent
const SNAPSHOT_EVERY = 0.25;
const MAX_ENEMIES_SENT = 150;

// The dev server serves the game on 5173 and the rooms on 5174; a deployed build is served
// by the room server itself, so /ws is on the same address as the page.
export function serverUrl(): string {
  if (location.port === "5173") return `ws://${location.hostname}:5174/ws`;
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
}

export function versusSend(session: VersusSession, msg: ClientMsg): void {
  session.link.send(msg);
}

export function onMessage(session: VersusSession, msg: ServerMsg, hooks: VersusHooks): void {
  if (msg.t === "room") {
    session.code = msg.code;
    session.you = msg.you;
    session.names = msg.names;
    session.error = "";
    if (session.phase !== "playing") session.phase = "lobby";
  } else if (msg.t === "start") {
    session.phase = "playing";
    session.opp = null;
    session.result = null;
    session.incoming = [];
    session.reportedOver = false;
    hooks.onStart(msg);
  } else if (msg.t === "opp") session.opp = msg.s;
  else if (msg.t === "incoming") session.incoming.push(msg.kind);
  else if (msg.t === "result") {
    session.phase = "result";
    session.result = { winner: msg.winner, reason: msg.reason, stats: msg.stats };
    hooks.onResult();
    return;
  } else if (msg.t === "error") session.error = msg.msg;
  hooks.onChange();
}

// opens the connection and runs `first` (create or join) once it is up
export function connectVersus(first: ClientMsg, hooks: VersusHooks): VersusSession {
  const socket = new WebSocket(serverUrl());
  const link: Link = {
    send: (msg) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
    },
    close: () => socket.close(),
    tick: () => {},
  };
  const session = newSession(link, false);
  socket.addEventListener("open", () => versusSend(session, first));
  socket.addEventListener("message", (ev) => {
    const msg = typeof ev.data === "string" ? parseServerMsg(ev.data) : null;
    if (msg) onMessage(session, msg, hooks);
  });
  socket.addEventListener("close", () => {
    if (session.phase === "result") return;
    session.error = "Connection to the room server lost";
    hooks.onChange();
  });
  socket.addEventListener("error", () => {
    session.error = "Could not reach the room server";
    hooks.onChange();
  });
  return session;
}

export function newSession(link: Link, ai: boolean): VersusSession {
  return { link, ai, phase: "connecting", code: "", you: 0, names: [], error: "", opp: null, result: null, incoming: [], reportedOver: false, snapTimer: 0 };
}

export function snapshot(game: Game): Snapshot {
  return {
    wave: game.wave,
    cleared: game.match?.cleared ?? 0,
    time: Math.round(game.time * 10) / 10,
    baseHp: Math.ceil(game.bases.reduce((s, b) => s + Math.max(0, b.hp), 0)),
    baseMax: game.bases.reduce((s, b) => s + b.maxHp, 0),
    coins: game.coins,
    towers: game.towers.slice(0, 30).flatMap((t) => [Math.round(t.pos.x), Math.round(t.pos.y), t.level, TOWER_KINDS.indexOf(t.kind)]),
    enemies: game.enemies.slice(0, MAX_ENEMIES_SENT).flatMap((e) => [Math.round(e.pos.x), Math.round(e.pos.y), ENEMY_KINDS.indexOf(e.kind) + (e.boss ? 4 : 0), Math.round((e.hp / e.maxHp) * 100)]),
  };
}

// every frame of a versus game
export function tickVersus(session: VersusSession, game: Game, dt: number): void {
  if (session.phase !== "playing") return;
  session.link.tick(dt);
  for (const kind of session.incoming) receiveSend(game, kind);
  session.incoming = [];
  if (game.status === "lost") {
    if (!session.reportedOver) {
      session.reportedOver = true;
      versusSend(session, { t: "state", s: snapshot(game) });
      versusSend(session, { t: "over", cleared: game.match?.cleared ?? 0, time: game.time });
    }
    return;
  }
  session.snapTimer -= dt;
  if (session.snapTimer <= 0) {
    session.snapTimer = SNAPSHOT_EVERY;
    versusSend(session, { t: "state", s: snapshot(game) });
  }
}

export function closeVersus(session: VersusSession): void {
  versusSend(session, { t: "leave" });
  session.phase = "result";
  session.link.close();
}
