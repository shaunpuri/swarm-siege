import type { Game } from "@/types";
import type { Art } from "@/three/art";
import type { ArenaSession } from "@/net/arena";
import type { Creds, WalletProfile } from "@/net/account";
import type { MatchStart, VersusSession } from "@/net/versus";
import { amFighter, arenaSend, closeArena, connectArena } from "@/net/arena";
import { callApi, loadCreds, saveCreds } from "@/net/account";
import { versusLevel } from "@/config/versus";
import { createGame } from "@/game/state";
import { createRivalView, drawRival } from "@/render/rival";
import { showArenaMenu, showArenaResult, showArenaRoom, showBetting, showWatch } from "@/ui/arena";

// Arena Stakes from the menus to the payout: signing in to the diamond wallet, the room, the
// betting window, then either the fighter's match (played by the main game loop as an online
// 1 vs 1) or the investor's live view of both boards, and the payout card for everyone.

export type ArenaDeps = {
  screen: HTMLElement;
  art: () => Art | null;
  // puts a fighter's match on screen, played as an online versus game
  startFight: (fight: VersusSession, start: MatchStart) => void;
  leaveGame: () => void;
  onExit: () => void;
};

let session: ArenaSession | null = null;
let profile: WalletProfile | null = null;
let watching: number | null = null;

export function arenaActive(): boolean {
  return session !== null;
}

function menu(deps: ArenaDeps, error = "", code = ""): void {
  const creds = loadCreds();
  showArenaMenu(deps.screen, {
    creds,
    profile,
    error,
    code,
    onSignIn: (c) => void signIn(deps, c),
    onSignOut: () => {
      saveCreds(null);
      profile = null;
      menu(deps);
    },
    onCreate: () => join(deps, ""),
    onJoin: (room) => join(deps, room),
    onBack: deps.onExit,
  });
}

async function signIn(deps: ArenaDeps, c: Creds): Promise<void> {
  const r = await callApi("wallet", c);
  if ("error" in r) return menu(deps, r.error);
  saveCreds({ name: r.profile.name, pin: c.pin });
  profile = r.profile;
  menu(deps);
}

export async function openArena(deps: ArenaDeps): Promise<void> {
  const creds = loadCreds();
  if (creds && !profile) {
    const r = await callApi("wallet", creds);
    if (!("error" in r)) profile = r.profile;
  }
  menu(deps);
}

function join(deps: ArenaDeps, code: string): void {
  const creds = loadCreds();
  if (!creds) return menu(deps, "Sign in first");
  session = connectArena({ t: "a-join", code, name: creds.name, pin: creds.pin }, {
    onChange: () => render(deps),
    onFight: (start) => {
      if (session?.fight) deps.startFight(session.fight, start);
    },
    onFightResult: () => {},
  });
  render(deps);
}

export function leaveArenaRoom(deps: ArenaDeps): void {
  if (session) closeArena(session);
  session = null;
  stopWatching();
  deps.leaveGame();
  void openArena(deps);
}

function stopWatching(): void {
  if (watching !== null) cancelAnimationFrame(watching);
  watching = null;
}

// the investor's view: both fighters' boards redrawn every frame from their snapshots
function watch(deps: ArenaDeps, s: ArenaSession): void {
  const art = deps.art();
  const level = s.match ? versusLevel(s.match.biome, s.match.layout) : null;
  if (!art || !level || !s.match) return;
  const game: Game = createGame(level, s.match.seed);
  const views = showWatch(deps.screen, s, () => leaveArenaRoom(deps)).map(createRivalView);
  const draw = (): void => {
    views.forEach((v, side) => drawRival(v, art, game, s.boards[side] ?? null, s.players[s.fighters[side] ?? -1]?.name ?? "Fighter"));
    watching = requestAnimationFrame(draw);
  };
  stopWatching();
  draw();
}

function render(deps: ArenaDeps): void {
  const s = session;
  if (!s) return;
  // the connection or the join failed: back to the menu with the reason
  if (s.error && s.code === "") {
    closeArena(s);
    session = null;
    return menu(deps, s.error);
  }
  const me = s.players[s.you];
  if (me && profile) profile = { ...profile, diamonds: me.diamonds };
  const leave = (): void => leaveArenaRoom(deps);
  if (s.phase === "connecting" || s.phase === "lobby") {
    stopWatching();
    showArenaRoom(deps.screen, s, { onStart: () => arenaSend(s, { t: "a-start" }), onLeave: leave });
  } else if (s.phase === "betting") {
    showBetting(deps.screen, s, { onBet: (fighter, stake) => arenaSend(s, { t: "a-bet", fighter, stake }), onLeave: leave });
    tickTimer(deps, s);
  } else if (s.phase === "playing") {
    // fighters are in the game itself (the main loop); investors watch
    if (!amFighter(s) && watching === null) watch(deps, s);
  } else if (s.phase === "result") {
    // the payout card stays up (room updates refresh it) until the host starts the next round
    stopWatching();
    deps.leaveGame();
    showArenaResult(deps.screen, s, {
      onAgain: () => arenaSend(s, { t: "a-start" }),
      onLeave: leave,
    });
  }
}

// counts the betting window down on screen
function tickTimer(deps: ArenaDeps, s: ArenaSession): void {
  const el = deps.screen.querySelector("[data-timer]");
  if (!el || s.phase !== "betting") return;
  el.textContent = String(Math.max(0, Math.ceil((s.betEndsAt - performance.now()) / 1000)));
  requestAnimationFrame(() => tickTimer(deps, s));
}
