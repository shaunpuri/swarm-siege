import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader.js";
import type { Biome, Vec } from "@/types";

// The playfield is viewed by an orthographic camera tilted TILT degrees above the ground,
// like the isometric concept art. Logical game coordinates (1280x720, y down) map to the
// ground plane so that a ground point lands on exactly the same screen pixel as its
// logical coordinate: x stays x, and logical y is stretched by 1/sin(TILT) into world z
// to undo the camera's foreshortening. Clicks, DOM menus and the 2D overlay therefore keep
// using logical coordinates directly, and an object of height h appears h*cos(TILT)
// pixels above its ground point.

export const TILT = (55 * Math.PI) / 180;
export const SIN = Math.sin(TILT);
export const COS = Math.cos(TILT);
const W = 1280;
const H = 720;

export function toWorld(p: Vec, height = 0): THREE.Vector3 {
  return new THREE.Vector3(p.x - W / 2, height, (p.y - H / 2) / SIN);
}

// screen-space lift of something `height` world units tall
export function lift(height: number): number {
  return height * COS;
}

export type Stage = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  world: THREE.Group;
  // the light on the 3D models, tuned to each world's map (setLightFor)
  sky: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
};

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x2b4a1c);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 1, 8000);
  const dist = 3000;
  camera.position.set(0, dist * SIN, dist * COS);
  camera.lookAt(0, 0, 0);

  // light for the real 3D models (sprites ignore it): a sky and ground fill, and the sun from
  // the upper left, the same direction the painted maps and sprites are lit from
  const sky = new THREE.HemisphereLight(0xfff6e6, 0x8a7258, 3.2);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xfff2dc, 3.6);
  sun.position.set(-700, 1000, 650);
  scene.add(sun);

  const world = new THREE.Group();
  scene.add(world);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // a light bloom: only the brightest pixels (crystal, lanterns, turret cores, shots) glow
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.35, 0.4, 0.86);
  composer.addPass(bloom);
  // a soft vignette: the edges of the battlefield fall slightly into shade, drawing the eye to
  // the action in the middle, like the framing of polished mobile strategy games
  const vignette = new ShaderPass(VignetteShader);
  vignette.uniforms["offset"] = { value: 0.95 };
  vignette.uniforms["darkness"] = { value: 0.9 };
  composer.addPass(vignette);
  composer.addPass(new OutputPass());

  return { renderer, scene, camera, composer, bloom, world, sky, sun };
}

// WebGL resolution follows the screen up to 2x, so turrets and creatures stay crisp on phones
// and high resolution laptops (1.5x drew them small and stretched them, which blurred them)
const MAX_GL_RATIO = 2;

export function resizeStage(stage: Stage, viewRatio: number): void {
  const ratio = Math.min(MAX_GL_RATIO, viewRatio);
  stage.renderer.setPixelRatio(ratio);
  stage.renderer.setSize(W, H, false);
  stage.composer.setPixelRatio(ratio);
  stage.composer.setSize(W, H);
}

export function renderStage(stage: Stage): void {
  stage.composer.render();
}

// frees GPU memory of everything in the level group before building the next level
export function clearWorld(stage: Stage): void {
  stage.world.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh || obj instanceof THREE.Sprite) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) m.dispose();
    }
  });
  stage.world.clear();
}

// bright maps (snow, sand) are mostly near-white, so bloom would wash them out: there it only
// catches the very brightest glows, and weaker
// each world's light on the 3D models, so they take on the map's mood: warm sun on the desert,
// cool blue snow light, cyan sea light, neon purple city glow, warm green forest light
const LIGHT: Record<Biome, { sky: number; ground: number; sun: number; skyI: number; sunI: number }> = {
  grassland: { sky: 0xfff8e1, ground: 0x7a8a4a, sun: 0xfff1d6, skyI: 3.2, sunI: 3.6 },
  snow: { sky: 0xeaf6ff, ground: 0x9fb8d6, sun: 0xf3f8ff, skyI: 3.4, sunI: 3.4 },
  desert: { sky: 0xfff6ea, ground: 0x8a6a4a, sun: 0xfff1dc, skyI: 2.5, sunI: 2.9 },
  water: { sky: 0xd8fbff, ground: 0x3b7f9a, sun: 0xc9f4ff, skyI: 3.3, sunI: 3.2 },
  cyber: { sky: 0xf3e4ff, ground: 0x6b3fa0, sun: 0xffe0ff, skyI: 2.7, sunI: 2.6 },
};

export function setLightFor(stage: Stage, biome: Biome): void {
  const l = LIGHT[biome];
  stage.sky.color.setHex(l.sky);
  stage.sky.groundColor.setHex(l.ground);
  stage.sky.intensity = l.skyI;
  stage.sun.color.setHex(l.sun);
  stage.sun.intensity = l.sunI;
}

export function setBloomFor(stage: Stage, bright: boolean): void {
  stage.bloom.strength = bright ? 0.18 : 0.35;
  stage.bloom.threshold = bright ? 0.97 : 0.86;
}
