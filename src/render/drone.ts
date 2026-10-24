import type { Projectile } from "@/types";
import type { Look } from "@/render/shots";
import { glowDot, lit } from "@/render/paint";

// The Cyber Arena Drone Swarm Generator's shot, from its 10-frame sheet: a drone takes off
// straight up from the dock, flies over to the enemy with a purple targeting beam on it, and
// drops a purple energy bomb.

function progress(p: Projectile): number {
  const done = Math.hypot(p.pos.x - p.start.x, p.pos.y - p.start.y);
  const left = Math.hypot(p.target.x - p.pos.x, p.target.y - p.pos.y);
  return done + left < 1 ? 1 : done / (done + left);
}

const ROTORS: [number, number][] = [[-9, -4], [9, -4], [-9, 4], [9, 4]];
// share of the drone's flight spent taking off, and where it is over the target and drops
// its bomb
const RISE = 0.25;
const DROP = 0.85;

// the Drone Swarm's quad-rotor drone: it flies over to the target with a purple targeting beam
// on it, then drops a purple energy bomb at the end of its flight
export function drawDrone(ctx: CanvasRenderingContext2D, look: Look, p: Projectile, muzzle: number, t: number): void {
  const k = progress(p);
  // it takes off straight up from its dock first, then flies over to the target up high
  const rise = Math.min(1, k / RISE);
  const u = Math.max(0, Math.min(1, (k - RISE) / (DROP - RISE)));
  const ground = { x: p.start.x + (p.target.x - p.start.x) * u, y: p.start.y + (p.target.y - p.start.y) * u };
  const at = { x: ground.x, y: ground.y - muzzle * (0.6 + 1.3 * Math.sin((rise * Math.PI) / 2)) + Math.sin(t * 6 + p.id) * 3 };
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(ground.x, ground.y, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.globalAlpha = u > 0 ? 1 : 0.3;
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = `rgba(${look.glow},0.7)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(at.x, at.y + 4);
  ctx.lineTo(p.target.x, p.target.y - 8);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = `rgba(${look.glow},0.8)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(p.target.x, p.target.y - 4, 10, 5, 0, 0, Math.PI * 2);
  ctx.stroke();
  // arms, rotors (spinning blurs) and the body
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(at.x - 9, at.y - 4);
  ctx.lineTo(at.x + 9, at.y + 4);
  ctx.moveTo(at.x + 9, at.y - 4);
  ctx.lineTo(at.x - 9, at.y + 4);
  ctx.stroke();
  for (const [ox, oy] of ROTORS) {
    ctx.fillStyle = "rgba(203,213,225,0.45)";
    ctx.beginPath();
    ctx.ellipse(at.x + ox, at.y + oy - 1, 6, 2 + Math.abs(Math.sin(t * 60 + ox)) * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#1e293b";
  ctx.beginPath();
  ctx.ellipse(at.x, at.y, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  lit(ctx, () => glowDot(ctx, at.x, at.y + 3, 8, look.glow, 0.9));
  if (k > DROP) {
    const fall = (k - DROP) / (1 - DROP);
    const bomb = { x: at.x + (p.target.x - at.x) * fall, y: at.y + (p.target.y - 6 - at.y) * fall * fall };
    lit(ctx, () => glowDot(ctx, bomb.x, bomb.y, 10, look.glow, 0.95));
    ctx.fillStyle = look.core;
    ctx.beginPath();
    ctx.arc(bomb.x, bomb.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

