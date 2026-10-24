import { describe, expect, test } from "bun:test";
import type { ServerMsg } from "@/net/protocol";
import { judge, parseClientMsg, parseServerMsg } from "@/net/protocol";
import { createLobby, handle, leave } from "@server/rooms";
import type { Conn } from "@server/rooms";
import { simulate } from "@/game/bot";
import { versusLevel, VERSUS_LAYOUTS } from "@/config/versus";
import { createGame } from "@/game/state";
import { buySend, createMatch, receiveSend, sendCost } from "@/game/match";
import { STEP, step } from "@/game/loop";

function conn(id: number): Conn & { inbox: ServerMsg[] } {
  const inbox: ServerMsg[] = [];
  return { id, inbox, send: (m) => inbox.push(m) };
}

function last<T extends ServerMsg["t"]>(c: { inbox: ServerMsg[] }, t: T): Extract<ServerMsg, { t: T }> | undefined {
  const found = [...c.inbox].reverse().find((m): m is Extract<ServerMsg, { t: T }> => m.t === t);
  return found;
}

const snap = (cleared: number, time: number) => ({ wave: cleared + 1, cleared, time, baseHp: 20, baseMax: 20, coins: 0, towers: [], enemies: [] });

describe("judge", () => {
  test("most waves wins, then the longer survivor", () => {
    expect(judge([{ cleared: 5, time: 100, over: true }, { cleared: 4, time: 300, over: true }])).toBe(0);
    expect(judge([{ cleared: 5, time: 100, over: true }, { cleared: 5, time: 120, over: true }])).toBe(1);
    expect(judge([{ cleared: 5, time: 100, over: true }, { cleared: 5, time: 100, over: true }])).toBe(-1);
  });
  test("the survivor wins as soon as they pass the fallen player, not before", () => {
    expect(judge([{ cleared: 5, time: 100, over: true }, { cleared: 5, time: 90, over: false }])).toBeNull();
    expect(judge([{ cleared: 5, time: 100, over: true }, { cleared: 5, time: 101, over: false }])).toBe(1);
    expect(judge([{ cleared: 3, time: 50, over: false }, { cleared: 2, time: 60, over: true }])).toBe(0);
  });
});

describe("rooms", () => {
  test("create, share the code, join, start on the same random map, relay sends, judge", () => {
    const lobby = createLobby(() => 0.42);
    const host = conn(1);
    const guest = conn(2);
    handle(lobby, host, { t: "create", name: "Ana" });
    const code = last(host, "room")?.code ?? "";
    expect(code).toHaveLength(5);
    handle(lobby, guest, { t: "join", code: code.toLowerCase(), name: "Ben" });
    expect(last(host, "room")?.names).toEqual(["Ana", "Ben"]);
    expect(last(guest, "room")?.you).toBe(1);
    // a third player is turned away: rooms are strictly 1 vs 1
    const third = conn(3);
    handle(lobby, third, { t: "join", code, name: "Cy" });
    expect(last(third, "error")?.msg).toContain("full");
    // only the host starts; both get the same seed and map
    handle(lobby, guest, { t: "start" });
    expect(last(guest, "error")).toBeDefined();
    handle(lobby, host, { t: "start" });
    const a = last(host, "start");
    const b = last(guest, "start");
    expect(a).toEqual(b);
    expect(VERSUS_LAYOUTS).toContain(a?.layout ?? 0);
    handle(lobby, host, { t: "send", kind: "boss" });
    expect(last(guest, "incoming")?.kind).toBe("boss");
    handle(lobby, host, { t: "state", s: snap(3, 90) });
    expect(last(guest, "opp")?.s.cleared).toBe(3);
    // the guest falls on wave 4 with 3 cleared; the host wins once past them
    handle(lobby, guest, { t: "over", cleared: 3, time: 100 });
    expect(last(host, "result")).toBeUndefined();
    handle(lobby, host, { t: "state", s: snap(3, 101) });
    expect(last(host, "result")?.winner).toBe(0);
    expect(last(guest, "result")?.reason).toBe("outlasted");
  });
  test("leaving mid-match hands the rival the win", () => {
    const lobby = createLobby();
    const host = conn(1);
    const guest = conn(2);
    handle(lobby, host, { t: "create", name: "Ana" });
    handle(lobby, guest, { t: "join", code: last(host, "room")?.code ?? "", name: "Ben" });
    handle(lobby, host, { t: "start" });
    leave(lobby, host);
    expect(last(guest, "result")).toMatchObject({ winner: 1, reason: "forfeit" });
  });
  test("bad codes and junk messages are refused", () => {
    const lobby = createLobby();
    const c = conn(1);
    handle(lobby, c, { t: "join", code: "ZZZZZ", name: "x" });
    expect(last(c, "error")?.msg).toContain("No room");
    expect(parseClientMsg("not json")).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: "send", kind: "nuke-everything" }))).toBeNull();
    expect(parseServerMsg(JSON.stringify({ t: "start", seed: 1, biome: "moon", layout: 2 }))).toBeNull();
  });
});

describe("versus rules", () => {
  test("sends cost coins, rise in price, raise income, and arrive on the other side", () => {
    const level = versusLevel("cyber", 3);
    expect(level).not.toBeNull();
    if (!level) return;
    const me = createGame(level, 5);
    const rival = createGame(level, 5);
    me.match = createMatch();
    rival.match = createMatch();
    const coins = me.coins;
    const price = sendCost(me.match, "swarm");
    expect(buySend(me, "swarm")).toBe(true);
    expect(me.coins).toBe(coins - price);
    expect(sendCost(me.match, "swarm")).toBeGreaterThan(price);
    expect(me.match.income).toBeGreaterThan(0);
    receiveSend(rival, "swarm");
    receiveSend(rival, "empower");
    expect(rival.match.hpMul).toBeGreaterThan(1);
    for (let i = 0; i < 6 / STEP; i++) step(rival, STEP);
    expect(rival.enemies.length).toBeGreaterThanOrEqual(8);
  });
  test("endless waves never declare a win and end with the base falling", () => {
    const r = simulate(5, { build: true, versus: "grassland", maxSeconds: 4000 });
    expect(r.status).toBe("lost");
    expect(r.cleared).toBeGreaterThanOrEqual(5);
    expect(r.cleared).toBeLessThan(40);
  }, 120000);
});

describe("room server over real WebSockets", () => {
  test("two clients meet in a room and start the same match", async () => {
    const port = 5199;
    const proc = Bun.spawn(["bun", "server/main.ts"], { env: { ...process.env, PORT: String(port) }, stdout: "pipe" });
    try {
      await Bun.sleep(600);
      const open = async (): Promise<{ ws: WebSocket; msgs: ServerMsg[] }> => {
        const ws = new WebSocket(`ws://localhost:${port}/ws`);
        const msgs: ServerMsg[] = [];
        ws.addEventListener("message", (ev) => {
          const m = typeof ev.data === "string" ? parseServerMsg(ev.data) : null;
          if (m) msgs.push(m);
        });
        await new Promise<void>((resolve) => ws.addEventListener("open", () => resolve()));
        return { ws, msgs };
      };
      const a = await open();
      const b = await open();
      a.ws.send(JSON.stringify({ t: "create", name: "Ana" }));
      await Bun.sleep(150);
      const code = a.msgs.find((m) => m.t === "room");
      expect(code?.t).toBe("room");
      b.ws.send(JSON.stringify({ t: "join", code: code?.t === "room" ? code.code : "", name: "Ben" }));
      await Bun.sleep(150);
      a.ws.send(JSON.stringify({ t: "start" }));
      await Bun.sleep(150);
      const sa = a.msgs.find((m) => m.t === "start");
      const sb = b.msgs.find((m) => m.t === "start");
      expect(sa).toBeDefined();
      expect(sa).toEqual(sb);
      a.ws.close();
      b.ws.close();
    } finally {
      proc.kill();
    }
  });
});
