import * as THREE from "three";
type Size = { w: number; h: number };
type MapStyle = "nature" | "neon" | "aqua" | "frost";
import type { MapFeatures } from "@/types";
import { SIN, toWorld } from "@/three/stage";

// The map is the level painting itself, laid on the ground plane so each painted pixel
// lands exactly where the game logic expects it. A fragment shader brings it to life without
// repainting anything: pixels are classified by their own colour, so turquoise water ripples,
// sparkles and streams down the waterfalls, green foliage and grass sway in travelling wind
// gusts, and soft cloud shadows drift across the whole valley; on the neon city map, signs
// pulse and flicker, hologram scans sweep and smog drifts instead. Roads, buildings and pads are
// neither green nor turquoise, so they stay perfectly still.

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform float time;
  uniform vec2 texel;
  uniform float dim;
  uniform float neon;
  // underwater: the whole scene sways gently, caustic light dances, rays fall from the surface
  uniform float aqua;
  // Cold World: rivers are frozen, so they do not flow
  uniform float frozen;
  // painting features in uv space: hologram globe (centre xy, radius zw) and a sign whose
  // lettering flares at intervals (x0, y0, x1, y1); zero size disables them
  uniform vec4 globe;
  uniform vec4 signRect;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vec3 base = texture2D(map, vUv).rgb;
    // colour masks (texture is decoded to linear light)
    // flowing water only exists on nature maps: the neon city has none, and underwater
    // everything is water, so nothing flows there
    float water = smoothstep(0.06, 0.2, min(base.g - base.r, base.b - base.r)) * step(0.12, base.b) * (1.0 - neon) * (1.0 - aqua) * (1.0 - frozen);
    float leaf = smoothstep(0.015, 0.09, base.g - max(base.r, base.b) * 0.95) * (1.0 - water) * (1.0 - neon);

    // wind: gusts roll across the valley; leaves and grass sway with them
    float gust = 0.35 + 0.65 * smoothstep(0.2, 0.9, noise(vec2(vUv.x * 3.0 - time * 0.35, vUv.y * 2.0)));
    float sway = sin(time * 2.3 + vUv.y * 160.0 + vUv.x * 50.0) + 0.5 * sin(time * 3.7 + vUv.x * 210.0);
    vec2 uv = vUv;

    // hologram globe: remap the disc as a sphere turning about its vertical axis, so the
    // painted continents slide round. Two copies a quarter turn apart are blended with
    // cos^2 and sin^2 weights, so each copy fades out exactly where it wraps: no seam.
    vec2 gd = (vUv - globe.xy) / max(globe.zw, vec2(1e-5));
    float inGlobe = step(1e-5, globe.z) * (1.0 - smoothstep(0.9, 1.0, length(gd)));
    vec3 globeCol = vec3(0.0);
    if (inGlobe > 0.0) {
      float w = sqrt(max(1e-4, 1.0 - gd.y * gd.y));
      float lon = asin(clamp(gd.x / w, -1.0, 1.0)) + time * 0.55;
      float x1 = mod(lon + 1.5708, 3.1416) - 1.5708;
      float x2 = mod(lon + 3.1416, 3.1416) - 1.5708;
      float k = cos(x1);
      vec3 a = texture2D(map, globe.xy + vec2(sin(x1) * w, gd.y) * globe.zw).rgb;
      vec3 b = texture2D(map, globe.xy + vec2(sin(x2) * w, gd.y) * globe.zw).rgb;
      globeCol = mix(b, a, k * k);
      water *= 1.0 - inGlobe;
    }
    uv.x += leaf * sway * texel.x * 1.3 * gust;
    uv.y += leaf * cos(time * 1.9 + vUv.x * 140.0) * texel.y * 0.5 * gust;

    // underwater: a slow sway over the whole picture, like looking through the sea
    uv += aqua * vec2(sin(time * 0.9 + vUv.y * 18.0), cos(time * 0.7 + vUv.x * 14.0)) * texel * 1.4;

    // water: gentle ripple distortion
    uv += water * vec2(sin(time * 1.6 + vUv.y * 140.0), cos(time * 1.3 + vUv.x * 120.0)) * texel * 1.5;
    vec3 col = texture2D(map, uv).rgb;
    col = mix(col, globeCol, inGlobe);

    // waterfalls and white water: bright water gets streaks that fall downward
    float white = water * smoothstep(0.35, 0.75, dot(col, vec3(0.333)));
    float fall = sin(vUv.y * 520.0 - time * 14.0 + sin(vUv.x * 330.0) * 4.0) * 0.5 + 0.5;
    col += white * fall * 0.18;
    // sun glints dancing on the water
    float glint = pow(max(0.0, noise(vUv * vec2(260.0, 180.0) + vec2(time * 0.8, -time * 0.6)) - 0.55) * 2.2, 6.0);
    col += water * glint * 0.9;

    // drifting cloud shadows (nature)
    float cloud = noise(vUv * vec2(2.2, 1.6) + vec2(time * 0.018, time * 0.007));
    col *= 1.0 - 0.13 * smoothstep(0.55, 0.85, cloud) * (1.0 - neon) * (1.0 - aqua);

    // underwater light: a shimmering caustic net and slanted rays from the surface
    vec2 cp = vUv * vec2(26.0, 15.0);
    float caus = pow(1.0 - abs(noise(cp + vec2(time * 0.35, time * 0.2)) - noise(cp * 1.3 - vec2(time * 0.25, -time * 0.3))), 9.0);
    float rays = pow(sin((vUv.x + vUv.y * 0.35) * 22.0 + time * 0.25) * 0.5 + 0.5, 8.0) * smoothstep(0.1, 1.0, vUv.y);
    col += aqua * (caus * vec3(0.10, 0.20, 0.24) + rays * vec3(0.05, 0.09, 0.11));

    // neon city: bright saturated signs and lights pulse, a few buzz and flicker, a hologram
    // scan line sweeps down the glowing parts, and purple smog drifts low across the streets
    float bright = max(col.r, max(col.g, col.b));
    float sat = bright - min(col.r, min(col.g, col.b));
    float glow = smoothstep(0.25, 0.6, bright) * smoothstep(0.15, 0.45, sat) * neon;
    vec2 cell = floor(vUv * vec2(48.0, 32.0));
    float pulse = 0.82 + 0.18 * sin(time * (1.5 + hash(cell) * 3.0) + hash(cell + 7.0) * 6.28);
    float buzz = step(0.985, hash(cell + floor(time * 9.0))) * step(0.7, hash(cell + 3.0));
    col *= mix(1.0, pulse * (1.0 - buzz * 0.65), glow);
    float scan = exp(-pow((fract(vUv.y * 1.2 - time * 0.22) - 0.5) * 60.0, 2.0));
    col += glow * scan * vec3(0.25, 0.3, 0.45);
    float smog = smoothstep(0.45, 0.9, noise(vUv * vec2(3.5, 2.5) + vec2(time * 0.04, time * 0.01)));
    col += neon * smog * (1.0 - vUv.y * 0.6) * vec3(0.09, 0.03, 0.14);

    // sign: every 6 seconds the bright lettering flares with a quick flicker, then fades
    vec2 sp = (vUv - signRect.xy) / max(signRect.zw - signRect.xy, vec2(1e-5));
    float inSign = step(1e-5, signRect.z) * smoothstep(0.0, 0.12, sp.x) * smoothstep(1.0, 0.88, sp.x) * smoothstep(0.0, 0.12, sp.y) * smoothstep(1.0, 0.88, sp.y);
    float cyc = mod(time, 6.0);
    float flare = smoothstep(0.0, 0.25, cyc) * (1.0 - smoothstep(0.9, 2.0, cyc)) * (0.75 + 0.25 * step(0.5, fract(cyc * 7.0)));
    float letters = smoothstep(0.35, 0.7, dot(col, vec3(0.3, 0.45, 0.25)));
    col += inSign * flare * letters * vec3(1.6, 0.75, 1.5);

    // the margin backdrop is the same painting, dark and nearly grey so it never competes
    if (dim < 1.0) col = mix(vec3(dot(col, vec3(0.3, 0.59, 0.11))), col, 0.25) * dim;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export type MapFx = { group: THREE.Group; uniforms: { time: { value: number } } };


// painting pixels to texture uv (the texture is flipped, so uv y runs up from the bottom)
function featureUniforms(size: Size, f: MapFeatures): { globe: THREE.Vector4; signRect: THREE.Vector4 } {
  const g = f.globe;
  const s = f.sign;
  return {
    globe: g ? new THREE.Vector4(g.x / size.w, 1 - g.y / size.h, g.rx / size.w, g.ry / size.h) : new THREE.Vector4(),
    signRect: s ? new THREE.Vector4(s.x0 / size.w, 1 - s.y1 / size.h, s.x1 / size.w, 1 - s.y0 / size.h) : new THREE.Vector4(),
  };
}

function paintingMaterial(tex: THREE.Texture, size: Size, time: { value: number }, dim: number, style: MapStyle, features: MapFeatures): THREE.ShaderMaterial {
  const feat = featureUniforms(size, features);
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      map: { value: tex },
      time,
      texel: { value: new THREE.Vector2(1 / size.w, 1 / size.h) },
      dim: { value: dim },
      neon: { value: style === "neon" ? 1 : 0 },
      aqua: { value: style === "aqua" ? 1 : 0 },
      frozen: { value: style === "frost" ? 1 : 0 },
      globe: { value: feat.globe },
      signRect: { value: feat.signRect },
    },
  });
}

// a flat quad covering a logical-coordinate rectangle of the playfield
function groundQuad(x: number, y: number, w: number, h: number, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, h / SIN);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(toWorld({ x: x + w / 2, y: y + h / 2 }));
  return mesh;
}

// the painting is shown whole, scaled to the 720px playfield height and centred
export function buildMap(painting: THREE.Texture, size: Size, style: MapStyle, features: MapFeatures = {}): MapFx {
  const time = { value: 0 };
  const group = new THREE.Group();
  // the painting stretched and darkened behind everything fills the side margins
  const backdrop = groundQuad(-40, -40, 1360, 800, paintingMaterial(painting, size, time, 0.008, style, features));
  backdrop.position.y = -2;
  group.add(backdrop);
  const w = size.w * (720 / size.h);
  group.add(groundQuad((1280 - w) / 2, 0, w, 720, paintingMaterial(painting, size, time, 1, style, features)));
  return { group, uniforms: { time } };
}

export function animateMap(fx: MapFx, t: number): void {
  fx.uniforms.time.value = t;
}
