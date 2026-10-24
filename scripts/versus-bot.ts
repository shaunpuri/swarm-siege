// A headless second player for an online 1 vs 1 room (for demos and recordings): it joins the
// room by code over the real WebSocket, plays its own board with the game's bot in real time,
// reports its snapshots, sends enemies from a banked share of its coins, and says when its
// base falls, exactly like a player's browser would.
// Run with: bun scripts/versus-bot.ts <room code> [server url] [name]

import type { Game, SendKind } from "@/types";
import type { ClientMsg } from "@/net/protocol";
import { parseServerMsg } from "@/net/protocol";
import { snapshot } from "@/net/versus";
import { versusLevel } from "@/config/versus";
import { createGame } from "@/game/state";
import { STEP, step } from "@/game/loop";
import { MATCH_START, buySend, canBuy, createMatch, receiveSend, sendCost, sendKinds } from "@/game/match";
import { think } from "@/game/bot";

const [code = "", url = "wss://swarm.aichess.guru/ws", name = "Rival Bot"] = process.argv.slice(2);
if (!code) throw new Error("usage: bun scripts/versus-bot.ts <room code> [server url] [name]");

const socket = new WebSocket(url);
const send = (msg: ClientMsg): void => socket.send(JSON.stringify(msg));
let game: Game | null = null;
const built = { n: 0 };
let bank = 0;
let lastCoins = 0;
let over = false;

function chooseSend(g: Game): SendKind | null {
  const match = g.match;
  if (!match) return null;
  const affordable = sendKinds().filter((k) => canBuy(g, k) && sendCost(match, k) <= bank);
  return affordable[affordable.length - 1] ?? null;
}

socket.addEventListener("open", () => send({ t: "join", code: code.toUpperCase(), name }));
socket.addEventListener("message", (ev) => {
  const msg = typeof ev.data === "string" ? parseServerMsg(ev.data) : null;
  if (!msg) return;
  if (msg.t === "room") console.log(`in room ${msg.code} as player ${msg.you + 1}: ${msg.names.join(" vs ")}`);
  if (msg.t === "error") console.log(`error: ${msg.msg}`);
  if (msg.t === "start") {
    const level = versusLevel(msg.biome, msg.layout);
    if (!level) return;
    game = createGame(level, msg.seed);
    game.match = createMatch();
    game.status = "between";
    game.countdown = MATCH_START;
    lastCoins = game.coins;
    bank = 0;
    over = false;
    console.log(`match on ${msg.biome} layout ${msg.layout}`);
  }
  if (msg.t === "incoming" && game) receiveSend(game, msg.kind);
  if (msg.t === "result") {
    console.log(`result: winner ${msg.winner}, ${msg.stats.map((s) => `${s.name} ${s.cleared}`).join(" | ")}`);
    socket.close();
    process.exit(0);
  }
});

let thinkIn = 0;
let snapIn = 0;
let sendIn = 12;
setInterval(() => {
  const g = game;
  if (!g || over) return;
  // four steps every 1/15 s: real time
  for (let i = 0; i < 4; i++) step(g, STEP);
  const dt = STEP * 4;
  const earned = g.coins - lastCoins;
  if (earned > 0) bank += earned * 0.25;
  bank = Math.min(bank, g.coins);
  thinkIn -= dt;
  if (thinkIn <= 0) {
    thinkIn = 0.5;
    g.coins -= bank;
    think(g, built);
    g.coins += bank;
  }
  sendIn -= dt;
  if (sendIn <= 0) {
    sendIn = 10 + Math.random() * 6;
    const kind = chooseSend(g);
    const before = g.coins;
    if (kind && buySend(g, kind)) {
      bank -= before - g.coins;
      send({ t: "send", kind });
    }
  }
  lastCoins = g.coins;
  snapIn -= dt;
  if (snapIn <= 0) {
    snapIn = 0.25;
    send({ t: "state", s: snapshot(g) });
  }
  if (g.status === "lost") {
    over = true;
    send({ t: "state", s: snapshot(g) });
    send({ t: "over", cleared: g.match?.cleared ?? 0, time: g.time });
  }
}, (STEP * 4 * 1000));
