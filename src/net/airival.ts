import type { Game, SendKind } from "@/types";
import type { ClientMsg, Run, ServerMsg } from "@/net/protocol";
import type { VersusHooks, VersusSession } from "@/net/versus";
import { judge } from "@/net/protocol";
import { newSession, onMessage, snapshot } from "@/net/versus";
import { VERSUS_BIOMES, VERSUS_LAYOUTS, versusLevel } from "@/config/versus";
import { createGame } from "@/game/state";
import { STEP, step } from "@/game/loop";
import { MATCH_START, buySend, canBuy, createMatch, receiveSend, sendCost, sendKinds } from "@/game/match";
import { think } from "@/game/bot";

// Play vs AI: a 1 vs 1 match against the computer, run entirely in the page. The AI rival
// speaks the same protocol as the room server (src/net/versus.ts), so the match plays exactly
// like an online one: the same random map for both, split view of the rival's board, enemies
// sent both ways, and the same judge. The rival's board is a second game simulated alongside
// yours and played by the game's bot (it builds, upgrades, repairs and uses powers); it banks a
// quarter of what it earns and every so often spends that bank on sending you enemies.

export const AI_NAME = "Swarm AI";
// how often the AI looks at its board, sends you its snapshot, and thinks about a send
const THINK_EVERY = 0.25;
const SNAPSHOT_EVERY = 0.25;
const SEND_EVERY = [9, 16];
// share of every coin it earns that it banks for sending enemies (the bot spends the rest)
const SEND_SHARE = 0.25;

type Rival = {
  game: Game | null;
  built: { n: number };
  mine: Run;
  theirs: Run;
  playing: boolean;
  acc: number;
  thinkIn: number;
  snapIn: number;
  sendIn: number;
  // coins set aside for sends, and its coins last frame (to see what it earned)
  bank: number;
  lastCoins: number;
};

const fresh = (): Run => ({ cleared: 0, time: 0, over: false });

function pick<T>(list: readonly T[], fallback: T): T {
  return list[Math.floor(Math.random() * list.length)] ?? fallback;
}

// the dearest send its bank can pay for, so its pressure grows with its economy
function chooseSend(game: Game, bank: number): SendKind | null {
  const match = game.match;
  if (!match) return null;
  const affordable = sendKinds().filter((k) => canBuy(game, k) && sendCost(match, k) <= bank);
  return affordable[affordable.length - 1] ?? null;
}

export function connectAi(name: string, hooks: VersusHooks): VersusSession {
  const rival: Rival = { game: null, built: { n: 0 }, mine: fresh(), theirs: fresh(), playing: false, acc: 0, thinkIn: 0, snapIn: 0, sendIn: 0, bank: 0, lastCoins: 0 };
  const you = name || "You";
  const deliver = (msg: ServerMsg): void => onMessage(session, msg, hooks);

  const decide = (): void => {
    const winner = judge([rival.mine, rival.theirs]);
    if (winner === null) return;
    rival.playing = false;
    const stats = [
      { name: you, cleared: rival.mine.cleared, time: Math.round(rival.mine.time) },
      { name: AI_NAME, cleared: rival.theirs.cleared, time: Math.round(rival.theirs.time) },
    ];
    deliver({ t: "result", winner, reason: winner === -1 ? "draw" : "outlasted", stats });
  };

  const start = (): void => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const biome = pick(VERSUS_BIOMES, "grassland");
    const layout = pick(VERSUS_LAYOUTS, 2);
    const level = versusLevel(biome, layout);
    if (!level) return;
    const game = createGame(level, seed);
    game.match = createMatch();
    game.status = "between";
    game.countdown = MATCH_START;
    Object.assign(rival, { game, built: { n: 0 }, mine: fresh(), theirs: fresh(), playing: true, acc: 0, thinkIn: 0, snapIn: 0, sendIn: SEND_EVERY[0] ?? 9, bank: 0, lastCoins: game.coins });
    deliver({ t: "start", seed, biome, layout });
  };

  const send = (msg: ClientMsg): void => {
    if (msg.t === "create" || msg.t === "join") deliver({ t: "room", code: "AI", you: 0, names: [you, AI_NAME] });
    else if (msg.t === "start") start();
    else if (msg.t === "send" && rival.playing && rival.game) receiveSend(rival.game, msg.kind);
    else if (msg.t === "state") rival.mine = { cleared: msg.s.cleared, time: msg.s.time, over: false };
    else if (msg.t === "over" && rival.playing) {
      rival.mine = { cleared: msg.cleared, time: msg.time, over: true };
      decide();
    } else if (msg.t === "leave") rival.playing = false;
  };

  const tick = (dt: number): void => {
    const game = rival.game;
    if (!rival.playing || !game) return;
    rival.acc += dt;
    while (rival.acc >= STEP) {
      step(game, STEP);
      rival.acc -= STEP;
    }
    // bank a share of what it earned since last frame
    const earned = game.coins - rival.lastCoins;
    if (earned > 0) rival.bank += earned * SEND_SHARE;
    rival.bank = Math.min(rival.bank, game.coins);
    rival.thinkIn -= dt;
    if (rival.thinkIn <= 0 && game.status !== "lost") {
      rival.thinkIn = THINK_EVERY;
      // the bot only sees the coins outside the bank
      game.coins -= rival.bank;
      think(game, rival.built);
      game.coins += rival.bank;
    }
    rival.sendIn -= dt;
    if (rival.sendIn <= 0 && game.status !== "lost") {
      rival.sendIn = (SEND_EVERY[0] ?? 9) + Math.random() * ((SEND_EVERY[1] ?? 16) - (SEND_EVERY[0] ?? 9));
      const kind = chooseSend(game, rival.bank);
      const before = game.coins;
      if (kind && buySend(game, kind)) {
        rival.bank -= before - game.coins;
        deliver({ t: "incoming", kind });
      }
    }
    rival.lastCoins = game.coins;
    rival.snapIn -= dt;
    if (rival.snapIn <= 0) {
      rival.snapIn = SNAPSHOT_EVERY;
      deliver({ t: "opp", s: snapshot(game) });
    }
    rival.theirs = { cleared: game.match?.cleared ?? 0, time: game.time, over: game.status === "lost" };
    // decided as soon as one side has fallen and the other has passed it
    decide();
  };

  const close = (): void => {
    rival.playing = false;
  };
  const session = newSession({ send, close, tick }, true);
  return session;
}
