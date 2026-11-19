"use client";

import { type PointerEvent, type ReactNode, useRef, useState } from "react";
import { type Box, cursorBox, hoveredIndex, tooltipPlace } from "@/lib/chart-hover";

type Hover = { index: number; x: number; y: number; width: number; height: number; cursor: Box };

export default function ChartHover({
  count,
  vertical = false,
  tips,
  children,
}: {
  count: number;
  vertical?: boolean;
  tips: ReactNode[];
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  function follow(event: PointerEvent<HTMLDivElement>) {
    const frame = box.current?.getBoundingClientRect();
    const area = box.current?.querySelector(".chart-plot")?.getBoundingClientRect();
    if (!frame || !area) return;
    const plot = { x: area.left - frame.left, y: area.top - frame.top, width: area.width, height: area.height };
    const x = event.clientX - frame.left;
    const y = event.clientY - frame.top;
    const index = hoveredIndex(plot, count, vertical, x, y);
    setHover((before) => {
      if (index === null) return null;
      if (before && before.index === index && before.x === x && before.y === y) return before;
      return { index, x, y, width: frame.width, height: frame.height, cursor: cursorBox(plot, count, vertical, index) };
    });
  }

  const content = hover ? tips[hover.index] : null;
  return (
    <div
      ref={box}
      className="chart-hover"
      onPointerMove={follow}
      onPointerDown={follow}
      onPointerLeave={() => setHover(null)}
    >
      {hover && <div className="chart-cursor" style={hover.cursor} />}
      {children}
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
