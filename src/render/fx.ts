import type { Beam, FloatText, Particle, Strike, Vec, Vine } from "@/types";
import { bezier } from "@/game/geometry";
import { vineControl } from "@/game/vines";
import { bar } from "@/render/canvas";

export function drawBeam(ctx: CanvasRenderingContext2D, b: Beam): void {
  const k = b.life / b.maxLife;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = b.color;
  ctx.shadowColor = b.color;
  ctx.shadowBlur = 18;
  ctx.globalAlpha = k;
  ctx.lineWidth = b.width * k;
  ctx.beginPath();
  ctx.moveTo(b.from.x, b.from.y);
  ctx.lineTo(b.to.x, b.to.y);
  ctx.stroke();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = b.width * k * 0.35;
  ctx.stroke();
  ctx.restore();
}

export function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  const k = Math.max(0, p.life / p.maxLife);
  ctx.globalAlpha = Math.min(1, k * 1.4);
  if (p.kind === "ring") {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 3 * k + 0.5;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.size * (1 - k * 0.85), 0, Math.PI * 2);
    ctx.stroke();
  } else if (p.kind === "smoke") {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.size * (1.6 - k * 0.6), 0, Math.PI * 2);
    ctx.fill();
  } else if (p.kind === "flame") {
    ctx.fillStyle = k > 0.6 ? "#fde68a" : k > 0.3 ? "#fb923c" : "#b91c1c";
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.size * (0.5 + (1 - k)), 0, Math.PI * 2);
    ctx.fill();
  } else if (p.kind === "poison") {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, p.size * (0.6 + (1 - k) * 0.6), 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = p.color;
    ctx.fillRect(p.pos.x - p.size / 2, p.pos.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

// a boss's vines in its world's look: the Colossus's green vines, the Ice Dragon's ice chains,
// the Mummy King's bandages, Damyaan's water tendrils, the Overlord's red energy cables
export type VineLook = { dark: string; mid: string; light: string; thorn: string };
export const FOREST_VINE: VineLook = { dark: "#052e16", mid: "#166534", light: "#4ade80", thorn: "#14532d" };

export function drawVine(ctx: CanvasRenderingContext2D, v: Vine, t: number, look: VineLook = FOREST_VINE): void {
  const c = vineControl(v);
  const steps = 24;
  const pts: Vec[] = [];
  for (let i = 0; i <= steps; i++) {
    const k = (i / steps) * v.growth;
    const p = bezier(v.origin, c, v.to, k);
    // a little writhing motion
    const wob = Math.sin(t * 4 + i * 0.7 + v.id) * 3 * Math.sin(Math.PI * k);
    pts.push({ x: p.x + wob, y: p.y + wob * 0.5 });
  }
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const stroke = (width: number, color: string, blur: number): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.beginPath();
    let first = true;
    for (const p of pts) {
      if (first) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
      first = false;
    }
    ctx.stroke();
  };
  stroke(12, look.dark, 0);
  stroke(8, look.mid, 10 + Math.sin(t * 5) * 6);
  stroke(3, look.light, 0);
  ctx.shadowBlur = 0;
  ctx.fillStyle = look.thorn;
  pts.forEach((p, i) => {
    if (i % 3 !== 1) return;
    ctx.beginPath();
    ctx.moveTo(p.x - 3, p.y);
    ctx.lineTo(p.x, p.y - 8);
    ctx.lineTo(p.x + 3, p.y);
    ctx.fill();
  });
  const tip = pts[pts.length - 1];
  if (tip) {
    ctx.fillStyle = "#a855f7";
    ctx.shadowColor = "#d946ef";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 6 + Math.sin(t * 6) * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  const mid = pts[Math.floor(pts.length / 2)];
  if (mid && v.hp < v.maxHp) bar(ctx, mid.x - 14, mid.y - 16, 28, 3, v.hp / v.maxHp, "#86efac");
}

export function drawStrike(ctx: CanvasRenderingContext2D, s: Strike, radius: number, t: number): void {
  const k = 1 - s.timer / 0.8;
  ctx.save();
  ctx.strokeStyle = "rgba(248,113,113,0.9)";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 6]);
  ctx.lineDashOffset = t * 40;
  ctx.beginPath();
  ctx.arc(s.pos.x, s.pos.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = `rgba(254,202,202,${0.3 + k * 0.7})`;
  ctx.lineWidth = 4 + k * 18;
  ctx.shadowColor = "#f87171";
  ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.moveTo(s.pos.x, 0);
  ctx.lineTo(s.pos.x, s.pos.y);
  ctx.stroke();
  ctx.restore();
}

export function drawText(ctx: CanvasRenderingContext2D, ft: FloatText): void {
  ctx.globalAlpha = Math.min(1, ft.life * 2);
  ctx.font = `700 ${ft.size}px Orbitron, Rajdhani, sans-serif`;
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(2,6,23,0.9)";
  ctx.strokeText(ft.text, ft.pos.x, ft.pos.y);
  ctx.fillStyle = ft.color;
  ctx.fillText(ft.text, ft.pos.x, ft.pos.y);
  ctx.globalAlpha = 1;
}
