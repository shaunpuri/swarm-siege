import * as THREE from "three";
import type { EnemyKind } from "@/types";

// A procedural skeleton for the enemy paintings, so they walk like animated game troops
// instead of sliding cut-outs. Each enemy sprite is a grid mesh (not a single quad), and the
// vertex shader bends regions of the picture like bones, the way 2D cut-out rigs work:
//   front / back view: the left and right legs lift in turn, the knee tucks in as it lifts,
//   the hips sway over the planted foot, the arms swing against the legs, the head bobs
//   side view: legs swing through like a pendulum (four legged creatures scissor their front
//   and back pairs), the arm swings against the stride, the head pushes forward each step,
//   tails sway
//   swimming, side view: a wave runs from head to tail and grows toward the tail, fins and
//   tentacles trail; front / back view: the body breathes and tentacles ripple
//   flying: the wings (the outer upper parts of the picture) beat up and down, the tips
//   lagging behind the shoulders
//   attacking: the upper body rears up and strikes toward the turret
// The art is never redrawn: the texture simply moves with the bent mesh.

export type RigMode = "none" | "walkFront" | "walkSide" | "swimSide" | "swimFront" | "flap";
const MODE: Record<RigMode, number> = { none: 0, walkFront: 1, walkSide: 2, swimSide: 3, swimFront: 4, flap: 5 };

// legTop: height (0 = feet, 1 = top of the picture) where the legs join the body;
// leg / arm: swing sizes as a fraction of the sprite (for swimmers: body wave / tentacles)
export type Bones = { quad: boolean; legTop: number; leg: number; arm: number };

export type RigSet = "alien" | "grassland" | "snow" | "water" | "desert" | "cyber";

export const BONES: Record<RigSet, Record<EnemyKind, Bones>> = {
  // the alien swarm only has a front render: many legged bugs that skitter
  alien: {
    scout: { quad: false, legTop: 0.45, leg: 0.07, arm: 0.05 },
    brute: { quad: false, legTop: 0.35, leg: 0.05, arm: 0.04 },
    overlord: { quad: false, legTop: 0.45, leg: 0.05, arm: 0.05 },
    titan: { quad: false, legTop: 0.4, leg: 0.035, arm: 0.03 },
  },
  // thornfang spider (eight legs scuttle in alternating pairs), nightwing harrier (arm = wing
  // beat), night anaconda (leg = body wave), elderwood colossus (huge slow strides)
  grassland: {
    scout: { quad: true, legTop: 0.55, leg: 0.06, arm: 0.02 },
    brute: { quad: false, legTop: 0.25, leg: 0, arm: 0.15 },
    overlord: { quad: false, legTop: 0.5, leg: 0.05, arm: 0.01 },
    titan: { quad: false, legTop: 0.4, leg: 0.05, arm: 0.06 },
  },
  snow: {
    // the Snowman has no legs: it hops (the gait) and swings its stick arms
    scout: { quad: false, legTop: 0.3, leg: 0, arm: 0.05 },
    brute: { quad: false, legTop: 0.38, leg: 0.06, arm: 0.06 },
    overlord: { quad: false, legTop: 0.35, leg: 0.05, arm: 0.05 },
    titan: { quad: true, legTop: 0.4, leg: 0.05, arm: 0.04 },
  },
  // shark, octopus, electric eel, Damyaan: leg = body wave, arm = fins / tentacles
  water: {
    scout: { quad: false, legTop: 0.4, leg: 0.035, arm: 0.012 },
    brute: { quad: false, legTop: 0.45, leg: 0.02, arm: 0.05 },
    overlord: { quad: false, legTop: 0.4, leg: 0.06, arm: 0.01 },
    titan: { quad: false, legTop: 0.4, leg: 0.03, arm: 0.03 },
  },
  // chameleon, scorpion king, sandman, mummy king (who shambles with long arm swings)
  desert: {
    scout: { quad: true, legTop: 0.45, leg: 0.07, arm: 0.03 },
    brute: { quad: true, legTop: 0.5, leg: 0.06, arm: 0.04 },
    overlord: { quad: false, legTop: 0.4, leg: 0.05, arm: 0.05 },
    titan: { quad: false, legTop: 0.42, leg: 0.05, arm: 0.07 },
  },
  // cyber stalker (four bladed legs scuttle), siege breaker (tracks: only a heavy rumble),
  // phase wraith (hovers, no legs), transformer overlord robot (heavy stomping stride)
  cyber: {
    scout: { quad: true, legTop: 0.5, leg: 0.06, arm: 0.03 },
    brute: { quad: false, legTop: 0.3, leg: 0.008, arm: 0.01 },
    overlord: { quad: false, legTop: 0.3, leg: 0, arm: 0.03 },
    titan: { quad: false, legTop: 0.45, leg: 0.045, arm: 0.06 },
  },
};

export type RigUniforms = { uRigA: THREE.IUniform<THREE.Vector4>; uRigB: THREE.IUniform<THREE.Vector4> };

export function rigUniforms(): RigUniforms {
  return { uRigA: { value: new THREE.Vector4() }, uRigB: { value: new THREE.Vector4(1, 0.4, 0, 0) } };
}

// mode, phase (radians), facing (+1 right / -1 left on screen), attack strike 0..1
export function poseRig(u: RigUniforms, mode: RigMode, bones: Bones, phase: number, facing: number, attack: number): void {
  u.uRigA.value.set(MODE[mode], phase, bones.leg, bones.arm);
  u.uRigB.value.set(facing, bones.legTop, bones.quad ? 1 : 0, attack);
}

// one shared grid: fine enough for legs and arms to bend smoothly
export function rigGeometry(): THREE.PlaneGeometry {
  return new THREE.PlaneGeometry(1, 1, 10, 16);
}

export const RIG_VERTEX = /* glsl */ `
uniform vec4 uRigA;
uniform vec4 uRigB;
vec2 rigOffset( vec2 q ) {
  float mode = uRigA.x;
  if ( mode < 0.5 ) return vec2( 0.0 );
  float ph = uRigA.y;
  float legA = uRigA.z;
  float armA = uRigA.w;
  float face = uRigB.x;
  float legTop = uRigB.y;
  float quad = uRigB.z;
  float atk = uRigB.w;
  float u = q.x;
  float v = q.y;
  float s = sin( ph );
  float c = cos( ph );
  vec2 d = vec2( 0.0 );
  float legW = smoothstep( legTop, 0.0, v );
  float bodyW = smoothstep( legTop * 0.7, legTop + 0.2, v );
  float headW = smoothstep( 0.72, 1.0, v );
  float armBand = smoothstep( legTop * 0.85, legTop + 0.15, v ) * smoothstep( 0.88, 0.6, v );
  // toward the head in side views
  float fwd = ( u - 0.5 ) * face;
  if ( mode < 1.5 ) {
    float left = smoothstep( 0.56, 0.44, u );
    float right = 1.0 - left;
    float liftL = max( 0.0, s );
    float liftR = max( 0.0, -s );
    d.y += ( left * liftL + right * liftR ) * legA * legW;
    d.x += ( left * liftL - right * liftR ) * legA * 0.35 * legW;
    d.x += s * legA * 0.25 * bodyW;
    float side = smoothstep( 0.3, 0.02, min( u, 1.0 - u ) );
    d.y += side * armBand * armA * ( right * s - left * s ) * ( 1.4 - v );
    d.y += headW * abs( c ) * legA * 0.15;
  } else if ( mode < 2.5 ) {
    if ( quad > 0.5 ) {
      float fore = smoothstep( -0.04, 0.06, fwd );
      float swing = mix( -s, s, fore );
      d.x += swing * legA * 1.4 * legW * face;
      d.y += max( 0.0, swing ) * legA * 0.6 * legW;
      float tail = smoothstep( 0.15, 0.48, -fwd ) * smoothstep( legTop * 0.5, legTop + 0.1, v );
      d.y += tail * sin( ph * 0.5 + u * 4.0 ) * armA;
    } else {
      d.x += s * legA * 1.6 * legW * face;
      d.y += ( 1.0 - abs( s ) ) * legA * 0.35 * legW;
      float centre = smoothstep( 0.4, 0.0, abs( fwd ) );
      d.x -= s * armA * armBand * centre * face * ( 1.2 - v );
    }
    d.y += headW * abs( c ) * legA * 0.15;
    d.x += headW * c * legA * 0.15 * face;
  } else if ( mode < 3.5 ) {
    float tail = smoothstep( 0.35, -0.5, fwd );
    d.y += sin( fwd * 7.0 + ph * 4.0 ) * legA * ( 0.25 + tail );
    float under = smoothstep( 0.4, 0.0, v );
    d.x += sin( v * 14.0 - ph * 5.0 + u * 5.0 ) * armA * under;
  } else if ( mode < 4.5 ) {
    float under = smoothstep( 0.45, 0.0, v );
    d.x += sin( v * 14.0 - ph * 5.0 + u * 6.0 ) * armA * under;
    d.x += ( u - 0.5 ) * sin( ph * 2.0 ) * legA;
    d.y += sin( u * 6.28 + ph * 3.0 ) * legA * 0.4 * under;
  } else {
    // wings: the further from the body, the bigger the beat, tips lagging the shoulders
    float wing = smoothstep( 0.12, 0.5, abs( u - 0.5 ) );
    float high = smoothstep( 0.2, 0.55, v );
    float beat = sin( ph - wing * 1.2 );
    d.y += beat * armA * wing * high * 1.6;
    d.x += beat * armA * 0.25 * wing * high * sign( u - 0.5 );
    d.y -= cos( ph ) * legA * 0.02;
  }
  d.y += atk * smoothstep( 0.4, 0.9, v ) * 0.05;
  d.x += atk * smoothstep( 0.3, 0.9, v ) * 0.06 * face;
  return d;
}
`;
