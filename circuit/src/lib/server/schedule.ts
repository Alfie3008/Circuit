/**
 * Server timers: which "every X minutes" and "at time" scripts are due. The
 * server's cron calls this about once a minute, so both tolerate a late tick.
 */
import type { Program } from "@/lib/ir";
import type { CircuitEvent } from "@/lib/runtime/events";
import type { RunMeta } from "./types";

/** An "at time" script still fires if the tick comes up to this late. */
const AT_TIME_GRACE_MIN = 10;
/** Cron ticks drift a few seconds; count an interval as due slightly early. */
const EARLY_MS = 5_000;

/** Local date and minute-of-day in a time zone (falls back to UTC). */
export function localClock(now: number, timezone: string): { day: string; minute: number; hhmm: string } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  } catch {
    return localClock(now, "UTC");
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const h = Number(get("hour"));
  const m = Number(get("minute"));
  return { day: `${get("year")}-${get("month")}-${get("day")}`, minute: h * 60 + m, hhmm: `${get("hour")}:${get("minute")}` };
}

/** "9:05", "09:05" → minute of day; null if not a time. */
export function parseHhmm(text: unknown): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(text ?? ""));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** Due timer events; updates `meta` (lastTick, firedOn) for the ones returned. */
export function timerEvents(program: Program, meta: RunMeta, now: number, timezone: string): CircuitEvent[] {
  const events: CircuitEvent[] = [];
  const since = meta.liveSince ?? now;
  const clock = localClock(now, timezone);
  const minutesSeen = new Set<number>();

  program.scripts.forEach((s, i) => {
    const hat = s.event;
    if (hat.disabled) return;

    if (hat.type === "every_minutes") {
      const m = Number(hat.minutes);
      if (!(m >= 1) || minutesSeen.has(m)) return;
      minutesSeen.add(m);
      const last = meta.lastTick[m] ?? since;
      if (now - last >= m * 60_000 - EARLY_MS) {
        meta.lastTick[m] = now;
        events.push({ type: "tick", source: "schedule", timestamp: now, data: { minutes: m } });
      }
    }

    if (hat.type === "at_time") {
      const target = parseHhmm(hat.time);
      const key = hat.id ?? `script${i}`;
      if (target === null || meta.firedOn[key] === clock.day) return;
      const late = clock.minute - target;
      // Due now (or a few minutes late), and not before the project went live.
      if (late >= 0 && late <= AT_TIME_GRACE_MIN && now - late * 60_000 >= since - 60_000) {
        meta.firedOn[key] = clock.day;
        events.push({ type: "time", source: "schedule", timestamp: now, data: { time: String(hat.time).trim() } });
      }
    }
  });
  return events;
}
