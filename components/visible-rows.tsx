"use client";

import { Children, type ReactNode, useEffect, useRef, useState } from "react";
import { measuredHeight, type RowWindow, visibleRows } from "@/lib/visible-rows";

const FIRST_ROWS = 30;
const SPARE_ROWS = 12;
const GUESSED_HEIGHT = 56;

type Props<T> =
  | { columns: number; items: readonly T[]; renderRow: (item: T, index: number) => ReactNode; children?: never }
  | { columns: number; children: ReactNode; items?: never; renderRow?: never };

export default function VisibleRows<T>({ columns, items, renderRow, children }: Props<T>) {
  const rows = items ? null : Children.toArray(children);
  const count = items ? items.length : rows!.length;
  const above = useRef<HTMLTableRowElement>(null);
  const below = useRef<HTMLTableRowElement>(null);
  const [view, setView] = useState<RowWindow & { height: number }>({
    start: 0,
    end: Math.min(count, FIRST_ROWS),
    height: GUESSED_HEIGHT,
  });

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = above.current;
      const bottom = below.current;
      if (!top || !bottom) return;
      setView((current) => {
        const drawn = bottom.getBoundingClientRect().top - top.getBoundingClientRect().bottom;
        const height = measuredHeight(drawn, current.end - current.start, current.height);
        const listTop = top.getBoundingClientRect().top;
        const next = visibleRows({
          count,
          rowHeight: height,
          listTop,
          viewport: window.innerHeight,
          spare: SPARE_ROWS,
        });
        if (next.start === current.start && next.end === current.end && height === current.height) return current;
        return { ...next, height };
      });
    };
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", soon, { capture: true, passive: true });
    window.addEventListener("resize", soon);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", soon, { capture: true });
      window.removeEventListener("resize", soon);
    };
  }, [count]);

  const start = Math.min(view.start, count);
  const end = Math.min(Math.max(view.end, start), count);
  const visible =
    items && renderRow
      ? items.slice(start, end).map((item, offset) => renderRow(item, start + offset))
      : rows!.slice(start, end);

  return (
    <>
      <tr ref={above} className="row-gap">
        <td colSpan={columns} style={{ height: start * view.height }} />
      </tr>
      {visible}
      <tr ref={below} className="row-gap">
        <td colSpan={columns} style={{ height: (count - end) * view.height }} />
      </tr>
    </>
  );
}
