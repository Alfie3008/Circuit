"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";
import { XIcon } from "@/components/ui/icons";
import { CATEGORIES } from "@/lib/blocks/categories";
import { resolveSpec, type IRNode, type Program } from "@/lib/ir";
import type { ProjectSetup } from "@/lib/project/storage";
import { TEMPLATES } from "@/lib/templates";
import { hueColour } from "@/lib/ui/colour";
import { useProjectStore } from "@/store/project";

function Modal({ title, onClose, children, width = 760 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.15 }}
        style={{ width }}
        className="flex max-h-[88vh] max-w-full flex-col overflow-hidden rounded-[14px] border border-[#23252a] bg-panel shadow-2xl shadow-black/60"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-mono text-[12px] tracking-[0.14em] text-muted">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-dim hover:text-fg">
            <XIcon width={14} height={14} />
          </button>
        </header>
        <div className="overflow-y-auto p-5">{children}</div>
      </motion.div>
    </div>
  );
}

/** Category tags of the blocks a program uses, in order of first use. */
function tagsOf(program: Program) {
  const cats: string[] = [];
  const visit = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(visit);
    const node = n as IRNode;
    const spec = typeof node.type === "string" ? resolveSpec(node) : undefined;
    if (spec && !cats.includes(spec.category)) cats.push(spec.category);
    Object.values(node).forEach(visit);
  };
  program.scripts.forEach((s) => {
    visit(s.event);
    visit(s.body);
  });
  return cats.map((id) => CATEGORIES.find((c) => c.id === id)!).filter(Boolean);
}

export function TemplatePicker() {
  const close = () => useProjectStore.getState().openDialog(null);
  const create = useProjectStore((s) => s.newFromTemplate);
  const card = "flex flex-col gap-3 rounded-xl border border-[#2a2d33] bg-raised p-4 text-left transition-colors hover:border-signal/50";
  return (
    <Modal title="NEW PROJECT" onClose={close}>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        <button className={card} onClick={() => create(null)}>
          <span className="font-mono text-[12px] tracking-[0.08em] text-muted">BLANK</span>
          <span className="text-[14px] text-fg-2">Start from an empty canvas.</span>
        </button>
        {TEMPLATES.map((t) => (
          <button key={t.id} className={card} onClick={() => create(t.id)}>
            <span className="text-[16px] font-medium">{t.name}</span>
            <span className="text-[13px] leading-snug text-fg-2">{t.description}</span>
            <span className="mt-auto flex flex-wrap gap-1">
              {tagsOf(t.program).map((c) => (
                <span
                  key={c.id}
                  className="rounded-[3px] border px-1 font-mono text-[9.5px] leading-[13px]"
                  style={{ color: hueColour(c.hue), borderColor: hueColour(c.hue, 0.5, 0.06) }}
                >
                  {c.code}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-[12.5px] text-dim">Templates are ordinary blocks: change anything after you open one.</p>
    </Modal>
  );
}

const field = "h-8 w-full rounded-md border border-line-2 bg-canvas px-2.5 font-mono text-[12.5px] text-fg placeholder:text-faint focus:border-signal/60 focus:outline-none";
const label = "mb-1 block font-mono text-[10.5px] tracking-[0.12em] text-dim";

const MODES: { id: ProjectSetup["launchMode"]; name: string; text: string }[] = [
  { id: "prototype", name: "Prototype only", text: "No token. Everything runs on simulated events." },
  { id: "existing", name: "Existing token", text: "Watch a token that already exists, funded by a separate execution budget." },
  { id: "launch", name: "Launch with Circuit", text: "Preview of a future launch where creator fees go to the project treasury." },
];

export function SetupDialog() {
  const setup = useProjectStore((s) => s.setup);
  const update = useProjectStore((s) => s.updateSetup);
  const close = () => useProjectStore.getState().openDialog(null);

  return (
    <Modal title="PROJECT SETUP" onClose={close} width={620}>
      <p className="mb-4 text-[13px] leading-relaxed text-fg-2">
        How this project relates to a token. This is fixed at birth: it&apos;s configuration, not something blocks can change.
      </p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Launch mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={setup.launchMode === m.id}
            onClick={() => update({ launchMode: m.id })}
            className={`rounded-xl border p-3 text-left transition-colors ${
              setup.launchMode === m.id ? "border-signal/60 bg-signal/[0.06]" : "border-[#2a2d33] bg-raised hover:border-line-2"
            }`}
          >
            <span className="block text-[14px] font-medium">{m.name}</span>
            <span className="mt-1 block text-[12px] leading-snug text-muted">{m.text}</span>
          </button>
        ))}
      </div>

      {setup.launchMode === "existing" && (
        <div className="mt-5 flex flex-col gap-3">
          <div>
            <label className={label} htmlFor="tok">TOKEN MINT ADDRESS</label>
            <input id="tok" className={field} value={setup.tokenAddress} placeholder="e.g. 7xKX…" onChange={(e) => update({ tokenAddress: e.target.value.trim() })} />
          </div>
          <div>
            <label className={label} htmlFor="wal">WALLET TO WATCH (OPTIONAL)</label>
            <input id="wal" className={field} value={setup.walletAddress} placeholder="Creator or treasury wallet" onChange={(e) => update({ walletAddress: e.target.value.trim() })} />
          </div>
          <div className="flex gap-5 font-mono text-[12px] text-fg-2">
            {(["trades", "volume", "wallet"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" checked={setup.monitor[k]} onChange={(e) => update({ monitor: { ...setup.monitor, [k]: e.target.checked } })} className="accent-[var(--color-signal)]" />
                monitor {k}
              </label>
            ))}
          </div>
          <div className="w-48">
            <label className={label} htmlFor="bud">EXECUTION BUDGET (SOL)</label>
            <input id="bud" type="number" min={0} step={0.1} className={field} value={setup.executionBudget} onChange={(e) => update({ executionBudget: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
          <p className="rounded-lg border border-signal/30 bg-signal/[0.06] p-3 text-[13px] leading-relaxed text-[oklch(0.9_0.08_80)]">
            <strong className="font-medium">Creator-fee routing depends on the token&apos;s existing configuration and is not automatically changed by Circuit.</strong> The
            program runs on the separately funded execution budget above.
          </p>
          <p className="text-[12px] text-dim">Live read-only monitoring of this token arrives in Phase 6 (Helius). Until then, use the simulator.</p>
        </div>
      )}

      {setup.launchMode === "launch" && (
        <div className="mt-5 flex flex-col gap-3">
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <div>
              <label className={label} htmlFor="tn">TOKEN NAME</label>
              <input id="tn" className={field} value={setup.tokenName} placeholder="My Coin" onChange={(e) => update({ tokenName: e.target.value })} />
            </div>
            <div>
              <label className={label} htmlFor="ts">SYMBOL</label>
              <input id="ts" className={field} value={setup.tokenSymbol} placeholder="COIN" onChange={(e) => update({ tokenSymbol: e.target.value.toUpperCase().slice(0, 10) })} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-line-2 bg-canvas px-4 py-3 font-mono text-[12px]">
            <span className="text-dim">CREATOR FEE DESTINATION</span>
            <span className="text-[oklch(0.88_0.13_80)]">Circuit Project Treasury</span>
          </div>
          <div className="flex items-center justify-center gap-3 py-2 font-mono text-[11.5px] tracking-[0.08em] text-fg-2">
            <span className="rounded border border-line-2 px-2 py-1">{setup.tokenSymbol || "TOKEN"}</span>→
            <span className="rounded border border-line-2 px-2 py-1">PROJECT TREASURY</span>→
            <span className="rounded border border-signal/50 px-2 py-1 text-[oklch(0.88_0.13_80)]">CIRCUIT PROGRAM</span>
          </div>
          <p className="text-[12px] text-dim">Prototype: no token is launched. Fees in the simulator (the Fees button) land in the simulated treasury, as they would here.</p>
        </div>
      )}
    </Modal>
  );
}

export function Dialogs() {
  const dialog = useProjectStore((s) => s.dialog);
  if (dialog === "templates") return <TemplatePicker />;
  if (dialog === "setup") return <SetupDialog />;
  return null;
}
