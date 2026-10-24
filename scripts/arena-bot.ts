// A headless Arena Stakes player (for demos, recordings and checks): it signs in, joins the
// room by code, and plays whatever role it is drawn: as an investor it bets a random stake on a
// random fighter; as a fighter it plays its board in real time with the game's bot, reporting
// snapshots and its fall like a player's browser.
// Run with: bun scripts/arena-bot.ts <room code> <name> [server url]

import type { Game } from "@/types";
import type { ArenaClientMsg } from "@/net/arenaproto";
import { STAKES, parseArenaServer } from "@/net/arenaproto";
import { snapshot } from "@/net/versus";
import { versusLevel } from "@/config/versus";
import { createGame } from "@/game/state";
import { STEP, step } from "@/game/loop";
import { MATCH_START, createMatch, receiveSend } from "@/game/match";
import { think } from "@/game/bot";

const [code = "", name = "Bot", url = "ws://localhost:5174/arena"] = process.argv.slice(2);
const socket = new WebSocket(url);
const send = (msg: ArenaClientMsg): void => socket.send(JSON.stringify(msg));
let game: Game | null = null;
const built = { n: 0 };
let over = false;
let players: number[] = [];

socket.addEventListener("open", () => send({ t: "a-join", code, name, pin: "4321" }));
socket.addEventListener("message", (ev) => {
  const msg = typeof ev.data === "string" ? parseArenaServer(ev.data) : null;
  if (!msg) return;
  if (msg.t === "error") console.log(`${name}: ${msg.msg}`);
  if (msg.t === "a-room") players = msg.players.map((p) => p.diamonds);
  if (msg.t === "a-roles") {
    const fighter = msg.fighters.includes(msg.you);
    console.log(`${name}: ${fighter ? "FIGHTER" : "INVESTOR"}`);
    if (!fighter) {
      const pick = msg.fighters[Math.floor(Math.random() * msg.fighters.length)] ?? 0;
      // a stake it can afford
      const wallet = players[msg.you] ?? 0;
      const affordable = STAKES.filter((v) => v <= wallet);
      const stake = affordable[Math.floor(Math.random() * affordable.length)] ?? 50;
      setTimeout(() => send({ t: "a-bet", fighter: pick, stake }), 1500 + Math.random() * 4000);
    }
  }
  if (msg.t === "start") {
    const level = versusLevel(msg.biome, msg.layout);
    if (!level) return;
    game = createGame(level, msg.seed);
    game.match = createMatch();
    game.status = "between";
    game.countdown = MATCH_START;
    over = false;
  }
  if (msg.t === "incoming" && game) receiveSend(game, msg.kind);
  if (msg.t === "a-result") {
    console.log(`${name}: result ${msg.payouts.map((p) => `${p.name} ${p.delta >= 0 ? "+" : ""}${p.delta}`).join(", ")}`);
    game = null;
  }
});

let thinkIn = 0;
let snapIn = 0;
setInterval(() => {
  const g = game;
  if (!g || over) return;
  for (let i = 0; i < 4; i++) step(g, STEP);
  thinkIn -= STEP * 4;
  if (thinkIn <= 0) {
    thinkIn = 0.5;
    think(g, built);
  }
  snapIn -= STEP * 4;
  if (snapIn <= 0) {
    snapIn = 0.25;
    send({ t: "state", s: snapshot(g) });
  }
  if (g.status === "lost") {
    over = true;
    send({ t: "state", s: snapshot(g) });
    send({ t: "over", cleared: g.match?.cleared ?? 0, time: g.time });
  }
}, STEP * 4 * 1000);
