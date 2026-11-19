"use client";

import { useEffect, useRef, useState } from "react";
import { canvasPixels, centreCrop } from "@/lib/cover-canvas";
import { sizedCover } from "@/lib/cover-size";
import { useCanvasCovers } from "./canvas-covers";

const SLICE_MS = 6;
const PAUSE_MS = 16;
let line: Promise<unknown> = Promise.resolve();
let sliceStart = 0;

function inTurn<T>(work: () => Promise<T>): Promise<T> {
  const turn = line.then(async () => {
    if (performance.now() - sliceStart > SLICE_MS) {
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
      sliceStart = performance.now();
    }
    return work();
  });
  line = turn.catch(() => undefined);
  return turn;
}

async function draw(canvas: HTMLCanvasElement, url: string, shown: number, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`cover ${response.status}`);
  const blob = await response.blob();
  await inTurn(() => paint(canvas, blob, shown, signal));
}

async function paint(canvas: HTMLCanvasElement, blob: Blob, shown: number, signal: AbortSignal) {
  if (signal.aborted) return;
  const picture = await createImageBitmap(blob);
  const pixels = canvasPixels(shown, window.devicePixelRatio);
  let scaled: ImageBitmap | null = null;
  try {
    const crop = centreCrop(picture.width, picture.height);
    scaled = await createImageBitmap(picture, crop.x, crop.y, crop.width, crop.height, {
      resizeWidth: pixels,
      resizeHeight: pixels,
      resizeQuality: "high",
    });
    if (signal.aborted) return;
    canvas.width = pixels;
    canvas.height = pixels;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.drawImage(scaled, 0, 0);
  } finally {
    picture.close();
    scaled?.close();
  }
}

function CanvasCover({
  url,
  shown,
  className,
  lazy,
  onFail,
}: {
  url: string;
  shown: number;
  className?: string;
  lazy: boolean;
  onFail: (url: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const stop = new AbortController();
    const start = () => {
      draw(canvas, url, shown, stop.signal).catch(() => {
        if (!stop.signal.aborted) onFail(url);
      });
    };
    let watcher: IntersectionObserver | null = null;
    if (lazy && typeof IntersectionObserver === "function") {
      watcher = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          watcher?.disconnect();
          start();
        },
        { rootMargin: "300px" },
      );
      watcher.observe(canvas);
    } else {
      start();
    }
    return () => {
      watcher?.disconnect();
      stop.abort();
    };
  }, [url, shown, lazy, onFail]);

  return (
    <canvas
      ref={ref}
      className={`${className ? `${className} ` : ""}cover-canvas`}
      width={shown}
      height={shown}
      style={{ width: shown, height: shown }}
    />
  );
}

export default function CoverPicture({
  src,
  shown,
  className,
  lazy = false,
}: {
  src: string;
  shown: number;
  className?: string;
  lazy?: boolean;
}) {
  const canvas = useCanvasCovers();
  const [failed, setFailed] = useState<string | null>(null);
  const url = sizedCover(src, shown) ?? src;

  if (canvas && failed !== url) {
    return <CanvasCover key={url} url={url} shown={shown} className={className} lazy={lazy} onFail={setFailed} />;
  }
  return (
    <img className={className} src={url} alt="" width={shown} height={shown} loading={lazy ? "lazy" : undefined} />
  );
}
