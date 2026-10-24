import type { Difficulty, Game, LevelDef, SendKind } from "@/types";
import { levelById, levelsFor } from "@/config/levels";
import type { MapMode } from "@/config/levels";
import { backdropFor, makeThumbs } from "@/ui/thumbs";
import { DIFFICULTY_ORDER } from "@/config/difficulty";
import { versusLevel } from "@/config/versus";
import { STEP, starRating, step } from "@/game/loop";
import { createGame } from "@/game/state";
import { planWave, rewardMultiplier } from "@/game/waves";
import { ENEMIES } from "@/config/enemies";
import { MATCH_START, buySend, createMatch, planEndless } from "@/game/match";
import { think } from "@/game/bot";
import { drawOverlay } from "@/render/overlay";
import { renderStage, resizeStage } from "@/three/stage";
import { loadArt } from "@/three/art";
import { buildLevelScene } from "@/three/level";
import { syncActors } from "@/three/actors";
import { animateMap } from "@/three/map";
import { createAmbient, updateAmbient } from "@/render/ambient";
import { trailBubbles } from "@/render/underwater";
import { play, toggleMute, unlockAudio } from "@/audio/sfx";
import { bestDifficulty, recordWin, starsFor } from "@/progress";
import { badgesForVersus, badgesForWin } from "@/badges";
import { WORLDS, worldIndex } from "@/config/campaign";
import type { World } from "@/config/campaign";
import type { ClientMsg } from "@/net/protocol";
import type { MatchStart } from "@/net/versus";
import { closeVersus, connectVersus, tickVersus, versusSend } from "@/net/versus";
import { connectAi } from "@/net/airival";
import { callApi, loadCreds } from "@/net/account";
import { claimRewards, dailyReward, levelRewards } from "@/rewards";
import { showShop } from "@/ui/shop";
import type { ArenaDeps } from "@/arenaflow";
import { arenaActive, leaveArenaRoom, openArena } from "@/arenaflow";
import { loadMatches, recordMatch } from "@/history";
import type { ProfileData } from "@/ui/profile";
import { profileChip, showProfile } from "@/ui/profile";
import { showBadges, showLevelMap, showTitle, showWorlds } from "@/ui/campaign";
import { showBriefing } from "@/ui/briefing";
import { saveName, savedName, showRoom, showVersusMenu, showVersusResult } from "@/ui/lobby";
import { createVersusHud, showVersusHud, updateVersusHud } from "@/ui/versushud";
import { saveMode } from "@/ui/mode";
import { applyLayout, createLayout, goFullscreen } from "@/ui/layout";
import { createRivalView, drawRival } from "@/render/rival";
import { byId, show } from "@/ui/dom";
import { currentTip } from "@/ui/tips";
import { createHud, previewMarkup, updateHud } from "@/ui/hud";
import { banner, tickBanner, bossBanner, bossDownBanner, evolveBanner, showEndScreen, showLevelSelect, showLoading, showPause, tip } from "@/ui/screens";
import { bindInput, callWave, closePopup, refreshPopup, triggerPower } from "@/ui/controls";
import { nowMs, startCapture } from "@/clock";
import { autoplay, bannerEl, params, screen, stage, stageEl, tipEl, ui, unlockAll, view } from "@/ui/state";

// The page: menus (title, campaign worlds and levels, online versus rooms), starting levels and
// matches, and the frame loop that steps the simulation and draws it.

function leaveGame(): void {
  ui.game = null;
  ui.split = false;
  show(versusHud.rival, true);
  closePopup();
  show(byId("hud", HTMLElement), false);
  showVersusHud(versusHud, false);
  resize();
}

// versus split view: the rival's screen takes half the window
function toggleSplit(): void {
  if (!ui.game?.match) return;
  ui.split = !ui.split;
  // the rival's preview panel is not needed while their whole board is on screen
  show(versusHud.rival, !ui.split);
  resize();
}

// back to the level map of the world being played (the old level grid for the extra modes)
function openMenu(): void {
  if (ui.versus) return leaveRoom();
  leaveGame();
  const world = WORLDS.find((w) => w.mode === ui.mode);
  if (world) openLevelMap(world);
  else showLevelSelect(screen, ui.progress, unlockAll, makeThumbs(ui.mode), backdropFor(ui.mode), (id) => startLevel(id, "medium"), { current: ui.mode, pick: pickMode });
}

function openTitle(): void {
  leaveGame();
  showTitle(screen, { onPlay: openWorlds, onVersus: () => openVersus(""), onAi: playAi, onArena: () => void openArena(arenaDeps), onBadges: openBadges, badges: `${ui.badges.size}` });
  void showChip();
}

// the corner chip, with diamonds once the wallet answers; the daily gift is claimed here
async function showChip(): Promise<void> {
  const creds = loadCreds();
  await claimRewards([dailyReward()], (n) => banner(bannerEl, `<small>DAILY GIFT</small><b>+${n} DIAMONDS</b>`, "victory", 3));
  const wallet = creds ? await callApi("wallet", creds) : null;
  if (!screen.classList.contains("title-screen")) return;
  screen.querySelector(".profile-chip")?.remove();
  profileChip(screen, profileData(), openProfile, wallet && !("error" in wallet) ? wallet.profile : null);
}

// Arena Stakes: a fighter's match runs in this page's game loop as an online versus game
const arenaDeps: ArenaDeps = {
  screen,
  art: () => ui.art,
  startFight: (fight, start) => {
    ui.versus = fight;
    startMatch(start);
  },
  leaveGame: () => {
    ui.versus = null;
    leaveGame();
  },
  onExit: openTitle,
};

function profileData(): ProfileData {
  return { name: savedName(), earned: ui.badges, progress: ui.progress, matches: loadMatches() };
}

async function openProfile(): Promise<void> {
  const creds = loadCreds();
  const wallet = creds ? await callApi("wallet", creds) : null;
  showProfile(screen, profileData(), { onBack: openTitle, onRename: saveName, onShop: () => void openShop() }, wallet && !("error" in wallet) ? wallet.profile : null);
}

async function openShop(error = ""): Promise<void> {
  const creds = loadCreds();
  if (!creds) return void openArena(arenaDeps);
  const wallet = await callApi("wallet", creds);
  if ("error" in wallet) return showShop(screen, null, wallet.error, { onBuy: () => {}, onBack: openTitle });
  showShop(screen, wallet.profile, error, {
    onBuy: async (item) => {
      const r = await callApi("buy", creds, { item });
      void openShop("error" in r ? r.error : "");
    },
    onBack: () => void openProfile(),
  });
}

// Play vs AI: a 1 vs 1 match against the computer, played like an online one
function playAi(): void {
  leaveGame();
  ui.versus = connectAi(savedName(), { onChange: () => {}, onStart: startMatch, onResult: showMatchResult });
  versusSend(ui.versus, { t: "create", name: savedName() });
  versusSend(ui.versus, { t: "start" });
}

function openBadges(): void {
  showBadges(screen, ui.badges, openTitle);
}

function openWorlds(): void {
  leaveGame();
  showWorlds(screen, ui.progress, unlockAll, openLevelMap, openTitle);
}

function openLevelMap(world: World): void {
  leaveGame();
  rememberMode(world.mode);
  const brief = (level: LevelDef): void =>
    showBriefing(screen, world, level, starsFor(ui.progress, world.mode, level.id), bestDifficulty(ui.progress, world.mode, level.id), (d) => startLevel(level.id, d));
  showLevelMap(screen, world, ui.progress, unlockAll, brief, openWorlds);
}

function rememberMode(mode: MapMode): void {
  ui.mode = mode;
  saveMode(mode);
}

function pickMode(mode: MapMode): void {
  rememberMode(mode);
  openMenu();
}

// puts a fresh game on screen (campaign level or versus match)
function launch(game: Game, ambientSeed: number): void {
  unlockAudio();
  if (!ui.art) return;
  ui.game = game;
  ui.scene = buildLevelScene(stage, game, ui.art);
  ui.ambient = createAmbient(game, ambientSeed);
  ui.selection = null;
  ui.aiming = null;
  ui.paused = false;
  ui.endTimer = 0;
  ui.slashed = false;
  ui.bot = { n: 0 };
  closePopup();
  show(screen, false);
  show(byId("hud", HTMLElement), true);
  resize();
}

// ?wave=N (demos): starts at wave N with the coins the skipped waves would have earned (every
// kill's reward plus each wave's clear bonus), so the defence can be built as if they had
// been played
function skipTo(game: Game, wave: number): void {
  for (let w = 0; w < wave - 1; w++) {
    const plan = planWave(game.level, w);
    const kills = plan.spawns.reduce((sum, s) => sum + ENEMIES[s.kind].reward * rewardMultiplier(game.level.id), 0);
    game.coins += Math.round(kills) + 25 + (w + 1) * 8;
  }
  game.wave = wave - 1;
}

function startLevel(id: number, difficulty: Difficulty): void {
  const game = createGame(levelById(id, ui.mode), id * 7919, difficulty);
  // ?wave=N starts at wave N (demos: show a boss without playing the whole level)
  const jump = Number(params.get("wave"));
  if (Number.isInteger(jump) && jump > 1 && jump <= game.level.waves) skipTo(game, jump);
  launch(game, id * 31);
  banner(bannerEl, `<small>LEVEL ${id}  |  ${difficulty.toUpperCase()}</small><b>${game.level.name.toUpperCase()}</b><span>${game.level.keyChange}</span>`, "info", 3.5);
}

// ---- online versus

function openVersus(code: string, error = ""): void {
  leaveGame();
  showVersusMenu(screen, { code, error, onCreate: (name) => joinRoom({ t: "create", name }), onJoin: (name, room) => joinRoom({ t: "join", code: room, name }), onBack: openTitle });
}

function joinRoom(first: ClientMsg): void {
  ui.versus = connectVersus(first, { onChange: renderRoom, onStart: startMatch, onResult: showMatchResult });
  renderRoom();
}

function renderRoom(): void {
  const session = ui.versus;
  if (!session || session.phase === "playing" || session.phase === "result") return;
  // could not connect or the room was refused: back to the menu with the reason
  if (session.error && session.code === "") {
    closeVersus(session);
    ui.versus = null;
    return openVersus("", session.error);
  }
  showRoom(screen, session, { onStart: () => versusSend(session, { t: "start" }), onLeave: leaveRoom });
}

function leaveRoom(): void {
  if (arenaActive()) return leaveArenaRoom(arenaDeps);
  const ai = ui.versus?.ai ?? false;
  if (ui.versus) closeVersus(ui.versus);
  ui.versus = null;
  if (ai) openTitle();
  else openVersus("");
}

function startMatch(start: MatchStart): void {
  const level = versusLevel(start.biome, start.layout);
  if (!level) return;
  const game = createGame(level, start.seed);
  game.match = createMatch();
  game.status = "between";
  game.countdown = MATCH_START;
  ui.speed = 1;
  launch(game, start.seed);
  showVersusHud(versusHud, true);
  const against = ui.versus?.ai ? "VS AI" : arenaActive() ? "ARENA STAKES: YOU ARE A FIGHTER" : "ONLINE 1 VS 1";
  banner(bannerEl, `<small>${against}</small><b>SURVIVE LONGER</b><span>Build fast: the first wave comes in ${MATCH_START} seconds. Spend coins on the bottom bar to send enemies at your rival.</span>`, "info", 5);
}

function showMatchResult(): void {
  const session = ui.versus;
  const game = ui.game;
  if (!session?.result) return;
  const biome = game?.level.biome ?? "grassland";
  const mine = session.result.stats[session.you];
  const theirs = session.result.stats[1 - session.you];
  const won = session.result.winner === session.you;
  recordMatch({ at: Date.now(), ai: session.ai, opponent: theirs?.name ?? "Rival", outcome: session.result.winner === -1 ? "draw" : won ? "won" : "lost", mine: mine?.cleared ?? 0, theirs: theirs?.cleared ?? 0, biome });
  const badges = badgesForVersus(ui.badges, won, mine?.cleared ?? 0);
  // in the arena the payout card follows straight after (src/arenaflow.ts)
  if (arenaActive()) return;
  leaveGame();
  showVersusResult(screen, session, badges, biome, { onRematch: () => versusSend(session, { t: "start" }), onLeave: leaveRoom });
}

function buy(kind: SendKind): void {
  if (ui.game && ui.versus && buySend(ui.game, kind)) versusSend(ui.versus, { t: "send", kind });
}

const versusHud = createVersusHud(stageEl, buy, toggleSplit);
const layout = createLayout(toggleSplit);
const rivalView = createRivalView(layout.rivalCanvas);

// ---- level flow

function togglePause(): void {
  if (!ui.game || ui.game.match || ui.game.status === "won" || ui.game.status === "lost") return;
  ui.paused = !ui.paused;
  if (ui.paused) {
    showPause(screen, {
      resume: togglePause,
      restart: () => ui.game && startLevel(ui.game.level.id, ui.game.difficulty),
      menu: openMenu,
    });
  } else show(screen, false);
}

function cycleSpeed(): void {
  if (ui.game?.match) return;
  ui.speed = ui.speed === 1 ? 2 : ui.speed === 2 ? 3 : 1;
}

const hud = createHud({
  onSpeed: cycleSpeed,
  onPause: togglePause,
  onMute: () => {
    ui.muted = toggleMute();
  },
  onMenu: openMenu,
  onWave: callWave,
  onPower: triggerPower,
});

bindInput({ togglePause, cycleSpeed, toggleSplit });
window.addEventListener("pointerdown", () => void goFullscreen(), { once: true });

function handleEvents(game: Game): void {
  for (const ev of game.events) {
    if (ev.type === "waveStart") banner(bannerEl, `<b>WAVE ${ev.wave}</b>`, "info", 1.6);
    if (ev.type === "waveClear") banner(bannerEl, `<small>WAVE ${ev.wave} CLEARED</small><b>+${ev.bonus} COINS</b>`, "good", 2);
    if (ev.type === "evolve") banner(bannerEl, evolveBanner(ev.family, ev.share, game.level.mapArt === "world" ? game.level.biome : null), "evolve", 5);
    if (ev.type === "boss") banner(bannerEl, bossBanner(ev.kind, game.level.biome), "boss", 3.5);
    if (ev.type === "bossDown") banner(bannerEl, bossDownBanner(ev.kind, game.level.biome, ev.reward), "victory", 3.2);
    if (ev.type === "won" || ev.type === "lost") ui.endTimer = 1.6;
  }
  game.events.length = 0;
  for (const s of game.sfx) play(s);
  game.sfx.length = 0;
}

function endLevel(game: Game): void {
  // versus: the server decides the winner; until then the rival keeps playing on the mini map
  if (game.match) {
    banner(bannerEl, `<small>BASE DESTROYED</small><b>${game.match.cleared} WAVES</b><span>Waiting for your rival... they must beat ${game.match.cleared} waves to win.</span>`, "boss", 600);
    return;
  }
  const won = game.status === "won";
  const stars = won ? starRating(game) : 0;
  if (won) ui.progress = recordWin(ui.progress, ui.mode, game.level.id, stars, DIFFICULTY_ORDER.indexOf(game.difficulty) + 1);
  const nextId = game.level.id + 1;
  const hasNext = levelsFor(ui.mode).some((l) => l.id === nextId);
  // after a world's last level, go on to the world select where the next world has opened
  const inWorld = worldIndex(ui.mode) >= 0;
  const nextWorld = !hasNext && inWorld && worldIndex(ui.mode) < WORLDS.length - 1;
  const badges = won ? badgesForWin(ui.badges, game, inWorld && !hasNext) : [];
  closePopup();
  showEndScreen(
    screen,
    game,
    won,
    stars,
    hasNext ? "NEXT LEVEL" : nextWorld ? "NEXT WORLD" : null,
    {
      retry: () => startLevel(game.level.id, game.difficulty),
      next: () => (hasNext ? startLevel(nextId, game.difficulty) : openWorlds()),
      menu: openMenu,
    },
    badges,
  );
  if (won) void claimRewards(levelRewards(ui.mode, game.level.id, stars, badges), (n) => banner(bannerEl, `<small>REWARD</small><b>+${n} DIAMONDS</b>`, "victory", 3));
}

function nextPreview(game: Game): string {
  if (game.status !== "ready" && game.status !== "between") return "";
  if (game.wave >= game.level.waves) return "";
  const key = `${game.level.id}-${game.wave}`;
  if (key !== ui.previewKey) {
    ui.previewKey = key;
    const plan = game.match ? planEndless(game.level, game.wave) : planWave(game.level, game.wave);
    ui.previewHtml = `<small>NEXT WAVE</small>${previewMarkup(plan.summary, game.level.biome)}`;
  }
  return ui.previewHtml;
}

let last = nowMs();
let acc = 0;

function simulate(game: Game, dt: number): void {
  if (ui.paused) return;
  acc += dt * ui.speed;
  let steps = 0;
  while (acc >= STEP && steps < 12) {
    if (autoplay) {
      ui.botTimer -= STEP;
      if (ui.botTimer <= 0) {
        ui.botTimer = 0.5;
        think(game, ui.bot);
      }
    }
    step(game, STEP);
    acc -= STEP;
    steps += 1;
  }
  if (steps === 12) acc = 0;
}

function frame(): void {
  const now = nowMs();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const game = ui.game;
  const scene = ui.scene;
  if (game && scene && ui.art) {
    simulate(game, dt);
    if (ui.versus && game.match) tickVersus(ui.versus, game, dt);
    handleEvents(game);
    if (ui.endTimer > 0) {
      ui.endTimer -= dt;
      if (ui.endTimer <= 0) endLevel(game);
    }
    syncActors(scene.actors, game);
    animateMap(scene.map, now / 1000);
    if (ui.ambient) updateAmbient(ui.ambient, dt);
    // underwater: bubbles stream from every swimming enemy (they float about 35px above the road)
    if (ui.ambient?.sea) trailBubbles(ui.ambient.sea, game.enemies.filter((e) => e.intro <= 0).map((e) => ({ x: e.pos.x, y: e.pos.y - 35 })), dt);
    renderStage(stage);
    drawOverlay(view, game, ui.art, scene.actors, ui.ambient, {
      hover: ui.hover,
      hoverPad: ui.hoverPad,
      selection: ui.selection,
      aimingStrike: ui.aiming === "strike",
      previewKind: ui.previewKind,
    });
    updateHud(hud, game, { speed: ui.speed, paused: ui.paused, muted: ui.muted, aiming: ui.aiming, nextPreview: nextPreview(game), versusLabel: ui.versus?.ai ? "VS AI" : arenaActive() ? "ARENA STAKES" : "ONLINE VERSUS" });
    if (ui.versus && game.match) {
      updateVersusHud(versusHud, game, ui.versus);
      if (ui.split) drawRival(rivalView, ui.art, game, ui.versus.opp, ui.versus.names[1 - ui.versus.you] ?? "Rival");
    }
    refreshPopup(game);
    // the bot playing a demo needs no hints
    tip(tipEl, autoplay ? null : currentTip(game, ui.aiming, ui.slashed));
  }
  tickBanner(bannerEl);
  requestAnimationFrame(frame);
}

function resize(): void {
  applyLayout(layout, stageEl, view, ui.split);
  resizeStage(stage, view.ratio);
}

async function boot(): Promise<void> {
  if (params.get("capture") === "1") startCapture();
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);
  window.visualViewport?.addEventListener("resize", resize);
  resize();
  showLoading(screen);
  try {
    ui.art = await loadArt();
  } catch (err) {
    screen.textContent = `Could not load the game art: ${String(err)}`;
    return;
  }
  // an invite link (?room=CODE) opens the versus screen with the code filled in; a ?mode
  // link opens that mode's levels; otherwise the game starts at the title screen
  const room = params.get("room");
  if (room) openVersus(room.toUpperCase());
  else if (params.get("mode") || params.get("classic")) openMenu();
  else openTitle();
  // ?level=N jumps straight into a level (for demos and direct links)
  const direct = Number(params.get("level"));
  if (!room && levelsFor(ui.mode).some((l) => l.id === direct)) startLevel(direct, "medium");
  requestAnimationFrame(frame);
}

void boot();
