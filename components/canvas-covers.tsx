"use client";

import { createContext, type ReactNode, useContext, useSyncExternalStore } from "react";

declare global {
  interface Window {
    soundscapeCanvasCovers?: boolean;
  }
}

const CanvasCovers = createContext(false);
const never = () => () => {};

export function CanvasCoversProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <CanvasCovers.Provider value={value}>{children}</CanvasCovers.Provider>;
}

export function useCanvasCovers() {
  const fromServer = useContext(CanvasCovers);
  return useSyncExternalStore(
    never,
    () => fromServer || window.soundscapeCanvasCovers === true,
    () => fromServer,
  );
}
