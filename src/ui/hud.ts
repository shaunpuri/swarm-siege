import type { Biome, Game, PowerKind, WaveSummary } from "@/types";
import { enemyName } from "@/config/biomes";
import { ENEMIES, POWERS, POWER_KINDS } from "@/config/enemies";
import { earlyBonus } from "@/game/loop";
import { powerBlocked } from "@/game/powers";
import { button, byId, h, setText, show } from "@/ui/dom";

// holding a power this long (touch) shows its info card; it stays up this long after release
const HOLD_MS = 450;
const TIP_LINGER_MS = 1800;

export type Hud = {
  root: HTMLElement;
  levelName: HTMLElement;
  waveInfo: HTMLElement;
  coins: HTMLElement;
  bases: HTMLElement;
  speed: HTMLButtonElement;
  pause: HTMLButtonElement;
  mute: HTMLButtonElement;
  waveBtn: HTMLButtonElement;
  preview: HTMLElement;
  bossBar: HTMLElement;
  bossName: HTMLElement;
  bossFill: HTMLElement;
  powers: HTMLElement;
  powerButtons: Map<PowerKind, { el: HTMLButtonElement; cd: HTMLElement }>;
};

export type HudActions = {
  onSpeed: () => void;
  onPause: () => void;
  onMute: () => void;
  onMenu: () => void;
  onWave: () => void;
  onPower: (kind: PowerKind) => void;
};

export function createHud(actions: HudActions): Hud {
  const hud: Hud = {
    root: byId("hud", HTMLElement),
    levelName: byId("lvlName", HTMLElement),
    waveInfo: byId("waveInfo", HTMLElement),
    coins: byId("coins", HTMLElement),
    bases: byId("bases", HTMLElement),
    speed: byId("btnSpeed", HTMLButtonElement),
    pause: byId("btnPause", HTMLButtonElement),
    mute: byId("btnMute", HTMLButtonElement),
    waveBtn: byId("btnWave", HTMLButtonElement),
    preview: byId("wavePreview", HTMLElement),
    bossBar: byId("bossBar", HTMLElement),
    bossName: byId("bossName", HTMLElement),
    bossFill: byId("bossFill", HTMLElement),
    powers: byId("powers", HTMLElement),
    powerButtons: new Map(),
  };
  const wire = (el: HTMLButtonElement, fn: () => void): void => {
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      fn();
    });
  };
  wire(hud.speed, actions.onSpeed);
  wire(hud.pause, actions.onPause);
  wire(hud.mute, actions.onMute);
  wire(byId("btnMenu", HTMLButtonElement), actions.onMenu);
  wire(hud.waveBtn, actions.onWave);

  for (const kind of POWER_KINDS) {
    const def = POWERS[kind];
    // on phones there is no hover: holding a power shows its card instead of using it
    let held = false;
    const el = button(
      "power",
      `<span class="p-icon">${def.icon}</span><span class="p-name">${def.name}</span><span class="p-cost">${def.cost}</span><span class="p-key">${def.key}</span>`,
      () => {
        if (!held) actions.onPower(kind);
        held = false;
      },
    );
    let holdTimer = 0;
    el.addEventListener("pointerdown", (ev) => {
      if (ev.pointerType !== "touch") return;
      holdTimer = window.setTimeout(() => {
        held = true;
        el.classList.add("show-tip");
      }, HOLD_MS);
    });
    const release = (): void => {
      window.clearTimeout(holdTimer);
      window.setTimeout(() => el.classList.remove("show-tip"), TIP_LINGER_MS);
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("contextmenu", (ev) => ev.preventDefault());
    // an info card that slides out beside the button: what it does, its price and cooldown
    const tip = h("span", "p-tip");
    tip.innerHTML = `<b>${def.name}</b><span>${def.desc}</span><small>${def.cost} coins | ready again after ${def.cooldown}s | key ${def.key}</small>`;
    el.appendChild(tip);
    const cd = h("span", "p-cd");
    el.appendChild(cd);
    hud.powers.appendChild(el);
    hud.powerButtons.set(kind, { el, cd });
  }
  return hud;
}

function waveLabel(game: Game): string {
  if (game.status === "ready") return `START WAVE 1`;
  if (game.status === "between") return `CALL WAVE ${game.wave + 1} NOW  +${earlyBonus(game)}`;
  if (game.status === "wave") return `WAVE ${game.wave} IN PROGRESS`;
  return game.status === "won" ? "VICTORY" : "DEFEAT";
}

let lastPreviewKey = "";

export function updateHud(hud: Hud, game: Game, opts: { speed: number; paused: boolean; muted: boolean; aiming: PowerKind | null; nextPreview: string; versusLabel: string }): void {
  // versus waves are endless, so there is no total to show
  setText(hud.levelName, game.match ? `${opts.versusLabel}  ${game.level.biome.toUpperCase()}` : `LEVEL ${game.level.id}  ${game.level.name.toUpperCase()}`);
  setText(hud.waveInfo, game.match ? `WAVE ${Math.max(1, game.wave)}` : `WAVE ${Math.max(1, game.wave)}/${game.level.waves}`);
  setText(hud.coins, String(Math.floor(game.coins)));
  setText(hud.speed, `${opts.speed}x`);
  // versus runs in real time for both players: no speed-up, no pause
  show(hud.speed, game.match === null);
  show(hud.pause, game.match === null);
  setText(hud.pause, opts.paused ? "PLAY" : "PAUSE");
  setText(hud.mute, opts.muted ? "SOUND OFF" : "SOUND ON");

  const basesKey = game.bases.map((b) => `${b.kind}${Math.ceil(b.hp)}`).join(",") + (game.power.shield > 0 ? "s" : "");
  if (hud.bases.dataset["key"] !== basesKey) {
    hud.bases.dataset["key"] = basesKey;
    hud.bases.innerHTML = game.bases
      .map((b) => `<span class="base-chip ${b.kind} ${b.hp <= b.maxHp * 0.3 ? "low" : ""}">${b.kind.slice(0, 1).toUpperCase()}${b.kind.slice(1)} <b>${Math.ceil(b.hp)}</b>/${b.maxHp}</span>`)
      .join("");
  }

  setText(hud.waveBtn, waveLabel(game));
  hud.waveBtn.disabled = game.status !== "ready" && game.status !== "between";
  hud.waveBtn.classList.toggle("pulse", game.status === "ready");
  const countdown = game.status === "between" ? Math.ceil(game.countdown) : 0;
  hud.waveBtn.dataset["countdown"] = countdown > 0 ? `auto in ${countdown}s` : "";
  if (opts.nextPreview !== lastPreviewKey) {
    lastPreviewKey = opts.nextPreview;
    hud.preview.innerHTML = opts.nextPreview;
  }

  const boss = game.enemies.find((e) => e.boss);
  show(hud.bossBar, boss !== undefined);
  if (boss) {
    const name = enemyName(boss.kind, game.level.biome).toUpperCase();
    setText(hud.bossName, boss.kind === "titan" ? (boss.enraged ? `${name}  ENRAGED` : name) : `${name} COMMANDER`);
    hud.bossFill.style.width = `${(boss.hp / boss.maxHp) * 100}%`;
  }

  for (const kind of POWER_KINDS) {
    const ref = hud.powerButtons.get(kind);
    if (!ref) continue;
    const blocked = powerBlocked(game, kind);
    ref.el.classList.toggle("disabled", blocked !== null);
    ref.el.classList.toggle("aiming", opts.aiming === kind);
    const active = (kind === "overclock" && game.power.overclock > 0) || (kind === "cryo" && game.power.cryo > 0) || (kind === "shield" && game.power.shield > 0);
    ref.el.classList.toggle("active", active);
    const cd = game.cooldowns[kind];
    const frac = cd > 0 ? cd / POWERS[kind].cooldown : 0;
    ref.cd.style.background = frac > 0 ? `conic-gradient(rgba(2,6,23,0.75) ${frac * 360}deg, transparent 0)` : "transparent";
    setText(ref.cd, cd > 0 ? String(Math.ceil(cd)) : "");
  }
}

export function previewMarkup(summary: WaveSummary[], biome: Biome): string {
  return summary
    .map((s) => `<span class="pv ${s.kind} ${s.boss ? "boss" : ""}" title="${ENEMIES[s.kind].desc}"><i></i>${s.boss ? "BOSS " : ""}${enemyName(s.kind, biome)} x${s.count}</span>`)
    .join("");
}
