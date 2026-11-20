"use client";

import { useEffect, useState } from "react";

const ENTRANCE_MS = 300;
let entered = false;

export function useBarEntrance(shown: boolean) {
  const [settled, setSettled] = useState(() => entered);
  useEffect(() => {
    if (!shown || settled) return;
    entered = true;
    const timer = setTimeout(() => setSettled(true), ENTRANCE_MS);
    return () => clearTimeout(timer);
  }, [shown, settled]);
  return settled ? " player-settled" : "";
}
