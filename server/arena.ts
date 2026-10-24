import type { Run, Snapshot } from "@/net/protocol";
import type { ArenaClientMsg, ArenaServerMsg, Bet, Payout } from "@/net/arenaproto";
import type { Account, Wallets } from "@server/wallet";
import { ROOM_ALPHABET, ROOM_CODE_LENGTH, judge } from "@/net/protocol";
import { ARENA_MAX, BET_SECONDS, FIGHTER_LOSS, FIGHTER_WIN, STAKES, settleBets } from "@/net/arenaproto";
import { VERSUS_BIOMES, VERSUS_LAYOUTS } from "@/config/versus";
import { addDiamonds, cleanName, login } from "@server/wallet";

// Arena Stakes rooms (src/net/arenaproto.ts has the rules). A room fills up to five players;
// the host starts it with at least two. Two random players become fighters, the rest
// investors; investors have BET_SECONDS to stake diamonds on a fighter (taken from their
// wallet when placed), then the fighters play a versus match relayed like an online room and
// every investor watches both boards. The judge decides the winner, bets are settled and the
// fighters get their prize. Kept free of networking so it can be tested directly.

export type ArenaConn = { id: number; send: (msg: ArenaServerMsg) => void };

type Member = { conn: ArenaConn; name: string; account: Account; run: Run };
type Phase = "lobby" | "betting" | "playing";
type Room = { code: string; members: Member[]; phase: Phase; fighters: number[]; bets: Bet[]; bettors: Map<string, Account>; betEnds: number; match: { seed: number; biome: (typeof VERSUS_BIOMES)[number]; layout: number } | null };

export type Arena = { rooms: Map<string, Room>; byConn: Map<number, Room>; wallets: Wallets; random: () => number; now: () => number };

export function createArena(wallets: Wallets, random: () => number = Math.random, now: () => number = Date.now): Arena {
  return { rooms: new Map(), byConn: new Map(), wallets, random, now };
}

function newCode(arena: Arena): string {
  for (;;) {
    const code = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_ALPHABET[Math.floor(arena.random() * ROOM_ALPHABET.length)] ?? "A").join("");
    if (!arena.rooms.has(code)) return code;
  }
}

const fresh = (): Run => ({ cleared: 0, time: 0, over: false });

function announce(room: Room): void {
  const players = room.members.map((m) => ({ name: m.name, diamonds: m.account.diamonds }));
  room.members.forEach((m, i) => m.conn.send({ t: "a-room", code: room.code, you: i, players, fighters: room.phase === "lobby" ? [] : room.fighters }));
}

function secondsLeft(arena: Arena, room: Room): number {
  return Math.max(0, Math.ceil((room.betEnds - arena.now()) / 1000));
}

function shareBets(arena: Arena, room: Room): void {
  for (const m of room.members) m.conn.send({ t: "a-bets", bets: room.bets, seconds: secondsLeft(arena, room) });
}

function start(arena: Arena, room: Room, conn: ArenaConn): void {
  if (room.members[0]?.conn.id !== conn.id) return conn.send({ t: "error", msg: "Only the host can start" });
  if (room.members.length < 2) return conn.send({ t: "error", msg: "Need at least 2 players" });
  if (room.phase !== "lobby") return;
  // two random fighters
  const order = room.members.map((_, i) => i).sort(() => arena.random() - 0.5);
  room.fighters = order.slice(0, 2).sort((a, b) => a - b);
  room.bets = [];
  room.bettors = new Map();
  room.phase = "betting";
  room.match = {
    seed: Math.floor(arena.random() * 2 ** 31),
    biome: VERSUS_BIOMES[Math.floor(arena.random() * VERSUS_BIOMES.length)] ?? "grassland",
    layout: VERSUS_LAYOUTS[Math.floor(arena.random() * VERSUS_LAYOUTS.length)] ?? 2,
  };
  // with nobody to bet, the match starts at once
  const investors = room.members.length - 2;
  room.betEnds = arena.now() + (investors > 0 ? BET_SECONDS * 1000 : 0);
  const { seed, biome, layout } = room.match;
  room.members.forEach((m, i) => m.conn.send({ t: "a-roles", fighters: room.fighters, you: i, seed, biome, layout, seconds: secondsLeft(arena, room) }));
  if (investors === 0) goLive(room);
}

function bet(arena: Arena, room: Room, conn: ArenaConn, fighter: number, stake: number): void {
  const i = room.members.findIndex((m) => m.conn.id === conn.id);
  const me = room.members[i];
  if (!me || room.phase !== "betting") return;
  if (room.fighters.includes(i)) return conn.send({ t: "error", msg: "Fighters cannot bet" });
  if (!room.fighters.includes(fighter)) return conn.send({ t: "error", msg: "Pick a fighter" });
  if (!STAKES.some((s) => s === stake)) return conn.send({ t: "error", msg: "Pick a stake" });
  // changing a bet refunds the old stake first
  const old = room.bets.find((b) => b.name === me.name);
  const funds = me.account.diamonds + (old?.stake ?? 0);
  if (funds < stake) return conn.send({ t: "error", msg: "Not enough diamonds" });
  if (old) addDiamonds(arena.wallets, me.account, old.stake);
  addDiamonds(arena.wallets, me.account, -stake);
  room.bets = [...room.bets.filter((b) => b.name !== me.name), { name: me.name, fighter, stake }];
  room.bettors.set(me.name, me.account);
  shareBets(arena, room);
  announce(room);
  // everyone has bet: no need to wait
  if (room.bets.length >= room.members.length - 2) room.betEnds = arena.now();
}

function goLive(room: Room): void {
  if (!room.match) return;
  room.phase = "playing";
  for (const m of room.members) m.run = fresh();
  const { seed, biome, layout } = room.match;
  room.members.forEach((m, i) => {
    if (room.fighters.includes(i)) m.conn.send({ t: "start", seed, biome, layout });
    m.conn.send({ t: "a-live" });
  });
}

// called often: closes betting when its time is up
export function tickArena(arena: Arena): void {
  for (const room of arena.rooms.values()) {
    if (room.phase === "betting" && arena.now() >= room.betEnds) goLive(room);
  }
}

function fighterOf(room: Room, conn: ArenaConn): { side: number; me: Member; foe: Member | undefined } | null {
  const i = room.members.findIndex((m) => m.conn.id === conn.id);
  const side = room.fighters.indexOf(i);
  const me = room.members[i];
  if (side < 0 || !me) return null;
  return { side, me, foe: room.members[room.fighters[1 - side] ?? -1] };
}

function finish(arena: Arena, room: Room, winnerSide: number, reason: "outlasted" | "forfeit" | "draw"): void {
  room.phase = "lobby";
  const winnerSlot = winnerSide < 0 ? -1 : (room.fighters[winnerSide] ?? -1);
  const settled = settleBets(room.bets, winnerSlot);
  const payouts: Payout[] = [];
  // every bet is paid, including those of investors who have since left the room; the stake
  // was taken when placed, so winners (and everyone on a draw) get it back with their gain
  for (const b of room.bets) {
    const account = room.bettors.get(b.name);
    const delta = settled.get(b.name) ?? 0;
    if (account && delta >= 0) addDiamonds(arena.wallets, account, b.stake + delta);
  }
  room.members.forEach((m, i) => {
    const fighting = room.fighters.includes(i);
    let delta = settled.get(m.name) ?? 0;
    if (fighting) {
      delta = winnerSlot === i ? FIGHTER_WIN : FIGHTER_LOSS;
      addDiamonds(arena.wallets, m.account, delta);
    }
    payouts.push({ name: m.name, role: fighting ? "fighter" : "investor", delta, diamonds: m.account.diamonds });
  });
  const stats = room.fighters.map((f) => {
    const m = room.members[f];
    return { name: m?.name ?? "?", cleared: m?.run.cleared ?? 0, time: Math.round(m?.run.time ?? 0) };
  });
  room.members.forEach((m, i) => {
    const side = room.fighters.indexOf(i);
    if (side >= 0) m.conn.send({ t: "result", winner: winnerSide, reason, stats });
    m.conn.send({ t: "a-result", winner: winnerSide, payouts, stats });
  });
  room.bets = [];
  room.bettors = new Map();
  announce(room);
}

// a fighter left before the match began: no match, so every stake goes back and the room
// returns to the lobby
function cancelRound(arena: Arena, room: Room): void {
  for (const b of room.bets) {
    const account = room.bettors.get(b.name);
    if (account) addDiamonds(arena.wallets, account, b.stake);
  }
  room.bets = [];
  room.bettors = new Map();
  room.phase = "lobby";
  room.fighters = [];
  room.match = null;
  for (const m of room.members) m.conn.send({ t: "error", msg: "A fighter left before the match: all bets were refunded" });
}

function decide(arena: Arena, room: Room): void {
  const a = room.members[room.fighters[0] ?? -1];
  const b = room.members[room.fighters[1] ?? -1];
  if (room.phase !== "playing" || !a || !b) return;
  const w = judge([a.run, b.run]);
  if (w !== null) finish(arena, room, w, w === -1 ? "draw" : "outlasted");
}

function relayState(arena: Arena, room: Room, conn: ArenaConn, s: Snapshot): void {
  const f = fighterOf(room, conn);
  if (!f || room.phase !== "playing" || f.me.run.over) return;
  f.me.run.cleared = s.cleared;
  f.me.run.time = s.time;
  f.foe?.conn.send({ t: "opp", s });
  room.members.forEach((m, i) => {
    if (!room.fighters.includes(i)) m.conn.send({ t: "a-snap", fighter: f.side, s });
  });
  decide(arena, room);
}

export function handleArena(arena: Arena, conn: ArenaConn, msg: ArenaClientMsg): void {
  const room = arena.byConn.get(conn.id);
  if (msg.t === "a-join") {
    const account = login(arena.wallets, msg.name, msg.pin);
    if (typeof account === "string") return conn.send({ t: "error", msg: account });
    if (room) leaveArena(arena, conn);
    const name = cleanName(msg.name);
    let target = msg.code ? arena.rooms.get(msg.code.toUpperCase().trim()) : undefined;
    if (msg.code && !target) return conn.send({ t: "error", msg: "No room with that code" });
    if (target && target.members.length >= ARENA_MAX) return conn.send({ t: "error", msg: "That room is full" });
    if (target && target.phase !== "lobby") return conn.send({ t: "error", msg: "That match has already started" });
    if (target?.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) return conn.send({ t: "error", msg: "That name is already in the room" });
    if (!target) {
      target = { code: newCode(arena), members: [], phase: "lobby", fighters: [], bets: [], bettors: new Map(), betEnds: 0, match: null };
      arena.rooms.set(target.code, target);
    }
    target.members.push({ conn, name, account, run: fresh() });
    arena.byConn.set(conn.id, target);
    return announce(target);
  }
  if (!room) return conn.send({ t: "error", msg: "Not in a room" });
  if (msg.t === "a-start") return start(arena, room, conn);
  if (msg.t === "a-bet") return bet(arena, room, conn, msg.fighter, msg.stake);
  if (msg.t === "state") return relayState(arena, room, conn, msg.s);
  if (msg.t === "send") {
    const f = fighterOf(room, conn);
    if (f && room.phase === "playing") f.foe?.conn.send({ t: "incoming", kind: msg.kind });
    return;
  }
  if (msg.t === "over") {
    const f = fighterOf(room, conn);
    if (!f || room.phase !== "playing") return;
    f.me.run = { cleared: msg.cleared, time: msg.time, over: true };
    return decide(arena, room);
  }
  leaveArena(arena, conn);
}

// someone left or dropped: a fighter leaving mid-match forfeits; an investor's bet stays in
export function leaveArena(arena: Arena, conn: ArenaConn): void {
  const room = arena.byConn.get(conn.id);
  if (!room) return;
  arena.byConn.delete(conn.id);
  const i = room.members.findIndex((m) => m.conn.id === conn.id);
  const side = room.fighters.indexOf(i);
  if (side >= 0 && room.phase === "betting") cancelRound(arena, room);
  else if (side >= 0 && room.phase === "playing") finish(arena, room, 1 - side, "forfeit");
  // before the match started, a leaving investor gets their stake back
  const me = room.members[i];
  const myBet = me ? room.bets.find((b) => b.name === me.name) : undefined;
  if (me && myBet && room.phase === "betting") {
    addDiamonds(arena.wallets, me.account, myBet.stake);
    room.bets = room.bets.filter((b) => b !== myBet);
    room.bettors.delete(me.name);
  }
  room.members = room.members.filter((m) => m.conn.id !== conn.id);
  // slots shift down: keep the fighter indexes, and the bets placed on them, pointing at the
  // same players
  const shift = (f: number): number => (f > i ? f - 1 : f);
  room.fighters = room.fighters.map(shift);
  room.bets = room.bets.map((b) => ({ ...b, fighter: shift(b.fighter) }));
  if (room.phase === "betting") shareBets(arena, room);
  if (room.members.length === 0) arena.rooms.delete(room.code);
  else announce(room);
}
