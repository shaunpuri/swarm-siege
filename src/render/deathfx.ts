import type { Biome, Death } from "@/types";
import { glowDot, lit, rnd, spikes, thrown } from "@/render/paint";

// How enemies die in each world, from the sheets' death panels (the Cold World's ice explosion
// is drawn from its own frames in overlay.ts):
//   Forest  a burst of leaves and bark chips with a green flash
//   Desert  it crumbles into a cloud of sand with stones falling out
//   Aqua    an explosion of bubbles and water crystals
//   Cyber   sparks fly, a flash, and it shuts down in a puff of smoke

// a boss's fall, in its world's colour: a white flash, a pillar of light where it stood and two
// shockwaves rolling out across the ground
const BOSS_RGB: Record<Biome, string> = { grassland: "74,222,128", snow: "147,197,253", desert: "250,204,21", water: "34,211,238", cyber: "239,68,68" };

function drawBossFall(ctx: CanvasRenderingContext2D, biome: Biome, d: Death): void {
  const k = d.life;
  const fade = 1 - k;
  const rgb = BOSS_RGB[biome];
  lit(ctx, () => {
    glowDot(ctx, d.pos.x, d.pos.y - 40, 160 * (0.4 + k), "255,255,255", 0.7 * Math.max(0, 1 - k * 3));
    glowDot(ctx, d.pos.x, d.pos.y - 40, 120, rgb, 0.8 * fade);
    // the pillar of light
    const g = ctx.createLinearGradient(0, d.pos.y - 320, 0, d.pos.y);
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(1, `rgba(${rgb},${0.7 * fade})`);
    ctx.fillStyle = g;
    const w = 40 * (1 - k * 0.6);
    ctx.fillRect(d.pos.x - w / 2, d.pos.y - 320, w, 320);
  });
  for (const lag of [0, 0.18]) {
    const r = Math.max(0, k - lag) * 380;
    ctx.strokeStyle = `rgba(${rgb},${Math.max(0, 1 - k - lag)})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(d.pos.x, d.pos.y, r, r * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function drawDeathBurst(ctx: CanvasRenderingContext2D, biome: Biome, d: Death): void {
  if (d.boss) drawBossFall(ctx, biome, d);
  const k = d.life;
  const fade = 1 - k;
  const s = d.size;
  const seed = Math.round(d.pos.x * 7 + d.pos.y * 13);
  const at = { x: d.pos.x, y: d.pos.y - s * 0.2 };
  ctx.save();
  switch (biome) {
    case "grassland":
      lit(ctx, () => glowDot(ctx, at.x, at.y, s * 0.8, "74,222,128", 0.6 * fade));
      thrown(ctx, at, k, 8, s * 0.9, `rgba(120,80,40,${fade})`, 3, seed);
      for (let i = 0; i < 8; i++) {
        const a = rnd(seed, i + 30) * Math.PI * 2;
        const r = s * 0.9 * k;
        ctx.fillStyle = `rgba(74,222,128,${fade})`;
        ctx.beginPath();
        ctx.ellipse(at.x + Math.cos(a) * r, at.y + Math.sin(a) * r * 0.6 - Math.sin(Math.PI * k) * s * 0.4, 4, 2, a + k * 8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "desert":
      for (let i = 0; i < 6; i++) {
        const a = rnd(seed, i) * Math.PI * 2;
        ctx.fillStyle = `rgba(214,170,110,${0.5 * fade})`;
        ctx.beginPath();
        ctx.arc(at.x + Math.cos(a) * s * 0.3 * k, at.y + Math.sin(a) * s * 0.15 * k - k * s * 0.3, s * (0.25 + k * 0.35), 0, Math.PI * 2);
        ctx.fill();
      }
      thrown(ctx, at, k, 8, s * 0.7, `rgba(120,80,40,${fade})`, 3.5, seed + 1);
      break;
    case "water":
      spikes(ctx, { x: d.pos.x, y: d.pos.y }, 4 + k * s * 0.2, 7, s * 0.5 * Math.min(1, k * 4), `rgba(103,232,249,${0.85 * fade})`, seed);
      lit(ctx, () => glowDot(ctx, at.x, at.y, s * 0.8, "34,211,238", 0.6 * fade));
      ctx.strokeStyle = `rgba(224,250,255,${fade})`;
      ctx.lineWidth = 1.3;
      for (let i = 0; i < 12; i++) {
        const a = rnd(seed, i + 50) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(at.x + Math.cos(a) * s * 0.5 * k, at.y + Math.sin(a) * s * 0.3 * k - k * s * 0.6 * rnd(seed, i + 60), 1.5 + rnd(seed, i + 70) * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case "cyber":
      lit(ctx, () => {
        glowDot(ctx, at.x, at.y, s * (k < 0.2 ? 1 : 0.5), "125,211,252", (k < 0.2 ? 0.9 : 0.4) * fade);
        ctx.strokeStyle = `rgba(186,230,253,${fade})`;
        ctx.lineWidth = 1.6;
        for (let i = 0; i < 9; i++) {
          const a = rnd(seed, i) * Math.PI * 2;
          const r0 = s * 0.2 + k * s * 0.5;
          ctx.beginPath();
          ctx.moveTo(at.x + Math.cos(a) * r0, at.y + Math.sin(a) * r0 * 0.7);
          ctx.lineTo(at.x + Math.cos(a) * (r0 + 10), at.y + Math.sin(a) * (r0 + 10) * 0.7);
          ctx.stroke();
        }
      });
      ctx.fillStyle = `rgba(71,85,105,${0.22 * fade})`;
      ctx.beginPath();
      ctx.arc(at.x, at.y - k * s * 0.6, s * 0.12 + k * s * 0.18, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "snow":
      break;
  }
  ctx.restore();
}
