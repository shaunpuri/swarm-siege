// The page's clock. Normally real time; in capture mode (?capture=1, for recording videos) it
// only moves when the recorder calls window.advanceFrame(), one video frame (1/30 s) at a time,
// so recordings come out perfectly smooth however slowly each frame is captured.

let virtual: number | null = null;

export function nowMs(): number {
  return virtual ?? performance.now();
}

export const FRAME_MS = 1000 / 30;

export function startCapture(): void {
  virtual = 0;
  Object.defineProperty(window, "advanceFrame", {
    value: (): number => {
      virtual = (virtual ?? 0) + FRAME_MS;
      return virtual;
    },
  });
}
