import type { Game, PowerKind, TowerKind, Vec } from "@/types";
import type { Selection } from "@/render/selection";
import type { Art } from "@/three/art";
import type { LevelScene } from "@/three/level";
import type { MapMode } from "@/config/levels";
import type { Ambient } from "@/render/ambient";
import type { VersusSession } from "@/net/versus";
import { createView } from "@/render/canvas";
import { createStage } from "@/three/stage";
import { loadProgress } from "@/progress";
import { loadBadges } from "@/badges";
import { initialMode } from "@/ui/mode";
import { byId } from "@/ui/dom";

// The page's live state, shared by the main loop (src/main.ts) and the player controls
// (src/ui/controls.ts): the game being played, what is selected, menus, campaign progress,
// and the online versus session when one is running.

export const stageEl = byId("stage", HTMLElement);
// WebGL draws the world, the 2D overlay canvas on top draws bars, rings and effects
export const glCanvas = byId("gl", HTMLCanvasElement);
export const view = createView(byId("fx", HTMLCanvasElement));
export const stage = createStage(glCanvas);
export const screen = byId("screen", HTMLElement);
export const popup = byId("popup", HTMLElement);
export const bannerEl = byId("banner", HTMLElement);
export const tipEl = byId("tip", HTMLElement);

export const params = new URLSearchParams(window.location.search);
// ?all=1 unlocks every level (handy for judges), ?autoplay=1 lets the bot play (demo videos)
export const unlockAll = params.get("all") === "1";
export const autoplay = params.get("autoplay") === "1";

export type UiState = {
  game: Game | null;
  art: Art | null;
  scene: LevelScene | null;
  ambient: Ambient | null;
  selection: Selection;
  previewKind: TowerKind | null;
  aiming: PowerKind | null;
  hover: Vec | null;
  hoverPad: number;
  speed: number;
  paused: boolean;
  muted: boolean;
  menuKey: string;
  previewKey: string;
  previewHtml: string;
  endTimer: number;
  slashed: boolean;
  progress: ReturnType<typeof loadProgress>;
  badges: ReturnType<typeof loadBadges>;
  bot: { n: number };
  botTimer: number;
  mode: MapMode;
  // online versus: the room and match, null in the campaign
  versus: VersusSession | null;
  // versus split view: the rival's screen shares the window
  split: boolean;
};

export const ui: UiState = {
  game: null,
  art: null,
  scene: null,
  ambient: null,
  selection: null,
  previewKind: null,
  aiming: null,
  hover: null,
  hoverPad: -1,
  speed: 1,
  paused: false,
  muted: false,
  menuKey: "",
  previewKey: "",
  previewHtml: "",
  endTimer: 0,
  slashed: false,
  progress: loadProgress(),
  badges: loadBadges(),
  bot: { n: 0 },
  botTimer: 0,
  mode: initialMode(params),
  versus: null,
  split: false,
};
