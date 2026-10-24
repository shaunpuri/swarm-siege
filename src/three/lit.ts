import * as THREE from "three";
import type { Biome } from "@/types";
import { RIG_VERTEX, rigUniforms } from "@/three/rig";
import type { RigUniforms } from "@/three/rig";

// Makes the flat sprites cut from the sheets read as solid 3D objects standing in the
// painted 3D maps. The maps are lit from the upper left, so each sprite gets the same light:
//   - a relief normal built from the sprite itself (alpha gives the silhouette bevel,
//     brightness gives surface detail), shaded with the map's sun direction
//   - a specular glint on the lit side and a biome coloured rim light on the shadow side
//   - ambient occlusion: the bottom of standing sprites darkens toward the ground
// A cast shadow of the sprite's own silhouette is laid on the ground, falling away from
// the sun (up and to the right on screen), instead of a round blob.

type LitUniforms = {
  uFlip: THREE.IUniform<number>;
  uRot: THREE.IUniform<number>;
  uAo: THREE.IUniform<number>;
  uRim: THREE.IUniform<THREE.Color>;
  uAmbient: THREE.IUniform<THREE.Color>;
} & RigUniforms;

// sun colour and fill light per biome, matched to each map's painted lighting
const AMBIENT: Record<Biome, number> = { snow: 0xdbeafe, water: 0x93c5fd, cyber: 0xe9d5ff, desert: 0xffedd5, grassland: 0xfff7e0 };
const RIM: Record<Biome, number> = { snow: 0x7dd3fc, water: 0x22d3ee, cyber: 0xe879f9, desert: 0xfb923c, grassland: 0xbef264 };

const uniformsOf = new WeakMap<THREE.SpriteMaterial, LitUniforms>();

const RELIEF = /* glsl */ `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  vec2 px = 2.5 / vec2( textureSize( map, 0 ) );
  // height field: the silhouette rounds off at the edges, bright parts stand out a little
  float hc = sampledDiffuseColor.a;
  float hL = texture2D( map, vMapUv - vec2( px.x, 0.0 ) ).a + texture2D( map, vMapUv - vec2( px.x * 2.5, 0.0 ) ).a * 0.6;
  float hR = texture2D( map, vMapUv + vec2( px.x, 0.0 ) ).a + texture2D( map, vMapUv + vec2( px.x * 2.5, 0.0 ) ).a * 0.6;
  float hD = texture2D( map, vMapUv - vec2( 0.0, px.y ) ).a + texture2D( map, vMapUv - vec2( 0.0, px.y * 2.5 ) ).a * 0.6;
  float hU = texture2D( map, vMapUv + vec2( 0.0, px.y ) ).a + texture2D( map, vMapUv + vec2( 0.0, px.y * 2.5 ) ).a * 0.6;
  vec3 lum = vec3( 0.299, 0.587, 0.114 );
  float lL = dot( texture2D( map, vMapUv - vec2( px.x, 0.0 ) ).rgb, lum );
  float lR = dot( texture2D( map, vMapUv + vec2( px.x, 0.0 ) ).rgb, lum );
  float lD = dot( texture2D( map, vMapUv - vec2( 0.0, px.y ) ).rgb, lum );
  float lU = dot( texture2D( map, vMapUv + vec2( 0.0, px.y ) ).rgb, lum );
  float dx = ( hR - hL ) * 1.1 + ( lR - lL ) * 0.5;
  float dy = ( hU - hD ) * 1.1 + ( lU - lD ) * 0.5;
  vec3 n = normalize( vec3( -dx * uFlip, -dy, 1.0 ) );
  // sprites that are spun (top down aliens) keep the light fixed on screen
  float c = cos( uRot ), s = sin( uRot );
  n.xy = mat2( c, s, -s, c ) * n.xy;
  vec3 sun = normalize( vec3( -0.55, 0.6, 0.62 ) );
  float diff = clamp( dot( n, sun ), 0.0, 1.0 );
  // toon shading, as in Supercell's games: light falls in a few clean bands rather than a soft
  // gradient (half banded, half smooth, so the painted detail survives)
  float band = smoothstep( 0.18, 0.26, diff ) * 0.5 + smoothstep( 0.62, 0.7, diff ) * 0.5;
  // bright like the painted maps: shadows only dip a little, lit faces glow
  float shade = 0.9 + 0.48 * mix( diff, band, 0.55 );
  float spec = pow( max( dot( reflect( -sun, n ), vec3( 0.0, 0.0, 1.0 ) ), 0.0 ), 18.0 ) * 0.35;
  float edge = clamp( length( n.xy ) * 1.4, 0.0, 1.0 );
  float rim = edge * clamp( dot( normalize( n.xy + 1e-4 ), -sun.xy ), 0.0, 1.0 ) * 0.9;
  // ambient occlusion: darker toward the feet / turret base
  float ao = mix( 1.0, mix( 0.78, 1.0, smoothstep( 0.0, 0.42, vMapUv.y ) ), uAo );
  vec3 lit = sampledDiffuseColor.rgb * uAmbient * shade * ao + spec * hc + uRim * rim * hc;
  // punchier colour, like the saturated Supercell palettes
  lit = mix( vec3( dot( lit, lum ) ), lit, 1.4 );
  // exposure so units are as bright and vivid as the maps around them
  lit *= 1.14;
  // a dark cartoon outline along the silhouette, so units read clearly against busy maps
  vec2 o = 1.4 / vec2( textureSize( map, 0 ) );
  float rimAlpha = min( min( texture2D( map, vMapUv + vec2( o.x, 0.0 ) ).a, texture2D( map, vMapUv - vec2( o.x, 0.0 ) ).a ), min( texture2D( map, vMapUv + vec2( 0.0, o.y ) ).a, texture2D( map, vMapUv - vec2( 0.0, o.y ) ).a ) );
  float outline = hc * ( 1.0 - smoothstep( 0.3, 0.85, rimAlpha ) );
  lit = mix( lit, vec3( 0.07, 0.05, 0.09 ), outline * 0.7 );
  diffuseColor *= vec4( lit, sampledDiffuseColor.a );
#endif
`;

export function litMaterial(tex: THREE.Texture, biome: Biome, standing: boolean): THREE.SpriteMaterial {
  // a very low alpha cut keeps the soft, anti-aliased edge of every sprite
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.005, depthWrite: false });
  const u: LitUniforms = {
    uFlip: { value: 1 },
    uRot: { value: 0 },
    uAo: { value: standing ? 1 : 0 },
    uRim: { value: new THREE.Color(RIM[biome]) },
    uAmbient: { value: new THREE.Color(0xffffff).lerp(new THREE.Color(AMBIENT[biome]), 0.18) },
    ...rigUniforms(),
  };
  uniformsOf.set(mat, u);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "uniform float uFlip;\nuniform float uRot;\nuniform float uAo;\nuniform vec3 uRim;\nuniform vec3 uAmbient;\nvoid main() {")
      .replace("#include <map_fragment>", RELIEF);
    // the skeleton bends the sprite's grid mesh (towers and bases keep the rig switched off)
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", `${RIG_VERTEX}\nvoid main() {`)
      .replace("vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;", "vec2 alignedPosition = ( position.xy + rigOffset( uv ) - ( center - vec2( 0.5 ) ) ) * scale;");
  };
  mat.customProgramCacheKey = () => "lit-sprite";
  return mat;
}

// the rig uniforms of a lit sprite, to pose its skeleton each frame
export function rigOf(mat: THREE.SpriteMaterial): RigUniforms | undefined {
  return uniformsOf.get(mat);
}

// mirrored textures flip the relief's x slope; rotation keeps the sun fixed on screen
export function setLit(mat: THREE.SpriteMaterial, flip: boolean, rotation: number): void {
  const u = uniformsOf.get(mat);
  if (!u) return;
  u.uFlip.value = flip ? -1 : 1;
  u.uRot.value = rotation;
}

// Cast shadow: the sprite's silhouette laid on the ground, its foot at the origin and its
// head stretching away from the sun. Geometry is a unit plane, scaled per actor.
export function castShadowGeometry(): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(1, 1);
  g.translate(0, 0.5, 0);
  // lie flat (texture top points up the screen, away from the viewer) and lean right
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute("position");
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) - pos.getZ(i) * 0.55);
  pos.needsUpdate = true;
  // real shadows soften away from the object: dark at the foot, fading out toward the tip
  const fade: number[] = [];
  for (let i = 0; i < pos.count; i++) fade.push(0, 0, 0, 1 + pos.getZ(i) * 0.9);
  g.setAttribute("color", new THREE.Float32BufferAttribute(fade, 4));
  return g;
}

export function castShadowMaterial(tex: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.45, alphaTest: 0.01, depthWrite: false });
}
