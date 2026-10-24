// Per-browser campaign progress: for every world (map mode), how far the player has unlocked,
// their best stars per level and the hardest difficulty each level was cleared on (0 none,
// 1 easy, 2 medium, 3 hard). Stored as a plain "mode=unlocked:s1,s2,...:d1,d2,...;mode=..." string
// so reading it back needs no JSON parsing. Storage can be unavailable (private mode, blocked
// site data), so every access is guarded.

const KEY = "swarm-siege-campaign-v1";

export type WorldProgress = { unlocked: number; stars: number[]; best: number[] };
export type Progress = Map<string, WorldProgress>;

function fresh(): WorldProgress {
  return { unlocked: 1, stars: [], best: [] };
}

function digits(part: string | undefined): number[] {
  return (part ?? "")
    .split(",")
    .filter((s) => s !== "")
    .map((s) => Math.max(0, Math.min(3, Number(s) || 0)));
}

function decodeWorld(raw: string): WorldProgress {
  const [unlockedPart, starsPart, bestPart] = raw.split(":");
  const unlocked = Number(unlockedPart);
  if (!Number.isInteger(unlocked) || unlocked < 1) return fresh();
  return { unlocked, stars: digits(starsPart), best: digits(bestPart) };
}

function decode(raw: string): Progress {
  const p: Progress = new Map();
  for (const part of raw.split(";")) {
    const [mode, world] = part.split("=");
    if (mode && world) p.set(mode, decodeWorld(world));
  }
  return p;
}

function encode(p: Progress): string {
  return [...p].map(([mode, w]) => `${mode}=${w.unlocked}:${w.stars.join(",")}:${w.best.join(",")}`).join(";");
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? decode(raw) : new Map();
  } catch {
    return new Map();
  }
}

function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, encode(p));
  } catch {
    // progress just will not persist in this browser
  }
}

export function worldProgress(p: Progress, mode: string): WorldProgress {
  return p.get(mode) ?? fresh();
}

export function starsFor(p: Progress, mode: string, levelId: number): number {
  return worldProgress(p, mode).stars[levelId - 1] ?? 0;
}

export function totalStars(p: Progress, mode: string): number {
  return worldProgress(p, mode).stars.reduce((s, n) => s + n, 0);
}

// levels cleared in a world (the highest level beaten, since they unlock in order)
export function cleared(p: Progress, mode: string): number {
  return worldProgress(p, mode).unlocked - 1;
}

// hardest difficulty this level was cleared on: 0 none, 1 easy, 2 medium, 3 hard
export function bestDifficulty(p: Progress, mode: string, levelId: number): number {
  return worldProgress(p, mode).best[levelId - 1] ?? 0;
}

function raise(list: number[], levelId: number, value: number): number[] {
  const next = [...list];
  while (next.length < levelId) next.push(0);
  next[levelId - 1] = Math.max(next[levelId - 1] ?? 0, value);
  return next;
}

// difficulty: 1 easy, 2 medium, 3 hard
export function recordWin(p: Progress, mode: string, levelId: number, stars: number, difficulty: number): Progress {
  const world = worldProgress(p, mode);
  const result = new Map(p);
  result.set(mode, { unlocked: Math.max(world.unlocked, levelId + 1), stars: raise(world.stars, levelId, stars), best: raise(world.best, levelId, difficulty) });
  saveProgress(result);
  return result;
}
