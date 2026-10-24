import type { Biome, Game, Tower, Vec } from "@/types";
import { towerStats } from "@/config/towers";
import { lookFor } from "@/render/shots";
import { stormKindFor } from "@/game/storms";
import { drawStormReady } from "@/render/storms";
import { glowDot, lit } from "@/render/paint";

// The charge before a shot, from the turret sheets' first attack frames: the Frost Mortar and
// Tide Launcher charge energy in their barrel, the Ice Cannon and Abyssal Cannon in their
// crystal core, the Electric Arc builds energy in its rails, the Quantum Singularity's core
// brightens, the Cactus Sand Mortar loads a glowing pod. A storm turret also glows as its
// storm comes ready.

const CHARGERS = new Set(["lob", "shard", "arcbolt", "wave"]);

function drawCharge(ctx: CanvasRenderingContext2D, biome: Biome, tower: Tower, at: Vec, t: number): void {
  const look = lookFor(biome, tower.level);
  if (!look || !CHARGERS.has(look.style) || look.impact === "mud") return;
  const period = 1 / Math.max(0.01, towerStats(tower).rate);
  const k = 1 - Math.max(0, tower.cooldown) / period;
  // only the last part of the reload, so a fast turret does not glow all the time
  const c = Math.max(0, (k - 0.55) / 0.45);
  if (c <= 0) return;
  lit(ctx, () => glowDot(ctx, at.x, at.y, 6 + c * 14 + Math.sin(t * 20) * 1.5, look.glow, 0.25 + c * 0.6));
}

export function drawTurretCharges(ctx: CanvasRenderingContext2D, game: Game, muzzle: number, t: number): void {
  const biome = game.level.biome;
  for (const tower of game.towers) {
    const at = { x: tower.pos.x + Math.cos(tower.angle) * 12, y: tower.pos.y - muzzle * 0.85 + Math.sin(tower.angle) * 6 };
    drawCharge(ctx, biome, tower, at, t);
    const storm = stormKindFor(game, tower);
    if (storm) drawStormReady(ctx, storm, tower.pos, tower.special, t);
  }
}
