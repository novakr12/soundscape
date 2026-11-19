"use client";

import { useEffect, useRef, useState } from "react";

export default function TrendLine({ shares }: { shares: number[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(element);
    return () => watcher.disconnect();
  }, []);

  const { width, height } = size;
  const points = shares
    .map(
      (share, index) =>
        `${(((index + 0.5) / shares.length) * width).toFixed(1)},${(height - (share / 100) * height).toFixed(1)}`,
    )
    .join(" ");
  return (
    <div ref={box} className="trend-line" aria-hidden="true">
      {width > 0 && height > 0 && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          <polyline
            points={points}
            fill="none"
            stroke="var(--chart-axis)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}
