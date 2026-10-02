"use client";

import { useEffect, useState } from "react";

/** HH:MM:SS in UTC, ticking. Blank until mounted (no server/client mismatch). */
export function UtcClock() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setT(new Date().toISOString().slice(11, 19));
    const id = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, []);
  return <span suppressHydrationWarning>{t ?? "--:--:--"}</span>;
}
