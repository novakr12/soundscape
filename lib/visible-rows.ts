export type RowWindow = { start: number; end: number };

export function visibleRows({
  count,
  rowHeight,
  listTop,
  viewport,
  spare,
}: {
  count: number;
  rowHeight: number;
  listTop: number;
  viewport: number;
  spare: number;
}): RowWindow {
  if (count <= 0) return { start: 0, end: 0 };
  const height = rowHeight > 0 ? rowHeight : 1;
  const first = Math.floor(-listTop / height) - spare;
  const last = Math.ceil((viewport - listTop) / height) + spare;
  const start = Math.max(0, Math.min(count, first));
  const end = Math.max(start, Math.min(count, last));
  return { start, end };
}

export function measuredHeight(drawnHeight: number, drawnRows: number, previous: number) {
  if (drawnRows <= 0 || !(drawnHeight > 0)) return previous;
  const measured = drawnHeight / drawnRows;
  return Math.abs(measured - previous) < 1 ? previous : measured;
}
