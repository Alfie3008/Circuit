"use client";

import { useState } from "react";
import type { Agent, Receipt, RuntimeState } from "@/lib/runtime/state";
import { useRuntimeStore } from "@/store/runtime";
import { artFor, clock, num, runNo, show } from "./format";

const mono = "font-mono text-[11px] tracking-[0.12em]";

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-[10px] border border-dashed border-[#2a2c31] p-6 text-center text-[13px] leading-relaxed text-[#5d6066]">
      {children}
    </div>
  );
}

function Head({ left, right }: { left: string; right?: string }) {
  return (
    <div className={`mb-3 flex justify-between ${mono} text-muted`}>
      <span>{left}</span>
      {right && <span>{right}</span>}
    </div>
  );
}

function Portrait({ agent }: { agent: Agent }) {
  if (agent.visual.mode === "emoji" && agent.visual.value) return <span className="text-[30px] leading-[46px]">{agent.visual.value}</span>;
  if (agent.visual.mode === "image" && /^https?:/.test(agent.visual.value))
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={agent.visual.value} alt="" className="h-[46px] w-[46px] rounded object-cover" />;
  return <pre className="m-0 flex h-[46px] items-center font-mono text-[11px] leading-[1.15] text-[oklch(0.85_0.08_300)]">{artFor(agent.species)}</pre>;
}

export function WorldPanel({ state }: { state: RuntimeState }) {
  const agents = state.agents.filter((a) => a.inWorld);
  const count = agents.length + state.entities.length;
  return (
    <>
      <Head left="WORLD" right={`${count} ${count === 1 ? "ENTITY" : "ENTITIES"}`} />
      {count === 0 ? (
        <Empty>Empty. Entities and agents your program adds to the world appear here.</Empty>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2">
          {agents.map((a) => (
            <div key={a.id} className="rounded-[10px] border border-[#2a2d33] bg-raised p-2.5">
              <Portrait agent={a} />
              <p className="mt-2 text-[14px] font-medium">{a.name}</p>
              <p className="truncate text-[12px] text-muted">
                {a.species}
                {Object.keys(a.custom).length ? ` · ${show(Object.values(a.custom)[0], state)}` : ""}
              </p>
            </div>
          ))}
          {state.entities.map((e) => (
            <div key={e.id} className="rounded-[10px] border border-[#2a2d33] bg-raised p-2.5">
              <span className="rounded-[3px] border border-[oklch(0.5_0.06_140)] px-1 font-mono text-[9.5px] leading-[13px] text-[oklch(0.8_0.09_140)]">
                {e.type.toUpperCase()}
              </span>
              <p className="mt-2 text-[14px] font-medium">{e.name}</p>
              <p className="line-clamp-2 text-[12px] text-muted">
                {Object.entries(e.props)
                  .map(([k, v]) => `${k} ${show(v, state)}`)
                  .join(" · ") || (e.image ? "has image" : "")}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Rows({ title, rows, tag }: { title: string; rows: [string, string][]; tag?: string }) {
  if (!rows.length) return null;
  return (
    <section className="mb-4">
      <div className={`mb-1 flex justify-between ${mono} text-dim`}>
        <span>{title}</span>
        {tag && <span className="text-[oklch(0.88_0.13_80)]/80">{tag}</span>}
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-[#1a1c1f] py-1.5 font-mono text-[12.5px]">
          <span className="shrink-0 text-var">{k}</span>
          <span className="truncate text-right text-fg">{v}</span>
        </div>
      ))}
    </section>
  );
}

export function StatePanel({ state }: { state: RuntimeState }) {
  const reset = useRuntimeStore((s) => s.resetState);
  const vars = Object.entries(state.variables).map(([k, v]) => [k, show(v, state)] as [string, string]);
  return (
    <div className="flex flex-col">
      <Head left="STATE INSPECTOR" right={`${state.executionCount} RUNS`} />
      {vars.length ? <Rows title="VARIABLES" rows={vars} /> : <p className="mb-4 text-[13px] text-[#5d6066]">No variables set yet.</p>}
      <Rows
        title="TREASURY"
        tag="SIMULATED"
        rows={[
          ["SOL", num(state.treasury.SOL)],
          ["USDC", num(state.treasury.USDC, 2)],
          ...Object.entries(state.budgets).map(([k, v]) => [`budget ${k}`, `${num(v)} SOL`] as [string, string]),
        ]}
      />
      <Rows title="PORTFOLIO" tag="SIMULATED" rows={Object.entries(state.portfolio).map(([k, v]) => [k, `${num(v)}`])} />
      <Rows
        title="MARKET"
        tag="SIMULATED"
        rows={[
          ["totalVolume", `${num(state.market.totalVolume)} SOL`],
          ["marketCap", `$${Math.round(state.market.marketCap).toLocaleString()}`],
          ["holders", String(state.market.holders)],
          ["trades", String(state.market.trades)],
        ]}
      />
      <Rows title="COUNTERS" rows={Object.entries(state.counters).map(([k, v]) => [k, num(v)])} />
      <Rows title="COLLECTIONS" rows={Object.entries(state.collections).map(([k, v]) => [k, `${v.length} items`])} />
      <Rows title="WEBSITE" rows={Object.entries(state.website).map(([k, v]) => [k, show(v, state)])} />
      <Rows
        title="BOUNTIES"
        rows={state.bounties.map((b) => [b.title, `${b.status} · ${b.submissions.length} subs · ${num(b.reward)} SOL`] as [string, string])}
      />
      <button
        onClick={() => {
          if (confirm("Reset runtime state? Variables, agents, world, feed, treasury and receipts go back to the start. Your blocks are not touched."))
            reset();
        }}
        className="mt-2 self-start rounded-md border border-line-2 px-2.5 py-1 font-mono text-[11px] tracking-[0.06em] text-dim hover:border-err/60 hover:text-err"
      >
        RESET STATE
      </button>
    </div>
  );
}

export function AgentsPanel({ state }: { state: RuntimeState }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <Head left="AGENTS" right={`${state.agents.length} PERSISTENT`} />
      {state.agents.length === 0 ? (
        <Empty>No agents yet. CREATE AGENT makes one, and it persists between runs.</Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {[...state.agents].reverse().map((a) => (
            <div key={a.id} className="rounded-[10px] border border-[#2a2d33] bg-raised">
              <button onClick={() => setOpen(open === a.id ? null : a.id)} className="flex w-full items-center gap-3 p-2.5 text-left">
                <Portrait agent={a} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium">{a.name}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {a.species} · {a.personality || "no personality"}
                  </span>
                </span>
                <span className="font-mono text-[10.5px] text-faint">{a.id}</span>
              </button>
              {open === a.id && (
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-dashed border-[#30333a] px-3 py-2.5 font-mono text-[11.5px]">
                  {(
                    [
                      ["identity", a.identity || "—"],
                      ["goal", a.goal || "—"],
                      ["model", a.model],
                      ["budget", num(a.budget)],
                      ["score", num(a.score)],
                      ["in world", a.inWorld ? "yes" : "no"],
                      ["tools", a.tools.join(", ") || "—"],
                      ["inventory", show(a.inventory, state) || "—"],
                      ["memory", a.memoryEnabled ? `${a.memory.length} items` : "off"],
                      ...Object.entries(a.custom).map(([k, v]) => [k, show(v, state)]),
                    ] as [string, string][]
                  ).map(([k, v]) => (
                    <div key={k} className="contents">
                      <span className="uppercase tracking-[0.08em] text-dim">{k}</span>
                      <span className="break-words text-fg-2">{v}</span>
                    </div>
                  ))}
                  <span className="col-span-2 mt-2 uppercase tracking-[0.08em] text-dim">history</span>
                  {a.history.slice(-5).map((h, i) => (
                    <span key={i} className="col-span-2 text-fg-2">
                      <span className="text-faint">{clock(h.at)}</span> {h.text}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function FeedPanel({ state }: { state: RuntimeState }) {
  return (
    <>
      <Head left="FEED" right={`${state.feed.length} POSTS`} />
      {state.feed.length === 0 ? (
        <Empty>Nothing posted yet. UPDATE PROJECT FEED and SHOW NOTIFICATION write here.</Empty>
      ) : (
        <div className="flex flex-col">
          {[...state.feed].reverse().map((f, i) => (
            <div key={i} className="border-b border-[#1a1c1f] py-2.5">
              <p className="text-[14px] leading-snug">{f.text}</p>
              <p className="mt-1 font-mono text-[11px] text-faint">
                {clock(f.at)} · {runNo(f.run)}
                {f.kind === "notify" && <span className="ml-2 text-[oklch(0.88_0.13_80)]/80">NOTIFICATION</span>}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const statusTone = (s: Receipt["status"]) => (s === "complete" ? "text-ok" : s === "running" ? "text-signal" : s === "stopped" ? "text-muted" : "text-err");
const statusWord = (s: Receipt["status"]) => (s === "step_limit" ? "STEP LIMIT" : s.toUpperCase());

function ReceiptCard({ r }: { r: Receipt }) {
  const entries = r.entries;
  return (
    <div className="overflow-hidden rounded-xl border border-[#2a2d33] bg-[#121315] font-mono text-[12.5px]">
      <div className="flex justify-between border-b border-dashed border-[#2f3237] px-4 py-3 text-[11px] tracking-[0.12em]">
        <span>EXECUTION {String(r.id).padStart(4, "0")}</span>
        <span className="text-dim">{clock(r.startedAt)}</span>
      </div>
      <div className="px-4 py-2">
        {entries.map((e, i) => (
          <div key={i} className="py-1.5">
            <div className={`flex gap-3 ${e.status === "error" ? "text-err" : e.status === "skipped" ? "text-dim" : ""}`}>
              <span className="text-faint">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1 break-words">{e.text}</span>
              {e.simulated && <span className="shrink-0 text-[10px] tracking-[0.1em] text-[oklch(0.88_0.13_80)]/80">SIMULATED</span>}
            </div>
            {e.details.map((d, j) => (
              <p key={j} className="break-words pl-7 text-[11.5px] text-dim">
                {d}
              </p>
            ))}
          </div>
        ))}
      </div>
      <div className={`flex justify-between border-t border-dashed border-[#2f3237] px-4 py-3 text-[11px] tracking-[0.12em] ${statusTone(r.status)}`}>
        <span>{statusWord(r.status)}</span>
        <span>
          {r.steps} {r.steps === 1 ? "STEP" : "STEPS"}
        </span>
      </div>
    </div>
  );
}

export function RunsPanel({ state }: { state: RuntimeState }) {
  const [open, setOpen] = useState<number | null>(null);
  const runs = [...state.runs].reverse();
  return (
    <>
      <Head left="RECEIPTS" right={`${state.executionCount} TOTAL`} />
      {runs.length === 0 ? (
        <Empty>Every execution leaves a receipt listing each thing it did. Press Run to make one.</Empty>
      ) : (
        <div className="flex flex-col gap-1.5">
          {runs.map((r) =>
            open === r.id || (open === null && r === runs[0]) ? (
              <button key={r.id} onClick={() => setOpen(open === r.id ? -1 : r.id)} className="text-left">
                <ReceiptCard r={r} />
              </button>
            ) : (
              <button
                key={r.id}
                onClick={() => setOpen(r.id)}
                className="flex items-center gap-3 rounded-lg border border-[#23252a] px-3 py-2 text-left font-mono text-[12px] hover:bg-white/[0.03]"
              >
                <span className="text-dim">{runNo(r.id)}</span>
                <span className="min-w-0 flex-1 truncate text-fg-2">{r.event.label}</span>
                <span className={`text-[10.5px] tracking-[0.08em] ${statusTone(r.status)}`}>{statusWord(r.status)}</span>
              </button>
            ),
          )}
        </div>
      )}
    </>
  );
}
