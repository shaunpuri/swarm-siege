import type { Biome } from "@/types";

// The player's last 1 vs 1 matches (online and against the AI), kept per browser for the
// profile. Storage can be unavailable, so every access is guarded.

export type MatchRecord = { at: number; ai: boolean; opponent: string; outcome: "won" | "lost" | "draw"; mine: number; theirs: number; biome: Biome };

const KEY = "swarm-siege-matches-v1";
const KEEP = 20;
const BIOMES: Biome[] = ["grassland", "snow", "desert", "water", "cyber"];

// one record per line, fields separated by tabs (no JSON parsing to validate)
function encode(r: MatchRecord): string {
  return [r.at, r.ai ? 1 : 0, r.opponent.replace(/[\t\n]/g, " "), r.outcome, r.mine, r.theirs, r.biome].join("\t");
}

function decode(line: string): MatchRecord | null {
  const [at, ai, opponent, outcome, mine, theirs, biome] = line.split("\t");
  const when = Number(at);
  const b = BIOMES.find((x) => x === biome);
  if (!Number.isFinite(when) || opponent === undefined || !b) return null;
  if (outcome !== "won" && outcome !== "lost" && outcome !== "draw") return null;
  return { at: when, ai: ai === "1", opponent, outcome, mine: Number(mine) || 0, theirs: Number(theirs) || 0, biome: b };
}

export function loadMatches(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(KEY) ?? "";
    return raw.split("\n").flatMap((line) => {
      const r = decode(line);
      return r ? [r] : [];
    });
  } catch {
    return [];
  }
}

export function recordMatch(r: MatchRecord): void {
  const list = [r, ...loadMatches()].slice(0, KEEP);
  try {
    localStorage.setItem(KEY, list.map(encode).join("\n"));
  } catch {
    // the history just will not persist in this browser
  }
}
