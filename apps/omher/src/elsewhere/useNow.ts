import { useEffect, useState } from "react";
import { useVisualActivity } from "../app/visualActivity";

/** Display time only: tick while visible, read fresh immediately on restore. */
export function useNow(on: boolean, ms = 10_000): number {
  const active = useVisualActivity();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!on || !active) return;
    const h = setInterval(() => tick((n) => n + 1), ms);
    return () => clearInterval(h);
  }, [on, active, ms]);
  return Date.now();
}
