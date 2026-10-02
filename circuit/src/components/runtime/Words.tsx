import type { Part } from "@/lib/explain/explain";

/** A plain-English sentence, with values, variables and events as pills. */
export function Words({ parts }: { parts: Part[] }) {
  return (
    <>
      {parts.map((p, i) =>
        "text" in p ? (
          <span key={i}>{p.text} </span>
        ) : (
          <span
            key={i}
            className={`mr-1 inline-block rounded-full border px-1.5 font-mono text-[12px] leading-[19px] ${
              p.kind === "var"
                ? "border-[oklch(0.42_0.05_235)] bg-[oklch(0.29_0.035_235)] text-var"
                : p.kind === "event"
                  ? "border-ok/40 text-ok"
                  : "border-line-2 bg-canvas text-fg"
            }`}
          >
            {p.value}
          </span>
        ),
      )}
    </>
  );
}
