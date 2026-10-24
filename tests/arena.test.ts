import { describe, expect, test } from "bun:test";
import type { ArenaServerMsg } from "@/net/arenaproto";
import type { ArenaConn } from "@server/arena";
import { FIGHTER_LOSS, FIGHTER_WIN, settleBets } from "@/net/arenaproto";
import { createArena, handleArena, leaveArena, tickArena } from "@server/arena";
import { buy, claim, login, openWallets } from "@server/wallet";
import { START_DIAMONDS } from "@/config/shop";
import { newSession, onMessage } from "@/net/versus";

// Arena Stakes: the payout rules, the diamond wallet and a whole room from join to payout.

const tmp = (): string => `/tmp/swarm-arena-test-${Math.random().toString(36).slice(2)}.json`;

describe("payouts", () => {
  test("the image's example: two winners share the loser's 100", () => {
    const out = settleBets([{ name: "A", fighter: 0, stake: 100 }, { name: "B", fighter: 0, stake: 100 }, { name: "C", fighter: 1, stake: 100 }], 0);
    expect(out.get("A")).toBe(50);
    expect(out.get("B")).toBe(50);
    expect(out.get("C")).toBe(-100);
  });
  test("shares follow stake size, a draw refunds, an unopposed side gets the house bonus", () => {
    const big = settleBets([{ name: "A", fighter: 0, stake: 250 }, { name: "B", fighter: 0, stake: 50 }, { name: "C", fighter: 1, stake: 100 }], 0);
    expect(big.get("A")).toBe(83);
    expect(big.get("B")).toBe(16);
    expect(settleBets([{ name: "A", fighter: 0, stake: 100 }], -1).get("A")).toBe(0);
    expect(settleBets([{ name: "A", fighter: 0, stake: 100 }], 0).get("A")).toBe(25);
  });
});

describe("wallet", () => {
  test("accounts, PINs, campaign rewards pay once, the shop", async () => {
    const w = await openWallets(tmp());
    const a = login(w, "Shaun", "1234");
    if (typeof a === "string") throw new Error(a);
    expect(a.diamonds).toBe(START_DIAMONDS);
    expect(login(w, "shaun", "9999")).toBe("Wrong PIN for that name");
    expect(login(w, "Shaun", "12")).toBe("PIN must be 4 digits");
    expect(claim(w, a, "level:world-grassland:1:2")).toBe(50);
    expect(claim(w, a, "level:world-grassland:1:2")).toBe(0);
    expect(claim(w, a, "level:world-grassland:1:3")).toBe(10);
    expect(claim(w, a, "badge:first-win")).toBe(25);
    expect(claim(w, a, "badge:first-win")).toBe(0);
    expect(claim(w, a, "daily:2026-10-25")).toBe(20);
    expect(claim(w, a, "daily:2026-10-25")).toBe(0);
    expect(buy(w, a, "frame-gold")).toBeNull();
    expect(a.frame).toBe("frame-gold");
    expect(buy(w, a, "title-legend")).toBe("Not enough diamonds");
  });
});

type Client = { conn: ArenaConn; inbox: ArenaServerMsg[] };

function client(id: number): Client {
  const inbox: ArenaServerMsg[] = [];
  return { conn: { id, send: (m) => inbox.push(m) }, inbox };
}

function last<T extends ArenaServerMsg["t"]>(c: Client, t: T): Extract<ArenaServerMsg, { t: T }> | undefined {
  const of = (m: ArenaServerMsg): m is Extract<ArenaServerMsg, { t: T }> => m.t === t;
  return c.inbox.filter(of).pop();
}

describe("a whole arena round", () => {
  test("roles are drawn, investors bet, the match is judged and diamonds paid", async () => {
    let clock = 0;
    const w = await openWallets(tmp());
    const arena = createArena(w, Math.random, () => clock);
    const players = [1, 2, 3, 4, 5].map(client);
    const names = ["Ann", "Bob", "Cat", "Dan", "Eve"];
    handleArena(arena, players[0]!.conn, { t: "a-join", code: "", name: "Ann", pin: "1111" });
    const code = last(players[0]!, "a-room")?.code ?? "";
    players.slice(1).forEach((p, i) => handleArena(arena, p.conn, { t: "a-join", code, name: names[i + 1] ?? "?", pin: "2222" }));
    expect(last(players[4]!, "a-room")?.players.length).toBe(5);
    handleArena(arena, players[0]!.conn, { t: "a-start" });
    const roles = last(players[0]!, "a-roles");
    if (!roles) throw new Error("no roles");
    const [f0, f1] = roles.fighters;
    expect(roles.fighters.length).toBe(2);
    const investors = players.filter((_, i) => !roles.fighters.includes(i));
    // two back fighter 0, one backs fighter 1
    investors.forEach((p, k) => handleArena(arena, p.conn, { t: "a-bet", fighter: k < 2 ? (f0 ?? 0) : (f1 ?? 1), stake: 100 }));
    tickArena(arena);
    for (const p of players) expect(last(p, "a-live")).toBeDefined();
    const fighter0 = players[f0 ?? 0]!;
    const fighter1 = players[f1 ?? 1]!;
    expect(last(fighter0, "start")).toBeDefined();
    // fighter 1 falls after clearing 2 waves, fighter 0 has cleared 5
    const snap = { wave: 6, cleared: 5, time: 200, baseHp: 10, baseMax: 20, coins: 0, towers: [], enemies: [] };
    handleArena(arena, fighter0.conn, { t: "state", s: snap });
    expect(last(investors[0]!, "a-snap")?.fighter).toBe(0);
    handleArena(arena, fighter1.conn, { t: "over", cleared: 2, time: 90 });
    const result = last(players[0]!, "a-result");
    if (!result) throw new Error("no result");
    expect(result.winner).toBe(0);
    const paid = (i: number): number => result.payouts.find((p) => p.name === names[i])?.delta ?? NaN;
    expect(paid(f0 ?? 0)).toBe(FIGHTER_WIN);
    expect(paid(f1 ?? 1)).toBe(FIGHTER_LOSS);
    const deltas = investors.map((p) => result.payouts.find((x) => x.name === names[players.indexOf(p)])?.delta);
    expect(deltas).toEqual([50, 50, -100]);
    const wallet = result.payouts.find((p) => p.name === names[players.indexOf(investors[0]!)])?.diamonds;
    expect(wallet).toBe(START_DIAMONDS + 50);
    clock += 1;
    leaveArena(arena, players[0]!.conn);
    expect(last(players[1]!, "a-room")?.players.length).toBe(4);
  });

  test("a fighter leaving mid-match forfeits", async () => {
    const w = await openWallets(tmp());
    const arena = createArena(w, Math.random, () => 0);
    const a = client(1);
    const b = client(2);
    handleArena(arena, a.conn, { t: "a-join", code: "", name: "Ann", pin: "1111" });
    handleArena(arena, b.conn, { t: "a-join", code: last(a, "a-room")?.code ?? "", name: "Bob", pin: "2222" });
    handleArena(arena, a.conn, { t: "a-start" });
    // no investors: the match starts at once
    expect(last(a, "start")).toBeDefined();
    leaveArena(arena, a.conn);
    expect(last(b, "a-result")?.winner).toBe(1);
  });
});

describe("result screens survive room updates", () => {
  test("a versus win by forfeit stays on the result when the room update follows", () => {
    const session = newSession({ send: () => {}, close: () => {}, tick: () => {} }, false);
    let results = 0;
    const hooks = { onChange: () => {}, onStart: () => {}, onResult: () => results++ };
    onMessage(session, { t: "room", code: "ABCDE", you: 0, names: ["Me", "Rival"] }, hooks);
    onMessage(session, { t: "start", seed: 1, biome: "desert", layout: 2 }, hooks);
    onMessage(session, { t: "result", winner: 0, reason: "forfeit", stats: [] }, hooks);
    onMessage(session, { t: "room", code: "ABCDE", you: 0, names: ["Me"] }, hooks);
    expect(session.phase).toBe("result");
    expect(results).toBe(1);
  });
});

describe("arena money edge cases (from the code review)", () => {
  async function room(n: number): Promise<{ arena: ReturnType<typeof createArena>; cs: Client[]; roles: number[] }> {
    const w = await openWallets(tmp());
    const arena = createArena(w, () => 0.99, () => 0);
    const cs = Array.from({ length: n }, (_, i) => client(i + 1));
    handleArena(arena, cs[0]!.conn, { t: "a-join", code: "", name: "P0", pin: "1111" });
    const code = last(cs[0]!, "a-room")?.code ?? "";
    cs.slice(1).forEach((c, i) => handleArena(arena, c.conn, { t: "a-join", code, name: `P${i + 1}`, pin: "1111" }));
    handleArena(arena, cs[0]!.conn, { t: "a-start" });
    return { arena, cs, roles: last(cs[0]!, "a-roles")?.fighters ?? [] };
  }

  test("a lower slot leaving keeps bets on the same fighter", async () => {
    const { arena, cs, roles } = await room(4);
    const investors = [0, 1, 2, 3].filter((i) => !roles.includes(i));
    const [inv, other] = investors;
    const target = roles[1] ?? 0;
    handleArena(arena, cs[inv!]!.conn, { t: "a-bet", fighter: target, stake: 100 });
    const backedName = last(cs[0]!, "a-room")?.players[target]?.name;
    leaveArena(arena, cs[other!]!.conn);
    const bets = last(cs[inv!]!, "a-bets")?.bets ?? [];
    const room2 = last(cs[inv!]!, "a-room");
    const bet = bets[0];
    expect(bet).toBeDefined();
    expect(room2?.players[bet?.fighter ?? -1]?.name).toBe(backedName);
    expect(room2?.fighters.map((f) => room2.players[f]?.name)).toContain(backedName);
  });

  test("an investor who left mid-match still gets a winning payout", async () => {
    const { arena, cs, roles } = await room(3);
    const inv = [0, 1, 2].find((i) => !roles.includes(i)) ?? 0;
    const w = arena.wallets;
    handleArena(arena, cs[inv]!.conn, { t: "a-bet", fighter: roles[0] ?? 0, stake: 100 });
    tickArena(arena);
    const name = `P${inv}`;
    leaveArena(arena, cs[inv]!.conn);
    // fighter 1 falls first: fighter 0 (the one backed) wins, house bonus 25%
    const f0 = cs[roles[0] ?? 0]!;
    const f1 = cs[roles[1] ?? 1]!;
    handleArena(arena, f0.conn, { t: "state", s: { wave: 3, cleared: 2, time: 60, baseHp: 1, baseMax: 1, coins: 0, towers: [], enemies: [] } });
    handleArena(arena, f1.conn, { t: "over", cleared: 1, time: 40 });
    expect(w.accounts.get(name.toLowerCase())?.diamonds).toBe(START_DIAMONDS + 25);
  });

  test("a fighter leaving during betting refunds everyone and pays no prize", async () => {
    const { arena, cs, roles } = await room(3);
    const inv = [0, 1, 2].find((i) => !roles.includes(i)) ?? 0;
    handleArena(arena, cs[inv]!.conn, { t: "a-bet", fighter: roles[0] ?? 0, stake: 250 });
    const stayer = roles[1] ?? 1;
    leaveArena(arena, cs[roles[0] ?? 0]!.conn);
    expect(arena.wallets.accounts.get(`p${inv}`)?.diamonds).toBe(START_DIAMONDS);
    expect(arena.wallets.accounts.get(`p${stayer}`)?.diamonds).toBe(START_DIAMONDS);
    expect(last(cs[inv]!, "a-room")?.fighters).toEqual([]);
  });

  test("rewards cannot be farmed: fake dates, levels and badges pay nothing", async () => {
    const w = await openWallets(tmp());
    const a = login(w, "Farmer", "1234");
    if (typeof a === "string") throw new Error(a);
    expect(claim(w, a, "daily:a")).toBe(20);
    expect(claim(w, a, "daily:b")).toBe(0);
    expect(claim(w, a, "level:world-grassland:999:3")).toBe(0);
    expect(claim(w, a, "level:hack:1:3")).toBe(0);
    expect(claim(w, a, "badge:made-up")).toBe(0);
  });
});
