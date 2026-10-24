import type { Area } from "@/render/canvas";
import { fitInto, fitStage, viewport } from "@/render/canvas";
import type { View } from "@/render/canvas";
import { button, h, show } from "@/ui/dom";

// Page layout. Normally the game fills the window. In versus split view the window is shared
// with the rival's screen, side by side. On a phone held upright the whole layout is turned
// sideways (rotated 90 degrees) so the game always gets the full screen and stays playable,
// even with auto-rotate off; the first tap on a touch screen goes fullscreen.

export type Layout = { rival: HTMLElement; rivalCanvas: HTMLCanvasElement };

export function createLayout(onCloseSplit: () => void): Layout {
  const rival = h("div", "rival-pane hidden");
  const rivalCanvas = document.createElement("canvas");
  rival.appendChild(rivalCanvas);
  rival.appendChild(button("small rival-close", "CLOSE SPLIT", onCloseSplit));
  document.body.append(rival);
  return { rival, rivalCanvas };
}

function touchDevice(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

export function applyLayout(layout: Layout, stage: HTMLElement, view: View, split: boolean): void {
  const screenSize = viewport();
  // an upright phone lays everything out in a sideways frame and turns it to fit
  const rotated = screenSize.h > screenSize.w && touchDevice();
  const w = rotated ? screenSize.h : screenSize.w;
  const hgt = rotated ? screenSize.w : screenSize.h;
  let game: Area = { x: 0, y: 0, w, h: hgt };
  if (split) {
    game = { x: 0, y: 0, w: w / 2, h: hgt };
    fitInto(layout.rival, { x: w / 2, y: 0, w: w / 2, h: hgt }, rotated);
  }
  show(layout.rival, split);
  fitStage(stage, view, game, rotated);
}

// first touch: go fullscreen and ask for landscape (both are best effort; some browsers refuse)
export async function goFullscreen(): Promise<void> {
  if (!touchDevice() || document.fullscreenElement) return;
  try {
    await document.documentElement.requestFullscreen();
    await screen.orientation.lock("landscape");
  } catch {
    // the browser said no; the sideways layout still fits the screen
  }
}
