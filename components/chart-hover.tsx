"use client";

import {
  createContext,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePlotArea } from "recharts";
import { cursorBox, hoveredIndex, type Plot, samePlot, tooltipPlace } from "@/lib/chart-hover";

const PlotContext = createContext<(plot: Plot) => void>(() => {});

export function PlotReport() {
  const report = useContext(PlotContext);
  const plot = usePlotArea();
  const x = plot?.x;
  const y = plot?.y;
  const width = plot?.width;
  const height = plot?.height;
  useEffect(() => {
    if (x === undefined || y === undefined || width === undefined || height === undefined) return;
    report({ x, y, width, height });
  }, [report, x, y, width, height]);
  return null;
}

type Hover = { index: number; x: number; y: number; width: number; height: number };

export default function ChartHover({
  count,
  vertical = false,
  tooltip,
  children,
}: {
  count: number;
  vertical?: boolean;
  tooltip: (index: number) => ReactNode;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [plot, setPlot] = useState<Plot | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const report = useCallback((next: Plot) => setPlot((before) => (samePlot(before, next) ? before : next)), []);

  function follow(event: PointerEvent<HTMLDivElement>) {
    const frame = box.current?.getBoundingClientRect();
    if (!frame || !plot) return;
    const x = event.clientX - frame.left;
    const y = event.clientY - frame.top;
    const index = hoveredIndex(plot, count, vertical, x, y);
    setHover((before) => {
      if (index === null) return null;
      if (before && before.index === index && before.x === x && before.y === y) return before;
      return { index, x, y, width: frame.width, height: frame.height };
    });
  }

  const content = hover ? tooltip(hover.index) : null;
  return (
    <div
      ref={box}
      className="chart-hover"
      onPointerMove={follow}
      onPointerDown={follow}
      onPointerLeave={() => setHover(null)}
    >
      {hover && plot && <div className="chart-cursor" style={cursorBox(plot, count, vertical, hover.index)} />}
      <PlotContext.Provider value={report}>{children}</PlotContext.Provider>
      {hover && content && (
        <div
          className="chart-tooltip chart-tooltip-floating"
          style={tooltipPlace(hover.x, hover.y, hover.width, hover.height)}
        >
          {content}
        </div>
      )}
    </div>
  );
}
