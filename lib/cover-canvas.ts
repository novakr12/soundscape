import { coverSize } from "./cover-size";

export type Crop = { x: number; y: number; width: number; height: number };

export function canvasPixels(shown: number, ratio: number) {
  const wanted = Math.round(shown * (Number.isFinite(ratio) && ratio > 0 ? ratio : 1));
  return Math.max(1, Math.min(wanted, coverSize(shown)));
}

export function centreCrop(width: number, height: number): Crop {
  const side = Math.min(width, height);
  return { x: (width - side) / 2, y: (height - side) / 2, width: side, height: side };
}

export function drawsCoversOnCanvas(userAgent: string | null | undefined) {
  return /\bServo\//.test(userAgent ?? "");
}

export function releaseCanvas(canvas: { width: number; height: number }) {
  if (canvas.width > 1 || canvas.height > 1) {
    canvas.width = 1;
    canvas.height = 1;
  }
  canvas.width = 0;
  canvas.height = 0;
}
