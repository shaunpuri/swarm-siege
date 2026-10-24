import type { LevelDef } from "@/types";
import { levelsFor } from "@/config/levels";
import type { MapMode } from "@/config/levels";
import { CYBER_ART, MAP_ART, PAINTING_ART } from "@/three/manifest";
import { WORLD_ART } from "@/three/worldart";

// each level card shows that level's map in the chosen mode

function thumbFor(level: LevelDef, i: number): string {
  if (level.mapArt === "world") return WORLD_ART[level.id]?.[level.biome] ?? PAINTING_ART;
  if (level.mapArt === "cyber") return CYBER_ART;
  if (level.mapArt === "grassland") return PAINTING_ART;
  return MAP_ART[i] ?? PAINTING_ART;
}

export function makeThumbs(mode: MapMode): Map<number, HTMLImageElement> {
  const thumbs = new Map<number, HTMLImageElement>();
  levelsFor(mode).forEach((level, i) => {
    const img = new Image();
    img.src = thumbFor(level, i);
    img.className = "thumb";
    img.alt = `Level ${level.id} map`;
    thumbs.set(level.id, img);
  });
  return thumbs;
}

// the title screen backdrop: the painting that best matches the chosen world
export function backdropFor(mode: MapMode): string {
  if (mode === "cyber" || mode === "world-cyber") return CYBER_ART;
  const first = levelsFor(mode)[0];
  return first?.mapArt === "world" ? (WORLD_ART[first.id]?.[first.biome] ?? PAINTING_ART) : PAINTING_ART;
}
