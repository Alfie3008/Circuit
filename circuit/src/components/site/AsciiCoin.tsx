"use client";

import { useEffect, useRef } from "react";

const RAMP = " .,:-=+*#%@";
const COLOURS: Record<string, string> = { d: "#5f6268", r: "#b3b5ba", e: "#8b8d93", g: "oklch(0.86 0.15 80)", b: "#23252a" };

/** A spinning coin drawn in characters. Pauses for reduced motion. */
export function AsciiCoin({ cols = 66, rows = 34, size = 11 }: { cols?: number; rows?: number; size?: number }) {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const W = cols;
    const H = rows;
    const R = 0.94;
    const D = 0.12;
    const t0 = performance.now();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const frame = () => {
      const t = reduced ? 0.6 : (performance.now() - t0) / 1000;
      const th = t * 0.8;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      let html = "";
      for (let j = 0; j < H; j++) {
        const y = ((j + 0.5) / H) * 2 - 1;
        let cur: string | null = null;
        let buf = "";
        const flush = () => {
          if (buf) html += cur ? `<span style="color:${COLOURS[cur]}">${buf}</span>` : buf;
          buf = "";
        };
        for (let i = 0; i < W; i++) {
          const x = (((i + 0.5) / W) * 2 - 1) * ((W * 0.55) / H);
          let ch = " ";
          let k: string | null = null;
          const ac = Math.abs(c);
          if (y * y <= R * R) {
            const ex = ac * Math.sqrt(R * R - y * y);
            if (ac > 0.03 && Math.abs(x) <= ex) {
              const xp = x / c;
              const r = Math.sqrt(xp * xp + y * y);
              let lum = 0.3 + 0.4 * ac + 0.3 * Math.max(0, Math.cos(xp * 2.2 - y * 0.8 + t * 1.6));
              k = "d";
              if (r > R - 0.1) {
                lum += 0.35;
                k = "r";
              }
              const xf = c > 0 ? xp : -xp;
              const ang = Math.atan2(y, xf);
              if (r > 0.36 && r < 0.62 && Math.abs(ang) > 0.8) {
                lum = 0.55 + 0.4 * ac;
                k = "g";
              }
              if (Math.abs(ang) <= 0.8 && Math.abs(r - 0.49) < 0.07 && xf > 0.3 && Math.abs(Math.abs(ang) - 0.8) < 0.12) {
                lum = 0.95;
                k = "g";
              }
              ch = RAMP[Math.max(1, Math.min(RAMP.length - 1, Math.floor(lum * (RAMP.length - 1))))];
            } else if (x * sn * c < 0 && Math.abs(x) > ex && Math.abs(x) <= ex + D * Math.abs(sn) + 0.03) {
              ch = j % 2 ? "|" : "!";
              k = "e";
            }
          }
          if (ch === " " && (i * 7 + j * 13) % 29 === 0) {
            ch = "·";
            k = "b";
          }
          if (k !== cur) {
            flush();
            cur = k;
          }
          buf += ch;
        }
        flush();
        html += "\n";
      }
      if (ref.current) ref.current.innerHTML = html;
    };
    frame();
    if (reduced) return;
    const id = setInterval(frame, 40);
    return () => clearInterval(id);
  }, [cols, rows]);

  return (
    <pre
      ref={ref}
      aria-hidden
      className="m-0 select-none whitespace-pre font-mono text-dim"
      style={{ fontSize: size, lineHeight: 1.12, letterSpacing: 0, height: rows * size * 1.12 }}
    />
  );
}
