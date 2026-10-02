/**
 * Keeps one Helius webhook pointed at this server, watching every live
 * project's token and wallet. Found by its URL (so nothing needs storing),
 * created if missing. Needs HELIUS_API_KEY, HELIUS_WEBHOOK_AUTH and a public
 * URL (CIRCUIT_PUBLIC_URL, or Vercel's production URL).
 */
import { watchedAddresses } from "./chainFeed";
import type { Db } from "./types";

const API = "https://api.helius.xyz/v0/webhooks";

export function publicUrl(): string | null {
  const explicit = process.env.CIRCUIT_PUBLIC_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}

export const webhookUrl = () => {
  const base = publicUrl();
  return base ? `${base}/api/webhooks/helius` : null;
};

/** Webhooks are possible: the server can be reached and Helius can be told about it. */
export const webhooksConfigured = () => !!(process.env.HELIUS_API_KEY?.trim() && process.env.HELIUS_WEBHOOK_AUTH?.trim() && webhookUrl());

interface HeliusWebhook {
  webhookID: string;
  webhookURL: string;
  accountAddresses: string[];
}

export interface SyncResult {
  ok: boolean;
  addresses: number;
  detail: string;
}

/** Points the webhook at the current set of live addresses. Best effort. */
export async function syncWebhook(db: Db, f: typeof fetch = fetch): Promise<SyncResult> {
  if (!webhooksConfigured()) return { ok: false, addresses: 0, detail: "webhooks not configured (polling instead)" };
  const key = process.env.HELIUS_API_KEY!.trim();
  const url = webhookUrl()!;
  const projects = await db.listProjects({ live: true, limit: 10_000 });
  // Helius allows up to 100k addresses per webhook.
  const addresses = [...new Set(projects.flatMap(watchedAddresses))].slice(0, 100_000);
  const body = {
    webhookURL: url,
    transactionTypes: ["ANY"],
    accountAddresses: addresses.length ? addresses : ["11111111111111111111111111111111"],
    webhookType: "raw",
    authHeader: process.env.HELIUS_WEBHOOK_AUTH!.trim(),
  };
  try {
    const list = await f(`${API}?api-key=${key}`);
    if (!list.ok) return { ok: false, addresses: addresses.length, detail: `Helius said ${list.status} listing webhooks` };
    const existing = ((await list.json()) as HeliusWebhook[]).find((w) => w.webhookURL === url);
    const res = existing
      ? await f(`${API}/${existing.webhookID}?api-key=${key}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      : await f(`${API}?api-key=${key}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return { ok: false, addresses: addresses.length, detail: `Helius said ${res.status} ${existing ? "updating" : "creating"} the webhook` };
    return { ok: true, addresses: addresses.length, detail: `${existing ? "updated" : "created"} webhook for ${addresses.length} address(es)` };
  } catch (e) {
    return { ok: false, addresses: addresses.length, detail: `couldn't reach Helius: ${e instanceof Error ? e.message : String(e)}` };
  }
}
