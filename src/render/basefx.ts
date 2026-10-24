import type { Projectile } from "@/types";
import { glowDot, lit } from "@/render/paint";

// A base's Ice Archer shot in the worlds: a dart of energy from the base's crystal, tinted with
// the world's colour (the game sets it, src/game/bases.ts), trailing light.

function rgbOf(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

export function drawBaseBolt(ctx: CanvasRenderingContext2D, p: Projectile, muzzle: number): void {
  const at = { x: p.pos.x, y: p.pos.y - muzzle * 0.6 };
  const ang = Math.atan2(p.target.y - p.pos.y, p.target.x - p.pos.x);
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const rgb = rgbOf(p.color);
  lit(ctx, () => {
    const g = ctx.createLinearGradient(at.x - dx * 34, at.y - dy * 34, at.x, at.y);
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(1, `rgba(${rgb},0.9)`);
    ctx.strokeStyle = g;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(at.x - dx * 34, at.y - dy * 34);
    ctx.lineTo(at.x, at.y);
    ctx.stroke();
    glowDot(ctx, at.x, at.y, 14, rgb, 0.85);
  });
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(at.x + dx * 8, at.y + dy * 8);
  ctx.lineTo(at.x - dy * 3, at.y + dx * 3);
  ctx.lineTo(at.x - dx * 5, at.y - dy * 5);
  ctx.lineTo(at.x + dy * 3, at.y - dx * 3);
  ctx.fill();
}
