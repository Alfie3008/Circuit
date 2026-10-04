/**
 * The web for programs running on the server: real pages and HTTP through
 * the safe fetcher. Search stays simulated until a search API is chosen.
 * CIRCUIT_WEB_ENABLED=false switches all of it back to simulation.
 */
import { mockWeb, type HttpResult, type Page, type WebAdapter } from "@/lib/runtime/adapters";
import type { Rng } from "@/lib/runtime/rng";
import type { Value } from "@/lib/runtime/values";
import { htmlToPage, safeFetch, type SafeResponse } from "./safeFetch";

export const webEnabled = () => process.env.CIRCUIT_WEB_ENABLED?.trim().toLowerCase() !== "false";

/** Most text a program gets from one response. */
const MAX_TEXT = 20_000;

export function pageOf(r: SafeResponse): Page {
  if (/html|xml/i.test(r.contentType) || /^\s*</.test(r.text)) return htmlToPage(r.text, r.url, MAX_TEXT);
  return { url: r.url, title: "", text: r.text.slice(0, MAX_TEXT), links: [] };
}

export function bodyOf(r: SafeResponse): Value {
  if (/json/i.test(r.contentType)) {
    try {
      return JSON.parse(r.text) as Value;
    } catch {
      // not JSON after all
    }
  }
  return r.text.slice(0, MAX_TEXT);
}

export function liveWeb(rng: Rng): WebAdapter {
  const mock = mockWeb(rng);
  if (!webEnabled()) return mock;
  let label = "web";
  return {
    get label() {
      return label;
    },
    async search(query) {
      label = "simulated search (no search API connected yet)";
      return mock.search(query);
    },
    async open(url) {
      const r = await safeFetch(url);
      if (r.status >= 400) throw new Error(`the site answered ${r.status}`);
      label = "web";
      return pageOf(r);
    },
    async request(method, url, headers, body): Promise<HttpResult> {
      const r = await safeFetch(url, { method, headers, body });
      label = "web";
      return { status: r.status, ok: r.status < 400, body: bodyOf(r) };
    },
  };
}
