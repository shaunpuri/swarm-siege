import type { Game, ParticleKind, Vec } from "@/types";
import { rand, randRange } from "@/game/rng";

// Purely visual particles and floating numbers. They live in game state so the
// renderer stays stateless, but nothing in gameplay reads them back.

const MAX_PARTICLES = 900;

export function emit(game: Game, kind: ParticleKind, pos: Vec, color: string, count: number, speed: number, size: number, life: number): void {
  for (let i = 0; i < count && game.particles.length < MAX_PARTICLES; i++) {
    const a = rand(game) * Math.PI * 2;
    const s = speed * (0.35 + rand(game) * 0.65);
    game.particles.push({
      kind,
      pos: { x: pos.x, y: pos.y },
      vel: { x: Math.cos(a) * s, y: Math.sin(a) * s },
      life: life * (0.6 + rand(game) * 0.4),
      maxLife: life,
      size: size * (0.6 + rand(game) * 0.6),
      color,
    });
  }
}

export function ring(game: Game, pos: Vec, color: string, size: number, life = 0.45): void {
  game.particles.push({ kind: "ring", pos: { ...pos }, vel: { x: 0, y: 0 }, life, maxLife: life, size, color });
}

export function explosion(game: Game, pos: Vec, color: string, radius: number): void {
  ring(game, pos, color, radius);
  emit(game, "spark", pos, color, Math.round(radius / 3), radius * 4, 3, 0.45);
  emit(game, "smoke", pos, "rgba(40,40,50,0.55)", Math.round(radius / 6), radius * 1.2, radius * 0.35, 0.9);
  emit(game, "debris", pos, "#fde68a", Math.round(radius / 8), radius * 3, 2, 0.35);
}

export function floatText(game: Game, pos: Vec, text: string, color: string, size = 14): void {
  game.texts.push({ pos: { x: pos.x + randRange(game, -6, 6), y: pos.y - 10 }, text, life: 1, color, size });
}

export function updateEffects(game: Game, dt: number): void {
  for (const p of game.particles) {
    p.life -= dt;
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    const drag = p.kind === "smoke" || p.kind === "poison" ? 0.9 : 0.86;
    p.vel.x *= Math.pow(drag, dt * 60);
    p.vel.y *= Math.pow(drag, dt * 60);
    if (p.kind === "flame" || p.kind === "smoke" || p.kind === "poison") p.vel.y -= 30 * dt;
  }
  game.particles = game.particles.filter((p) => p.life > 0);

  for (const t of game.texts) {
    t.life -= dt;
    t.pos.y -= 28 * dt;
  }
  game.texts = game.texts.filter((t) => t.life > 0);

  // a boss's fall plays for longer: it is the end of its world
  for (const d of game.deaths) d.life += dt / (d.boss ? 1.6 : 0.6);
  game.deaths = game.deaths.filter((d) => d.life < 1);

  for (const b of game.beams) b.life -= dt;
  game.beams = game.beams.filter((b) => b.life > 0);

  game.shake = Math.max(0, game.shake - dt * 18);
}
