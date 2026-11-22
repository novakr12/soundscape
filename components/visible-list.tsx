"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { measuredHeight, type RowWindow, visibleRows } from "@/lib/visible-rows";

const FIRST_ITEMS = 30;
const SPARE_ITEMS = 12;
const GUESSED_HEIGHT = 56;

function findScrollParent(node: HTMLElement | null): HTMLElement | null {
  let parent = node?.parentElement ?? null;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const overflowY = getComputedStyle(parent).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return parent;
    parent = parent.parentElement;
  }
  return null;
}

export default function VisibleList<T>({
  as = "ol",
  className,
  start: listStart,
  items,
  renderItem,
  guessedHeight = GUESSED_HEIGHT,
  firstItems = FIRST_ITEMS,
  spare = SPARE_ITEMS,
}: {
  as?: "ol" | "ul";
  className?: string;
  start?: number;
  items: readonly T[];
  renderItem: (item: T, index: number) => ReactNode;
  guessedHeight?: number;
  firstItems?: number;
  spare?: number;
}) {
  const count = items.length;
  const above = useRef<HTMLLIElement>(null);
  const below = useRef<HTMLLIElement>(null);
  const [view, setView] = useState<RowWindow & { height: number }>({
    start: 0,
    end: Math.min(count, firstItems),
    height: guessedHeight,
  });

  useEffect(() => {
    let frame = 0;
    const container = findScrollParent(above.current?.parentElement ?? null);
    const update = () => {
      frame = 0;
      const top = above.current;
      const bottom = below.current;
      if (!top || !bottom) return;
      setView((current) => {
        const drawn = bottom.getBoundingClientRect().top - top.getBoundingClientRect().bottom;
        const height = measuredHeight(drawn, current.end - current.start, current.height);
        const containerTop = container ? container.getBoundingClientRect().top : 0;
        const viewport = container ? container.clientHeight : window.innerHeight;
        const listTop = top.getBoundingClientRect().top - containerTop;
        const next = visibleRows({
          count,
          rowHeight: height,
          listTop,
          viewport,
          spare,
        });
        if (next.start === current.start && next.end === current.end && height === current.height) return current;
        return { ...next, height };
      });
    };
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    const scrollTarget: EventTarget = container ?? window;
    scrollTarget.addEventListener("scroll", soon, { passive: true });
    window.addEventListener("resize", soon);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      scrollTarget.removeEventListener("scroll", soon);
      window.removeEventListener("resize", soon);
    };
  }, [count, spare]);

  const start = Math.min(view.start, count);
  const end = Math.min(Math.max(view.end, start), count);
  const Tag = as;

  return (
    <Tag className={className} start={as === "ol" ? listStart : undefined}>
      <li ref={above} className="row-gap" aria-hidden="true" style={{ height: start * view.height }} />
      {items.slice(start, end).map((item, offset) => renderItem(item, start + offset))}
      <li ref={below} className="row-gap" aria-hidden="true" style={{ height: (count - end) * view.height }} />
    </Tag>
  );
}
