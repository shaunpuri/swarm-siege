import type { ClientMsg, Run, ServerMsg, Snapshot } from "@/net/protocol";
import { ROOM_ALPHABET, ROOM_CODE_LENGTH, judge } from "@/net/protocol";
import { VERSUS_BIOMES, VERSUS_LAYOUTS } from "@/config/versus";

// Versus rooms, kept free of networking so they can be tested directly. A player creates a
// room and shares its 5 letter code; the second player joins with it; the host starts the
// match, the room picks a random map and seed, and from then on it relays sends and snapshots
// between the two and judges the winner (src/net/protocol.ts judge).

export type Conn = { id: number; send: (msg: ServerMsg) => void };

type Player = { conn: Conn; name: string; run: Run };

type Room = { code: string; players: Player[]; playing: boolean };

export type Lobby = { rooms: Map<string, Room>; byConn: Map<number, Room>; random: () => number };

export function createLobby(random: () => number = Math.random): Lobby {
  return { rooms: new Map(), byConn: new Map(), random };
}

function newCode(lobby: Lobby): string {
  for (;;) {
    const code = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_ALPHABET[Math.floor(lobby.random() * ROOM_ALPHABET.length)] ?? "A").join("");
    if (!lobby.rooms.has(code)) return code;
  }
}

function cleanName(name: string, fallback: string): string {
  const n = name.replace(/[^\w .-]/g, "").trim().slice(0, 16);
  return n || fallback;
}

function freshRun(): Run {
  return { cleared: 0, time: 0, over: false };
}

function announce(room: Room): void {
  const names = room.players.map((p) => p.name);
  room.players.forEach((p, i) => p.conn.send({ t: "room", code: room.code, you: i, names }));
}

function other(room: Room, conn: Conn): Player | undefined {
  return room.players.find((p) => p.conn.id !== conn.id);
}

function finish(room: Room, winner: number, reason: "outlasted" | "forfeit" | "draw"): void {
  room.playing = false;
  const stats = room.players.map((p) => ({ name: p.name, cleared: p.run.cleared, time: Math.round(p.run.time) }));
  for (const p of room.players) p.conn.send({ t: "result", winner, reason, stats });
}

function decide(room: Room): void {
  const [a, b] = room.players;
  if (!room.playing || !a || !b) return;
  const winner = judge([a.run, b.run]);
  if (winner !== null) finish(room, winner, winner === -1 ? "draw" : "outlasted");
}

function start(lobby: Lobby, room: Room, conn: Conn): void {
  if (room.players[0]?.conn.id !== conn.id) return conn.send({ t: "error", msg: "Only the host can start the match" });
  if (room.players.length < 2) return conn.send({ t: "error", msg: "Waiting for a second player" });
  room.playing = true;
  const seed = Math.floor(lobby.random() * 2 ** 31);
  const biome = VERSUS_BIOMES[Math.floor(lobby.random() * VERSUS_BIOMES.length)] ?? "grassland";
  const layout = VERSUS_LAYOUTS[Math.floor(lobby.random() * VERSUS_LAYOUTS.length)] ?? 2;
  for (const p of room.players) {
    p.run = freshRun();
    p.conn.send({ t: "start", seed, biome, layout });
  }
}

function update(room: Room, conn: Conn, s: Snapshot): void {
  const me = room.players.find((p) => p.conn.id === conn.id);
  if (!me || !room.playing || me.run.over) return;
  me.run.cleared = s.cleared;
  me.run.time = s.time;
  other(room, conn)?.conn.send({ t: "opp", s });
  decide(room);
}

export function handle(lobby: Lobby, conn: Conn, msg: ClientMsg): void {
  const room = lobby.byConn.get(conn.id);
  if (msg.t === "create") {
    if (room) leave(lobby, conn);
    const fresh: Room = { code: newCode(lobby), players: [{ conn, name: cleanName(msg.name, "Player 1"), run: freshRun() }], playing: false };
    lobby.rooms.set(fresh.code, fresh);
    lobby.byConn.set(conn.id, fresh);
    return announce(fresh);
  }
  if (msg.t === "join") {
    const target = lobby.rooms.get(msg.code.toUpperCase().trim());
    if (!target) return conn.send({ t: "error", msg: "No room with that code" });
    if (target.players.length >= 2) return conn.send({ t: "error", msg: "That room is full" });
    if (room) leave(lobby, conn);
    target.players.push({ conn, name: cleanName(msg.name, "Player 2"), run: freshRun() });
    lobby.byConn.set(conn.id, target);
    return announce(target);
  }
  if (!room) return conn.send({ t: "error", msg: "Not in a room" });
  if (msg.t === "start") return start(lobby, room, conn);
  if (msg.t === "state") return update(room, conn, msg.s);
  if (msg.t === "send") {
    if (room.playing) other(room, conn)?.conn.send({ t: "incoming", kind: msg.kind });
    return;
  }
  if (msg.t === "over") {
    const me = room.players.find((p) => p.conn.id === conn.id);
    if (!me || !room.playing) return;
    me.run = { cleared: msg.cleared, time: msg.time, over: true };
    return decide(room);
  }
  leave(lobby, conn);
}

// a player left or dropped: mid-match the other one wins by forfeit
export function leave(lobby: Lobby, conn: Conn): void {
  const room = lobby.byConn.get(conn.id);
  if (!room) return;
  lobby.byConn.delete(conn.id);
  const stay = other(room, conn);
  if (room.playing && stay) {
    const winner = room.players.indexOf(stay);
    finish(room, winner, "forfeit");
  }
  room.players = room.players.filter((p) => p.conn.id !== conn.id);
  if (room.players.length === 0) lobby.rooms.delete(room.code);
  else announce(room);
}
