"use client";

import { useCallback, useEffect, useState } from "react";
import { field, label, Modal } from "@/components/ui/Modal";
import { api, findWallet, shortWallet } from "@/lib/account/wallet";
import type { Program } from "@/lib/ir";
import type { ProjectSetup } from "@/lib/project/storage";
import type { RunMeta } from "@/lib/server/types";
import { useAccount } from "@/store/account";
import { useProjectStore } from "@/store/project";
import { clock } from "@/components/runtime/format";

interface Owned {
  project: { id: string; slug: string; name: string; live: boolean; aiDailyUsd: number; timezone: string; updatedAt: number; program: Program; setup: ProjectSetup };
  status: Partial<RunMeta> & { executions: number };
  aiToday: { calls: number; usd: number };
  limits: { runsPerMinute: number; projectAiMaxUsd: number };
}

interface ServerStatus {
  database: "postgres" | "file" | "memory";
  ai: boolean;
  chain: string | null;
  events: "webhooks" | "polling" | "timers only";
  cron: string;
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const btn = "h-8 rounded-md px-3 font-mono text-[12px] tracking-[0.04em] transition-colors disabled:opacity-40";
const primary = `${btn} bg-signal font-medium text-signal-ink hover:brightness-110`;
const ghost = `${btn} border border-line-2 text-fg-2 hover:bg-raised hover:text-fg`;

function SignIn() {
  const { busy, error, signIn } = useAccount();
  const wallet = typeof window !== "undefined" ? findWallet() : null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13.5px] leading-relaxed text-fg-2">
        Sign in with your Solana wallet to publish. Your wallet signs a one-time message to prove it&apos;s yours: it&apos;s free, and it can&apos;t move funds.
      </p>
      {wallet ? (
        <button onClick={() => void signIn()} disabled={busy} className={`${primary} self-start`}>
          {busy ? "Check your wallet…" : `Sign in with ${wallet.name}`}
        </button>
      ) : (
        <p className="rounded-lg border border-line-2 bg-canvas p-3 text-[13px] text-fg-2">
          No Solana wallet found in this browser.{" "}
          <a href="https://phantom.com/download" target="_blank" rel="noreferrer" className="text-[oklch(0.88_0.13_80)] hover:underline">
            Install Phantom ↗
          </a>{" "}
          and reload this page.
        </p>
      )}
      {error && <p className="text-[12.5px] text-err">{error}</p>}
    </div>
  );
}

export function PublishDialog() {
  const close = () => useProjectStore.getState().openDialog(null);
  const { wallet, refresh, signOut } = useAccount();
  const current = useProjectStore((s) => s.current);
  const program = useProjectStore((s) => s.program);
  const setup = useProjectStore((s) => s.setup);
  const [owned, setOwned] = useState<Owned | null>(null);
  const [foreign, setForeign] = useState(false);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [server, setServer] = useState<ServerStatus | null>(null);
  const [cap, setCap] = useState("");

  useEffect(() => {
    if (wallet === undefined) void refresh();
    void api<ServerStatus>("/api/server/status").then(setServer, () => {});
  }, [wallet, refresh]);

  /** Fetches the server's copy; the returned function applies it (so effects only set state in callbacks). */
  const fetchOwned = useCallback(async (): Promise<() => void> => {
    if (!wallet || !current) return () => {};
    try {
      const o = await api<Owned | { project: null }>(`/api/projects/${current.id}`);
      if (!o.project) throw Object.assign(new Error("not published"), { status: 404 });
      const owned = o as Owned;
      return () => {
        setOwned(owned);
        setSlug(owned.project.slug);
        setCap(String(owned.project.aiDailyUsd));
        setForeign(false);
        setLoading(false);
      };
    } catch (e) {
      return () => {
        setOwned(null);
        setForeign((e as { status?: number }).status === 403);
        setSlug((s) => s || slugify(setup.tokenSymbol || current.name));
        setLoading(false);
      };
    }
  }, [wallet, current, setup.tokenSymbol]);

  const load = async () => (await fetchOwned())();

  useEffect(() => {
    let alive = true;
    void fetchOwned().then((apply) => alive && apply());
    return () => {
      alive = false;
    };
  }, [fetchOwned]);

  const act = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const publish = () =>
    act("publish", async () => {
      if (!program) throw new Error("The program has an error, so it can't be published yet.");
      await api("/api/projects", {
        method: "POST",
        body: { id: current!.id, name: current!.name, slug, program, setup, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
    });
  const settings = (body: Record<string, unknown>) => api<{ webhook?: { ok: boolean; detail: string } }>(`/api/projects/${current!.id}`, { method: "PATCH", body });

  const changed = owned && program && (JSON.stringify(owned.project.program) !== JSON.stringify(program) || JSON.stringify(owned.project.setup) !== JSON.stringify(setup));
  const pageUrl = owned ? `${location.origin}/p/${owned.project.slug}` : null;
  const watches = setup.launchMode === "existing" && setup.tokenAddress;

  return (
    <Modal title="PUBLISH" onClose={close} width={600}>
      {wallet === undefined ? (
        <p className="text-[13px] text-dim">Checking sign-in…</p>
      ) : !wallet ? (
        <SignIn />
      ) : foreign ? (
        <p className="text-[13.5px] text-err">This project was published by another wallet. Duplicate it (Project menu) to publish your own copy.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-[13px] leading-relaxed text-fg-2">
            Publishing gives this project a public page: its rules in plain English, its world, and a receipt for every run, with Solscan proof for real
            events. Anyone can check what the program does.
          </p>

          <div>
            <label className={label} htmlFor="slug">PUBLIC PAGE</label>
            <div className="flex items-center gap-2">
              <span className="shrink-0 font-mono text-[12.5px] text-dim">{typeof location !== "undefined" ? location.host : ""}/p/</span>
              <input id="slug" className={field} value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="my-coin" maxLength={40} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => void publish()} disabled={!!busy || loading || slug.length < 3 || !program} className={primary}>
              {busy === "publish" ? "Publishing…" : owned ? "Update published version" : "Publish"}
            </button>
            {owned && changed && <span className="text-[12.5px] text-[oklch(0.88_0.13_80)]">You have changes that aren&apos;t published yet.</span>}
            {owned && !changed && <span className="text-[12.5px] text-ok">Published version is up to date.</span>}
            {pageUrl && (
              <a href={pageUrl} target="_blank" rel="noreferrer" className="ml-auto font-mono text-[12px] text-[oklch(0.88_0.13_80)] hover:underline">
                Open public page ↗
              </a>
            )}
          </div>

          {owned && (
            <section className="flex flex-col gap-3 rounded-xl border border-line-2 bg-canvas/60 p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-[14px] font-medium">Run on the server</p>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
                    Keeps running with this tab closed: timers on the server&apos;s clock
                    {watches ? ", and your token's real trades" : ""}. Your local simulator stays a separate sandbox.
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={owned.project.live}
                  disabled={!!busy}
                  onClick={() =>
                    void act("live", async () => {
                      const r = await settings({ live: !owned.project.live });
                      if (r.webhook && !r.webhook.ok && server?.events === "webhooks") throw new Error(`Live, but Helius wasn't updated: ${r.webhook.detail}`);
                    })
                  }
                  className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors ${owned.project.live ? "bg-ok" : "bg-line-2"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-fg transition-all ${owned.project.live ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 font-mono text-[11.5px]">
                <div className="rounded-lg border border-line px-3 py-2">
                  <span className="block text-dim">SERVER RUNS</span>
                  <span className="text-[15px] text-fg">{owned.status.executions}</span>
                </div>
                <div className="rounded-lg border border-line px-3 py-2">
                  <span className="block text-dim">LAST EVENT</span>
                  <span className="text-[15px] text-fg">{owned.status.lastEventAt ? clock(owned.status.lastEventAt) : "—"}</span>
                </div>
                <div className="rounded-lg border border-line px-3 py-2">
                  <span className="block text-dim">AI TODAY</span>
                  <span className="text-[15px] text-fg">${owned.aiToday.usd.toFixed(3)}</span>
                </div>
              </div>
              {owned.status.lastError && <p className="text-[12px] leading-snug text-err">Last problem: {owned.status.lastError}</p>}
              {!!owned.status.dropped && (
                <p className="text-[12px] leading-snug text-[oklch(0.88_0.13_80)]">
                  {owned.status.dropped} event(s) skipped: over {owned.limits.runsPerMinute} runs a minute.
                </p>
              )}

              <div className="flex flex-wrap items-end gap-3">
                <div className="w-44">
                  <label className={label} htmlFor="cap">AI SPEND CAP ($ / DAY)</label>
                  <input id="cap" type="number" min={0} max={owned.limits.projectAiMaxUsd} step={0.5} className={field} value={cap} onChange={(e) => setCap(e.target.value)} />
                </div>
                <button disabled={!!busy || Number(cap) === owned.project.aiDailyUsd} onClick={() => void act("cap", () => settings({ aiDailyUsd: Math.max(0, Number(cap) || 0) }))} className={ghost}>
                  Save cap
                </button>
                <span className="pb-2 text-[11.5px] text-dim">Past the cap, AI blocks answer with mock text until tomorrow.</span>
              </div>

              <div className="flex gap-2 border-t border-line pt-3">
                <button
                  disabled={!!busy}
                  onClick={() => confirm("Reset the server's world for this project? Agents, feed and receipts start over.") && void act("reset", () => settings({ reset: true }))}
                  className={`${ghost} hover:border-err/60 hover:text-err`}
                >
                  Reset server world
                </button>
                <button
                  disabled={!!busy}
                  onClick={() =>
                    confirm("Unpublish? The public page and the server's world for this project are deleted.") &&
                    void act("unpublish", () => api(`/api/projects/${current!.id}`, { method: "DELETE" }))
                  }
                  className={`${ghost} hover:border-err/60 hover:text-err`}
                >
                  Unpublish
                </button>
              </div>
            </section>
          )}

          {error && <p className="whitespace-pre-wrap text-[12.5px] text-err">{error}</p>}

          <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 font-mono text-[11px] text-dim">
            <span>Signed in as {shortWallet(wallet)}</span>
            <button onClick={() => void signOut()} className="hover:text-fg">sign out</button>
            {server && (
              <span className="ml-auto">
                {server.database === "postgres" ? "Database" : "Local data folder"} · events: {server.events}
                {server.cron.startsWith("local") ? " · timers need npm run cron" : ""}
              </span>
            )}
          </footer>
        </div>
      )}
    </Modal>
  );
}
