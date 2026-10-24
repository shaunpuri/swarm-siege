import type { Vec } from "@/types";

// Everything is authored on a fixed 1280x720 logical stage. The stage element (canvas
// plus DOM HUD) is CSS-scaled to fit the window, and the canvas backing store is sized
// to the real pixel density so the art stays crisp on phones and 4K screens.

export const W = 1280;
export const H = 720;

// rotated: the stage is turned 90 degrees clockwise (a phone held upright plays sideways)
export type View = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; ratio: number; rotated: boolean };

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas not supported");
  return ctx;
}

export function createView(canvas: HTMLCanvasElement): View {
  return { canvas, ctx: context2d(canvas), ratio: 1, rotated: false };
}

// the visible page size. Not innerWidth: phones widen that to fit oversized content (the
// 1280px stage before it is scaled), clientWidth stays the real screen width
export function viewport(): { w: number; h: number } {
  return { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight };
}

// the part of the window the stage is fitted into (all of it, or one half in split view)
export type Area = { x: number; y: number; w: number; h: number };

// how much to enlarge menus and buttons so they stay readable and tappable on a small screen
// (the whole stage shrinks to fit a phone, its text with it); 1 on a laptop
let uiScale = 1;

export function uiZoom(): number {
  return uiScale;
}

export function fitStage(stage: HTMLElement, view: View, area: Area, rotated = false): void {
  const scale = fitInto(stage, area, rotated);
  view.rotated = rotated;
  uiScale = Math.max(1, Math.min(1.7, 0.8 / scale));
  stage.style.setProperty("--ui", uiScale.toFixed(3));
  view.ratio = Math.min(2.5, (window.devicePixelRatio || 1) * scale);
  view.canvas.width = Math.round(W * view.ratio);
  view.canvas.height = Math.round(H * view.ratio);
}

// scales a 1280x720 element to fit an area, centred in it; returns the scale. rotated: the
// area is given in a sideways (landscape) frame on an upright screen, and the element is
// turned 90 degrees clockwise to fill it
export function fitInto(el: HTMLElement, area: Area, rotated = false): number {
  if (rotated) {
    const { w: screenW } = viewport();
    const scale = Math.min(area.w / W, area.h / H);
    // landscape frame point (x, y) lands on the upright screen at (screenW - y, x)
    const cx = area.x + area.w / 2;
    const cy = area.y + area.h / 2;
    el.style.left = `${((screenW - cy) / screenW) * 100}%`;
    el.style.top = `${(cx / viewport().h) * 100}%`;
    el.style.transform = `translate(-50%, -50%) rotate(90deg) scale(${scale})`;
    return scale;
  }
  const scale = Math.min(area.w / W, area.h / H);
  // as a share of the window, so the element stays centred in its area even before the next
  // resize event arrives (phones rotating)
  el.style.left = `${((area.x + area.w / 2) / viewport().w) * 100}%`;
  el.style.top = `${((area.y + area.h / 2) / viewport().h) * 100}%`;
  el.style.transform = `translate(-50%, -50%) scale(${scale})`;
  return scale;
}

export function toLogical(view: View, clientX: number, clientY: number): Vec {
  const rect = view.canvas.getBoundingClientRect();
  if (view.rotated) {
    // undo the 90 degree turn around the stage centre
    const k = rect.height / W;
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    return { x: W / 2 + dy / k, y: H / 2 - dx / k };
  }
  return { x: ((clientX - rect.left) / rect.width) * W, y: ((clientY - rect.top) / rect.height) * H };
}

export function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, color: string): void {
  ctx.fillStyle = "rgba(2,6,23,0.8)";
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
}

export function hpColor(frac: number): string {
  if (frac > 0.6) return "#4ade80";
  if (frac > 0.3) return "#facc15";
  return "#f87171";
}
