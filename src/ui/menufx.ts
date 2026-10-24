import type { Biome } from "@/types";
import { createWeather, drawWeather, updateWeather } from "@/render/weather";
import { createSea, drawSea, updateSea } from "@/render/underwater";
import { makeRng } from "@/game/rng";

// Living backdrops for the campaign screens, matching each world: snow blowing across the Cold
// World, sand streams and dust devils over the Desert, neon rain in the Cyber Arena, bubbles,
// fish and jellyfish in the Aqua Realm (the same effects as in the levels), and for the
// Grassland drifting leaves and fireflies. Runs on its own canvas until that canvas leaves
// the page.

type Mote = { x: number; y: number; vx: number; vy: number; spin: number; size: number; glow: boolean; phase: number };

const W = 1280;
const H = 720;

function grassland(seed: number): { update: (dt: number) => void; draw: (ctx: CanvasRenderingContext2D) => void } {
  const rng = makeRng(seed);
  const motes: Mote[] = Array.from({ length: 70 }, (_, i) => ({
    x: rng() * W,
    y: rng() * H,
    vx: 12 + rng() * 22,
    vy: 6 + rng() * 14,
    spin: rng() * 6,
    size: 3 + rng() * 4,
    glow: i % 3 === 0,
    phase: rng() * 6,
  }));
  let t = 0;
  return {
    update: (dt) => {
      t += dt;
      for (const m of motes) {
        if (m.glow) {
          // fireflies wander and pulse
          m.x += Math.sin(t * 0.7 + m.phase) * 14 * dt;
          m.y += Math.cos(t * 0.9 + m.phase) * 10 * dt;
        } else {
          // leaves drift down and across, rocking as they fall
          m.x += (m.vx + Math.sin(t + m.phase) * 18) * dt;
          m.y += m.vy * dt;
          m.spin += dt * 2;
        }
        if (m.x > W + 20) m.x = -20;
        if (m.y > H + 20) m.y = -20;
      }
    },
    draw: (ctx) => {
      for (const m of motes) {
        if (m.glow) {
          const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.4 + m.phase));
          const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 10);
          g.addColorStop(0, `rgba(254,240,138,${a})`);
          g.addColorStop(1, "rgba(254,240,138,0)");
          ctx.fillStyle = g;
          ctx.fillRect(m.x - 10, m.y - 10, 20, 20);
        } else {
          ctx.save();
          ctx.translate(m.x, m.y);
          ctx.rotate(Math.sin(m.spin) * 1.2);
          ctx.fillStyle = "rgba(134,239,172,0.8)";
          ctx.beginPath();
          ctx.ellipse(0, 0, m.size * 1.6, m.size * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    },
  };
}

function effectFor(biome: Biome, seed: number): { update: (dt: number) => void; draw: (ctx: CanvasRenderingContext2D) => void } {
  if (biome === "water") {
    const sea = createSea(seed);
    return { update: (dt) => updateSea(sea, dt), draw: (ctx) => drawSea(ctx, sea) };
  }
  const weather = createWeather(biome, seed);
  if (weather) return { update: (dt) => updateWeather(weather, dt), draw: (ctx) => drawWeather(ctx, weather) };
  return grassland(seed);
}

// starts the effect on a 1280x720 canvas; it stops itself once the canvas is removed
export function startMenuFx(canvas: HTMLCanvasElement, biome: Biome): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = W;
  canvas.height = H;
  const fx = effectFor(biome, 7);
  let last = performance.now();
  const tick = (now: number): void => {
    if (!canvas.isConnected) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fx.update(dt);
    ctx.clearRect(0, 0, W, H);
    fx.draw(ctx);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
