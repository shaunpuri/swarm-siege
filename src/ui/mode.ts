import { MAP_MODES } from "@/config/levels";
import type { MapMode } from "@/config/levels";

// Which world (map mode) the game opens on, and remembering the last one played.

const KEY = "swarm-siege-mode";

// ?mode=grassland or ?mode=cyber plays every level on that painting (?classic=1 = grassland);
// otherwise the last world played, starting with the Grassland world
export function initialMode(params: URLSearchParams): MapMode {
  const asked = params.get("classic") === "1" ? "grassland" : params.get("mode");
  const found = MAP_MODES.find((m) => m === asked);
  if (found) return found;
  try {
    return MAP_MODES.find((m) => m === localStorage.getItem(KEY)) ?? "world-grassland";
  } catch {
    return "world-grassland";
  }
}

export function saveMode(mode: MapMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // the choice just will not be remembered
  }
}
