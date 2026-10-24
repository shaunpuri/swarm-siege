import * as THREE from "three";
import type { EnemyKind } from "@/types";
import type { EnemySkin } from "@/three/skins";

// Animal motion for the 3D enemy models. The models from Tripo are single solid meshes with no
// skeleton, so the vertex shader bends them the way each animal moves, measuring every vertex
// against the model's own bounds (front is -x, so "along the body" runs from the head at -x to
// the tail at +x; "across" is z; "up" is y):
//   slither  a sideways wave travels from the head down the body, growing toward the tail
//   fly      the wings (far out to the sides, upper body) beat, tips trailing the shoulders
//   scurry   diagonal leg pairs step in turn, low and quick (spiders, lizards, scorpions)
//   walk     legs swing forward and back on alternate sides, arms against them, head bobs
//   limp     a walk where one leg drags (the Mummy King)
//   swim     the tail half sweeps side to side, the head stays steady (sharks, eels)
//   pulse    the lower body (tentacles) ripples and the mantle swells (the octopus)
//   still    no bending (tracks, hovering spirits)
// Attacking a turret or the base (strike 0..1 in uMotion.w), each attacks its own way: snakes
// and fish lunge their head forward to bite, walkers swing their arms forward in a claw swipe,
// scurriers rear up on their front legs (and a scorpion's tail stabs forward), flyers flare
// their wings as they dive, the octopus whips its tentacles forward.

export type Motion = "still" | "slither" | "fly" | "scurry" | "walk" | "limp" | "swim" | "pulse";
const CODE: Record<Motion, number> = { still: 0, slither: 1, fly: 2, scurry: 3, walk: 4, limp: 5, swim: 6, pulse: 7 };

const M = (motion: Motion, amp: number): { motion: Motion; amp: number } => ({ motion, amp });

// each creature's motion and how strongly it bends (a share of the model's size)
const MOTIONS: Record<EnemySkin, Record<EnemyKind, { motion: Motion; amp: number }>> = {
  grassland: { scout: M("scurry", 0.07), brute: M("fly", 0.22), overlord: M("slither", 0.09), titan: M("walk", 0.06) },
  snow: { scout: M("still", 0), brute: M("walk", 0.08), overlord: M("walk", 0.06), titan: M("fly", 0.16) },
  desert: { scout: M("scurry", 0.06), brute: M("scurry", 0.05), overlord: M("walk", 0.05), titan: M("limp", 0.07) },
  water: { scout: M("swim", 0.1), brute: M("pulse", 0.07), overlord: M("slither", 0.1), titan: M("slither", 0.06) },
  cyber: { scout: M("scurry", 0.06), brute: M("still", 0), overlord: M("still", 0), titan: M("walk", 0.05) },
};

export function motionFor(skin: EnemySkin, kind: EnemyKind): { motion: Motion; amp: number } {
  return MOTIONS[skin][kind];
}

export type MotionUniforms = { uMotion: THREE.IUniform<THREE.Vector4>; uMin: THREE.IUniform<THREE.Vector3>; uSize: THREE.IUniform<THREE.Vector3>; uRimColor: THREE.IUniform<THREE.Color> };

const BEND = /* glsl */ `
uniform vec4 uMotion;
uniform vec3 uMin;
uniform vec3 uSize;
vec3 animalBend( vec3 p ) {
  float mode = uMotion.x;
  float ph = uMotion.y;
  float amp = uMotion.z;
  float hit = uMotion.w;
  if ( mode < 0.5 ) return p;
  // 0 at the head (-x) to 1 at the tail; 0 at the feet to 1 at the top; -1..1 across
  float along = clamp( ( p.x - uMin.x ) / uSize.x, 0.0, 1.0 );
  float up = clamp( ( p.y - uMin.y ) / uSize.y, 0.0, 1.0 );
  float across = clamp( ( p.z - uMin.z ) / uSize.z * 2.0 - 1.0, -1.0, 1.0 );
  float side = sign( across );
  float big = max( uSize.x, max( uSize.y, uSize.z ) );
  vec3 d = vec3( 0.0 );
  if ( mode < 1.5 ) {
    // slither: the wave runs head to tail
    d.z = sin( along * 9.0 - ph * 2.0 ) * amp * big * ( 0.25 + along ) * ( 1.0 - hit * 0.7 );
    d.y = max( 0.0, 0.3 - along ) * amp * big * 0.6;
    // bite: the head darts forward and rises
    float head = pow( 1.0 - along, 3.0 );
    d.x -= hit * head * big * 0.35;
    d.y += hit * head * big * 0.12;
  } else if ( mode < 2.5 ) {
    // fly: wings beat, the tips trailing
    float wing = smoothstep( 0.2, 0.75, abs( across ) ) * smoothstep( 0.25, 0.6, up );
    d.y = sin( ph - abs( across ) * 1.3 ) * amp * big * wing * 1.4;
    d.z = -cos( ph ) * amp * big * wing * 0.25 * side;
    d.x = sin( ph * 0.5 + along * 4.0 ) * amp * big * 0.15 * along;
    // dive: the wings flare up and back, the talons reach forward
    d.y += hit * wing * big * 0.25;
    d.x -= hit * ( 1.0 - smoothstep( 0.0, 0.4, up ) ) * big * 0.2;
  } else if ( mode < 3.5 ) {
    // scurry: diagonal pairs (front left with back right) step together
    float leg = 1.0 - smoothstep( 0.0, 0.4, up );
    float pair = side * ( along < 0.5 ? 1.0 : -1.0 );
    float s = sin( ph * 1.6 + pair * 1.5708 );
    d.x = s * amp * big * leg;
    d.y = max( 0.0, s ) * amp * big * leg * 0.6;
    // rear up: the front half lifts, a tail curled over the back stabs forward
    float front = 1.0 - smoothstep( 0.2, 0.6, along );
    d.y += hit * front * big * 0.18;
    float tailTip = smoothstep( 0.55, 0.9, along ) * smoothstep( 0.45, 0.8, up );
    d.x -= hit * tailTip * big * 0.4;
  } else if ( mode < 5.5 ) {
    // walk (and limp, where the left leg drags): legs swing by side, arms against them
    float leg = 1.0 - smoothstep( 0.0, 0.42, up );
    float arm = smoothstep( 0.45, 0.6, up ) * smoothstep( 0.9, 0.75, up ) * smoothstep( 0.35, 0.7, abs( across ) );
    float drag = mode > 4.5 && side < 0.0 ? 0.35 : 1.0;
    float s = sin( ph + side * 1.5708 );
    d.x = s * amp * big * leg * drag - s * amp * big * arm * 0.8;
    d.y = max( 0.0, s ) * amp * big * leg * 0.4 * drag + abs( cos( ph ) ) * amp * big * 0.08 * up;
    // claw swipe: arms swing forward and up, the upper body leans in
    d.x -= hit * ( arm * big * 0.3 + up * big * 0.06 );
    d.y += hit * arm * big * 0.12;
  } else if ( mode < 6.5 ) {
    // swim: the tail half sweeps, the head holds steady
    float tail = smoothstep( 0.35, 1.0, along );
    d.z = sin( ph * 1.4 - along * 3.0 ) * amp * big * tail * tail;
    // bite: the head lunges, the jaw end leading
    d.x -= hit * pow( 1.0 - along, 2.0 ) * big * 0.25;
  } else {
    // pulse: tentacles ripple, the mantle swells and shrinks
    float low = 1.0 - smoothstep( 0.0, 0.45, up );
    d.x = sin( ph * 1.5 + atan( p.z - uMin.z - uSize.z * 0.5, p.x - uMin.x - uSize.x * 0.5 ) * 3.0 ) * amp * big * low;
    d.y = sin( ph * 0.8 ) * amp * big * 0.3 * up;
    // whip: the tentacles lash forward
    d.x -= hit * low * big * 0.35;
  }
  return p + d;
}
`;

// A rim of light around the model in its world's colour (brightest where the surface turns away
// from the camera), the way Supercell's units stand out against busy maps.
const RIM = /* glsl */ `
uniform vec3 uRimColor;
`;

// A soft dark edge hugging the model's silhouette: a copy of each mesh drawn inside out, its
// surface pushed out a little along the normals, half transparent. Only the sliver outside the
// model shows, so the model's boundary is dimmed and it reads clearly against the map.
const EDGE_THICKNESS = 0.03;
const EDGE_OPACITY = 0.72;

function addEdge(mesh: THREE.Mesh, u: MotionUniforms, bend: boolean, thick: number): void {
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: EDGE_OPACITY, depthWrite: false });
  mat.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, u, { uEdge: { value: thick } });
    const push = "#include <begin_vertex>\ntransformed += normalize( normal ) * uEdge;";
    shader.vertexShader = shader.vertexShader.replace("void main() {", `${bend ? BEND : ""}\nuniform float uEdge;\nvoid main() {`).replace("#include <begin_vertex>", bend ? `${push}\ntransformed = animalBend( transformed );` : push);
  };
  mat.customProgramCacheKey = () => (bend ? "model-edge-bend" : "model-edge");
  const edge = new THREE.Mesh(mesh.geometry, mat);
  edge.renderOrder = -1;
  mesh.add(edge);
}

// gives a placed model's materials the world-coloured rim and, for creatures, the bend
// (measured against its geometry's bounds); returns the uniforms to drive it each frame
export function addMotion(obj: THREE.Object3D, motion: Motion, amp: number, rim: THREE.Color): MotionUniforms {
  const box = new THREE.Box3();
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.computeBoundingBox();
    if (o.geometry.boundingBox) box.union(o.geometry.boundingBox);
  });
  const size = box.getSize(new THREE.Vector3());
  const u: MotionUniforms = {
    uMotion: { value: new THREE.Vector4(CODE[motion], 0, amp, 0) },
    uMin: { value: box.min.clone() },
    uSize: { value: new THREE.Vector3(Math.max(size.x, 1e-4), Math.max(size.y, 1e-4), Math.max(size.z, 1e-4)) },
    uRimColor: { value: rim.clone() },
  };
  const bend = motion !== "still";
  const meshes: THREE.Mesh[] = [];
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o);
  });
  for (const mesh of meshes) addEdge(mesh, u, bend, Math.max(size.x, size.y, size.z) * EDGE_THICKNESS);
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.material instanceof THREE.MeshBasicMaterial) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      m.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
        Object.assign(shader.uniforms, u);
        if (bend) shader.vertexShader = shader.vertexShader.replace("void main() {", `${BEND}\nvoid main() {`).replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed = animalBend( transformed );");
        shader.fragmentShader = shader.fragmentShader
          .replace("void main() {", `${RIM}\nvoid main() {`)
          .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  float rimK = pow( 1.0 - clamp( dot( normalize( vNormal ), normalize( vViewPosition ) ), 0.0, 1.0 ), 2.5 );\n  totalEmissiveRadiance += uRimColor * rimK * 0.35;");
      };
      m.customProgramCacheKey = () => (bend ? "animal-motion-rim" : "model-rim");
    }
  });
  return u;
}
