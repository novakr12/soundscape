export const DRAG_THRESHOLD_PX = 5;
export const AUTO_SCROLL_EDGE_PX = 40;
export const AUTO_SCROLL_MAX_PX = 14;

export type QueueRowRect = {
  index: number;
  top: number;
  bottom: number;
};

export type DropIndicator = {
  index: number;
  edge: "above" | "below";
};

/**
 * Computes the insertion slot (between rendered upcoming rows) for a vertical pointer position.
 */
export function dropSlotForY(
  rows: readonly QueueRowRect[],
  clientY: number,
  minIndex: number,
  maxIndex: number,
): number | null {
  if (minIndex > maxIndex || rows.length === 0) return null;
  const eligible = rows
    .filter((row) => row.index >= minIndex && row.index <= maxIndex)
    .sort((a, b) => a.index - b.index);
  if (eligible.length === 0) return null;

  for (const row of eligible) {
    const mid = (row.top + row.bottom) / 2;
    if (clientY < mid) return Math.max(minIndex, row.index);
  }
  const last = eligible[eligible.length - 1];
  return Math.min(maxIndex + 1, last.index + 1);
}

/**
 * Maps a visual insertion slot to the post-removal queue index expected by `moveAt` / remote `move`.
 */
export function targetIndexForSlot(from: number, slot: number, minIndex: number, maxIndex: number): number {
  if (minIndex > maxIndex || slot === from || slot === from + 1) return from;
  const raw = slot > from ? slot - 1 : slot;
  return Math.min(maxIndex, Math.max(minIndex, raw));
}

/**
 * Returns which row and edge should draw the drop insertion line, or null when dropping in place.
 */
export function indicatorForSlot(from: number, slot: number | null, lastRenderedIndex: number): DropIndicator | null {
  if (slot === null || slot === from || slot === from + 1) return null;
  if (slot <= lastRenderedIndex) return { index: slot, edge: "above" };
  if (slot === lastRenderedIndex + 1) return { index: lastRenderedIndex, edge: "below" };
  return null;
}

/**
 * Computes vertical scroll delta in pixels per frame when dragging near the top or bottom container edges.
 */
export function autoScrollStep(
  clientY: number,
  topBound: number,
  bottomBound: number,
  edge = AUTO_SCROLL_EDGE_PX,
  maxStep = AUTO_SCROLL_MAX_PX,
): number {
  if (
    !Number.isFinite(clientY) ||
    !Number.isFinite(topBound) ||
    !Number.isFinite(bottomBound) ||
    bottomBound <= topBound ||
    edge <= 0 ||
    maxStep <= 0
  ) {
    return 0;
  }
  const effectiveEdge = Math.min(edge, (bottomBound - topBound) / 2);
  if (effectiveEdge <= 0) return 0;

  if (clientY < topBound + effectiveEdge) {
    const ratio = Math.min(1, (topBound + effectiveEdge - clientY) / effectiveEdge);
    return -Math.min(maxStep, Math.max(1, Math.round(ratio * maxStep)));
  }
  if (clientY > bottomBound - effectiveEdge) {
    const ratio = Math.min(1, (clientY - (bottomBound - effectiveEdge)) / effectiveEdge);
    return Math.min(maxStep, Math.max(1, Math.round(ratio * maxStep)));
  }
  return 0;
}
