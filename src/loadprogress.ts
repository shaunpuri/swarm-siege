// How far the game's first load has got: every image and 3D model counts itself in when it
// starts and out when it finishes, and the loading screen draws the share done as a bar.

let started = 0;
let finished = 0;
let listener: ((done: number) => void) | null = null;

export function onLoadProgress(fn: (done: number) => void): void {
  listener = fn;
}

export async function tracked<T>(work: Promise<T>): Promise<T> {
  started += 1;
  try {
    return await work;
  } finally {
    finished += 1;
    listener?.(finished / Math.max(1, started));
  }
}
