import type { Enemy, EnemyKind } from "@/types";
import type { EnemySkin } from "@/three/skins";
import { strikeCycle } from "@/game/melee";

// How each enemy moves on screen. The sheets give every creature as one painting, so motion
// comes from moving the whole sprite plus the bone rig (src/three/rig.ts), the way cut-out
// puppets are animated. Timing follows the feel of Clash of Clans / Clash Royale troops:
// snappy cycles, strong squash as weight lands and stretch as it leaves, heavy units that
// stomp and light ones that skitter. Each creature gets the locomotion it really has:
//   walk    two legs: lift each stride, squash on landing, weight shift, lean into travel
//   stomp   heavy biped / giant: slow stride, deep squash and a hard landing pause
//   scuttle spiders, scorpions, lizards: fast alternating leg pairs, body low and level, a
//           nervous jitter
//   hop     the Snowman: no legs, so it bounces, stretching in the air, squashing on landing
//   shamble the Mummy King: a lurching limp, one long step and one dragged, leaning forward
//   slither the Night Anaconda: no bob at all, a sideways wave travels from head to tail
//   fly     the Nightwing Harrier: holds height, rises on each wing downstroke, banks on turns
//   hover   the Phase Wraith and the Sandman: drift above the ground with a slow sway
//   roll    the Siege Breaker on tracks: no steps, only an engine rumble
//   swim    the Aqua Realm: buoyant bobbing with a stroke per creature
//   attacking a turret: the enemy rears back and lunges at it.

// lift: screen pixels above the ground; rot: sprite roll in radians (positive turns
// counter-clockwise); sx/sy: scale; dx/dy: offset in logical (ground) pixels
export type Pose = { lift: number; rot: number; sx: number; sy: number; dx: number; dy: number };

export type Style = "walk" | "stomp" | "scuttle" | "hop" | "shamble" | "slither" | "fly" | "hover" | "roll" | "swim";

// stride: step cycles per unit of distance walked; hop/squash/roll/lean scale the motion
export type Gait = { style: Style; stride: number; hop: number; squash: number; roll: number; lean: number };

const g = (style: Style, stride: number, hop: number, squash: number, roll: number, lean: number): Gait => ({ style, stride, hop, squash, roll, lean });

// the original alien swarm (legacy level maps and painting modes keep these)
export const ALIEN_GAITS: Record<EnemyKind, Gait> = {
  scout: g("scuttle", 6, 0.03, 0.05, 0.04, 0.12),
  brute: g("stomp", 2.4, 0.05, 0.12, 0.06, 0.06),
  overlord: g("walk", 2, 0.04, 0.06, 0.04, 0.08),
  titan: g("stomp", 1.1, 0.03, 0.08, 0.03, 0.03),
};

const GAITS: Record<EnemySkin, Record<EnemyKind, Gait>> = {
  grassland: {
    scout: g("scuttle", 6.5, 0.02, 0.05, 0.03, 0.1),
    brute: g("fly", 1, 0.22, 0.06, 0.14, 0.18),
    overlord: g("slither", 1.6, 0, 0.03, 0, 0),
    titan: g("stomp", 0.9, 0.03, 0.1, 0.04, 0.03),
  },
  snow: {
    scout: g("hop", 2.2, 0.2, 0.18, 0.05, 0.06),
    brute: g("stomp", 2.2, 0.05, 0.13, 0.08, 0.1),
    overlord: g("stomp", 1.6, 0.03, 0.1, 0.04, 0.04),
    // the Ice Dragon flies
    titan: g("fly", 1, 0.05, 0.03, 0.05, 0.06),
  },
  desert: {
    scout: g("scuttle", 5.5, 0.015, 0.04, 0.07, 0.08),
    brute: g("scuttle", 3.8, 0.02, 0.06, 0.04, 0.06),
    overlord: g("hover", 1, 0.06, 0.03, 0.05, 0.06),
    titan: g("shamble", 1.3, 0.04, 0.07, 0.1, 0.12),
  },
  water: {
    scout: g("swim", 1, 0, 0, 0, 0),
    brute: g("swim", 1, 0, 0, 0, 0),
    overlord: g("swim", 1, 0, 0, 0, 0),
    titan: g("swim", 1, 0, 0, 0, 0),
  },
  cyber: {
    scout: g("scuttle", 6, 0.02, 0.05, 0.03, 0.12),
    brute: g("roll", 3, 0, 0.02, 0.01, 0.04),
    overlord: g("hover", 1, 0.05, 0.03, 0.04, 0.05),
    titan: g("stomp", 1.4, 0.04, 0.11, 0.05, 0.05),
  },
};

export function gaitFor(skin: EnemySkin | null, kind: EnemyKind): Gait {
  return skin ? GAITS[skin][kind] : ALIEN_GAITS[kind];
}

// the attack animation, in step with the strikes the simulation lands: lean back slowly to
// wind up, then lunge forward fast, landing 90% of the way through each strike; negative
// values lean away from the turret
export function strike(e: Enemy): number {
  if (e.attacking === null) return 0;
  const k = strikeCycle(e);
  const windup = k < 0.8 ? k / 0.8 : 1 - (k - 0.8) / 0.2;
  const thrust = k >= 0.8 ? Math.sin(((k - 0.8) / 0.2) * Math.PI) : 0;
  return thrust - 0.3 * windup;
}

// where the enemy is in its step cycle (radians); the rig and the gait share it
export function stridePhase(e: Enemy, gait: Gait): number {
  return e.walk * gait.stride;
}

function lunge(e: Enemy, height: number, base = 0): Pose {
  const hit = strike(e);
  const reach = height * 0.25 * hit;
  return { lift: base + hit * height * 0.04, rot: -Math.cos(e.angle) * 0.12 * hit, sx: 1 + hit * 0.05, sy: 1 - hit * 0.05, dx: Math.cos(e.angle) * reach, dy: Math.sin(e.angle) * reach };
}

// how high flyers and hoverers keep above the road, as a share of their height
// the owl flies well above the road, clearly in the air
export const FLY_HEIGHT = 1.7;
export const HOVER_HEIGHT = 0.3;

function legged(e: Enemy, gait: Gait, height: number): Pose {
  const phase = stridePhase(e, gait);
  const lean = -Math.cos(e.angle) * gait.lean;
  // 0 when a foot is planted, 1 mid-stride
  const step = Math.abs(Math.sin(phase));
  if (gait.style === "scuttle") {
    // legs alternate fast; the body barely rises and twitches side to side
    const jitter = Math.sin(phase * 2) * gait.roll;
    return { lift: step * gait.hop * height, rot: jitter + lean, sx: 1 + Math.sin(phase * 2) * 0.015, sy: 1 - Math.sin(phase * 2) * 0.015, dx: 0, dy: 0 };
  }
  if (gait.style === "hop") {
    // a bounce per cycle: high in the air, stretched; squashed flat on landing
    const air = Math.abs(Math.sin(phase)) ** 0.7;
    const land = (1 - Math.abs(Math.sin(phase))) ** 6;
    return { lift: air * gait.hop * height, rot: Math.sin(phase * 0.5) * gait.roll + lean, sx: 1 + gait.squash * land - air * 0.05, sy: 1 - gait.squash * land + air * 0.08, dx: 0, dy: 0 };
  }
  if (gait.style === "shamble") {
    // one strong step and one dragged one: the body lurches onto the good leg and sags
    const good = Math.max(0, Math.sin(phase));
    const drag = Math.max(0, -Math.sin(phase));
    const land = (1 - good) ** 3 * (drag > 0 ? 0.4 : 1);
    return { lift: good * gait.hop * height, rot: good * gait.roll - drag * gait.roll * 0.4 + lean * 1.3, sx: 1 + gait.squash * land * 0.6, sy: 1 - gait.squash * land, dx: 0, dy: 0 };
  }
  // walk and stomp: the stomp holds a hard, deep landing before the next lift
  const heavy = gait.style === "stomp";
  const land = (1 - step) ** (heavy ? 8 : 4);
  const rise = heavy ? step ** 1.6 : step;
  return {
    lift: rise * gait.hop * height,
    rot: Math.sin(phase) * gait.roll + lean,
    sx: 1 + gait.squash * land * 0.8,
    sy: 1 - gait.squash * land + gait.squash * 0.4 * step,
    dx: 0,
    dy: 0,
  };
}

function airborne(e: Enemy, gait: Gait, t: number, height: number): Pose {
  const flying = gait.style === "fly";
  // the harrier rises on every downstroke of its wings; hoverers drift on a slow sway
  const beat = t * (flying ? 3.2 : 1.1) + e.id;
  const up = flying ? Math.max(0, Math.sin(beat)) ** 1.5 : (Math.sin(beat) + 1) / 2;
  // giants fly lower relative to their size, or the dragon would leave the screen
  const base = Math.min(height * (flying ? FLY_HEIGHT : HOVER_HEIGHT), 70);
  const bank = -Math.cos(e.angle) * gait.lean;
  return { lift: base + up * gait.hop * height, rot: bank + Math.sin(beat * 0.5) * gait.roll * 0.5, sx: 1, sy: 1 + (flying ? -up * gait.squash : 0), dx: 0, dy: flying ? 0 : Math.sin(t * 0.7 + e.id) * 4 };
}

export function walkPose(e: Enemy, gait: Gait, t: number, height: number): Pose {
  const airborneStyle = gait.style === "fly" || gait.style === "hover";
  // flyers swoop down onto what they attack, hoverers stay up
  if (e.attacking !== null) {
    const air = airborneStyle ? Math.min(height * (gait.style === "fly" ? FLY_HEIGHT : HOVER_HEIGHT), 70) : 0;
    const dive = gait.style === "fly" ? 1 - 0.75 * Math.max(0, strike(e)) : 1;
    return lunge(e, height, air * dive);
  }
  if (airborneStyle) return airborne(e, gait, t, height);
  if (gait.style === "slither") return { lift: 0, rot: 0, sx: 1 + Math.sin(stridePhase(e, gait) * 2) * 0.02, sy: 1, dx: 0, dy: 0 };
  if (gait.style === "roll") return { lift: Math.abs(Math.sin(t * 30 + e.id)) * height * 0.006, rot: Math.sin(t * 23 + e.id) * gait.roll - Math.cos(e.angle) * gait.lean, sx: 1, sy: 1, dx: 0, dy: 0 };
  return legged(e, gait, height);
}

// how high swimmers float above the road, as a fraction of their height
const FLOAT = 0.35;

export function swimPose(e: Enemy, t: number, height: number, facingRight: boolean): Pose {
  if (e.attacking !== null) return lunge(e, height, height * FLOAT);
  const a = t * 1.1 + e.id * 1.7;
  const b = t * 0.53 + e.id * 0.9;
  const calm = e.kind === "titan" ? 0.5 : 1;
  const bob = (Math.sin(a) * 0.06 + Math.sin(b) * 0.05) * height * calm;
  // rising (positive vertical speed) tips the nose up
  const rise = Math.cos(a) * 1.1 * 0.06 + Math.cos(b) * 0.53 * 0.05;
  const across = Math.abs(Math.cos(e.angle));
  let rot = rise * 2.4 * calm * across * (facingRight ? 1 : -1);
  let sx = 1;
  let sy = 1;
  let lift = height * FLOAT + bob;
  let dy = 0;
  if (e.kind === "scout") {
    // shark: the tail sweeps, the body flexes slightly with each stroke
    sx = 1 + Math.sin(t * 4 + e.id) * 0.03;
  } else if (e.kind === "brute") {
    // octopus: contracts, then jets upward and drifts back down
    const jet = Math.max(0, Math.sin(t * 2.2 + e.id)) ** 2;
    sy = 1 + jet * 0.12;
    sx = 1 - jet * 0.08;
    lift += jet * height * 0.08;
  } else if (e.kind === "overlord") {
    // eel: a ripple runs along the body and it weaves side to side
    rot += Math.sin(t * 5 + e.id) * 0.06;
    dy = Math.sin(t * 1.7 + e.id) * 6;
  } else {
    // Damyaan: a slow, heavy glide with a gentle breathing swell
    sx = 1 + Math.sin(t * 0.9 + e.id) * 0.015;
    sy = 1 + Math.sin(t * 0.9 + e.id + 1) * 0.015;
  }
  return { lift, rot, sx, sy, dx: 0, dy };
}
