export type Plot = { x: number; y: number; width: number; height: number };

export type Box = { left: number; top: number; width: number; height: number };

const GAP = 12;

export function hoveredIndex(plot: Plot, count: number, vertical: boolean, x: number, y: number) {
  if (count <= 0 || plot.width <= 0 || plot.height <= 0) return null;
  if (x < plot.x || x >= plot.x + plot.width || y < plot.y || y >= plot.y + plot.height) return null;
  const along = vertical ? (y - plot.y) / plot.height : (x - plot.x) / plot.width;
  return Math.min(count - 1, Math.floor(along * count));
}

export function cursorBox(plot: Plot, count: number, vertical: boolean, index: number): Box {
  if (vertical) {
    const band = plot.height / count;
    return { left: plot.x, top: plot.y + band * index, width: plot.width, height: band };
  }
  const band = plot.width / count;
  return { left: plot.x + band * index, top: plot.y, width: band, height: plot.height };
}

export function tooltipPlace(x: number, y: number, width: number, height: number) {
  const right = x > width / 2;
  const below = y < height / 2;
  return {
    left: right ? x - GAP : x + GAP,
    top: below ? y + GAP : y - GAP,
    transform: `translate(${right ? "-100%" : "0"}, ${below ? "0" : "-100%"})`,
  };
}
