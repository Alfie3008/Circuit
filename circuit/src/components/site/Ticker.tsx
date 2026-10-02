const ITEMS: [string, string, string][] = [
  ["#0042", "living-crew", "Agent Mochi created · penguin"],
  ["#0187", "web-explorer", "Finding saved · “lighthouses for sale”"],
  ["#0311", "shopper", "Purchased tiny cactus · 0.6 SOL"],
  ["#0093", "creator-engine", "Bounty #7 rewarded · 0.2 SOL"],
  ["#0044", "diary", "Juniper wrote an entry"],
  ["#0520", "holders-100", "Webhook sent · 200 OK"],
  ["#0612", "shopper", "Stopped · insufficient budget"],
  ["#0058", "living-crew", "Agent Pickle created · otter"],
];

/** Scrolling strip of example runs. (Sample data until there's a public runs feed.) */
export function Ticker({ items = ITEMS }: { items?: [string, string, string][] }) {
  const row = (key: string) => (
    <div key={key} className="flex shrink-0 gap-10 pr-10" aria-hidden={key === "b"}>
      {items.map(([n, project, text], i) => (
        <span key={i} className="inline-flex items-center gap-2.5 whitespace-nowrap font-mono text-[12px] text-muted">
          <span className={`h-[5px] w-[5px] rounded-[3px] ${/Stopped/.test(text) ? "bg-err" : "bg-ok"}`} />
          <span className="text-faint">{n}</span>
          <span className="text-fg-2">{project}</span>
          <span>{text}</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="w-full overflow-hidden">
      <div className="flex w-max animate-[cxMarquee_60s_linear_infinite] motion-reduce:animate-none">{[row("a"), row("b")]}</div>
    </div>
  );
}
