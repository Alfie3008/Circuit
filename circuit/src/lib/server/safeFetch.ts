/**
 * The only way programs reach the web from Circuit's servers. A program can
 * contain any URL, so every request is held to the public internet:
 *
 * - http/https on the standard ports only, no credentials in the URL
 * - every address a name resolves to is checked when connecting (so a name
 *   can't pass a check and then point somewhere private: DNS rebinding);
 *   private, loopback, link-local (cloud metadata) and reserved ranges are refused
 * - at most 3 redirects, each checked the same way
 * - 8 s and 2 MB per request; anything longer is cut off and marked
 */
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import zlib from "node:zlib";

export class FetchBlocked extends Error {}

export interface SafeResponse {
  url: string;
  status: number;
  contentType: string;
  text: string;
  truncated: boolean;
}

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Which resolved addresses may be connected to (tests only widen this). */
  allowAddress?: (ip: string) => boolean;
  /** Tests only: allow a non-standard port (the local test server's). */
  anyPort?: boolean;
}

const USER_AGENT = "CircuitBot/1.0 (+programs run by Circuit coins)";

// --- addresses -----------------------------------------------------------------

function v4Number(ip: string): number {
  return ip.split(".").reduce((n, part) => n * 256 + Number(part), 0);
}
const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];
const inV4 = (ip: string, [base, bits]: [string, number]) => {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((v4Number(ip) & mask) >>> 0) === ((v4Number(base) & mask) >>> 0);
};

/** Expands an IPv6 address to 8 hextets (handles :: and an embedded IPv4 tail). */
function v6Hextets(ip: string): number[] {
  let s = ip.toLowerCase().split("%")[0];
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const n = v4Number(v4[1]);
    s = s.slice(0, -v4[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, tail] = s.includes("::") ? s.split("::") : [s, null];
  const a = head ? head.split(":") : [];
  const b = tail ? tail.split(":") : [];
  const fill = tail === null ? [] : Array(8 - a.length - b.length).fill("0");
  return [...a, ...fill, ...b].map((h) => parseInt(h || "0", 16));
}

/** True only for addresses on the public internet. */
export function isPublicIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return !V4_BLOCKED.some((r) => inV4(ip, r));
  if (kind !== 6) return false;
  const h = v6Hextets(ip);
  const embeddedV4 = () => `${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`;
  if (h.every((x) => x === 0)) return false; // ::
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return false; // ::1
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) return isPublicIp(embeddedV4()); // ::ffff:a.b.c.d
  if (h[0] === 0x64 && h[1] === 0xff9b) return isPublicIp(embeddedV4()); // NAT64
  if ((h[0] & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((h[0] & 0xffc0) === 0xfe80) return false; // link-local
  if ((h[0] & 0xff00) === 0xff00) return false; // multicast
  if (h[0] === 0x2001 && h[1] === 0x0db8) return false; // documentation
  if (h[0] === 0x2002) return false; // 6to4 (can wrap private v4)
  return true;
}

/** Checks a URL before any connection: scheme, port, credentials, obviously-internal names. */
export function checkUrl(raw: string, anyPort = false): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new FetchBlocked(`"${raw.slice(0, 80)}" isn't a web address.`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new FetchBlocked("Only http and https addresses can be opened.");
  if (!anyPort && u.port && u.port !== "80" && u.port !== "443") throw new FetchBlocked("Only the standard web ports (80 and 443) can be used.");
  if (u.username || u.password) throw new FetchBlocked("Addresses with a username or password can't be opened.");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || /\.(localhost|local|internal|home|lan|intranet|corp)$/.test(host) || !host.includes(".") && !isIP(host))
    throw new FetchBlocked("That address points inside a private network, so it can't be opened.");
  return u;
}

// --- one request -----------------------------------------------------------------

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

function guardedLookup(allow: (ip: string) => boolean) {
  return (hostname: string, options: { all?: boolean; family?: number }, callback: LookupCallback) => {
    dnsLookup(hostname, { family: options.family ?? 0, all: true }, (err, addresses) => {
      if (err) return callback(err, "");
      const list = addresses as LookupAddress[];
      if (!list.length || list.some((a) => !allow(a.address)))
        return callback(Object.assign(new FetchBlocked("That address points inside a private network, so it can't be opened."), { code: "EBLOCKED" }), "");
      if (options.all) callback(null, list);
      else callback(null, list[0].address, list[0].family);
    });
  };
}

function decoder(encoding: string | undefined) {
  switch ((encoding ?? "").toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return zlib.createGunzip();
    case "deflate":
      return zlib.createInflate();
    case "br":
      return zlib.createBrotliDecompress();
    default:
      return null;
  }
}

interface Hop {
  status: number;
  location?: string;
  contentType: string;
  body: Buffer;
  truncated: boolean;
}

function once(u: URL, opts: Required<Pick<SafeFetchOptions, "method" | "timeoutMs" | "maxBytes">> & SafeFetchOptions, allow: (ip: string) => boolean): Promise<Hop> {
  const literal = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(literal) && !allow(literal)) return Promise.reject(new FetchBlocked("That address points inside a private network, so it can't be opened."));
  const lib = u.protocol === "https:" ? https : http;
  return new Promise<Hop>((resolve, reject) => {
    const req = lib.request(
      u,
      {
        method: opts.method,
        headers: { "user-agent": USER_AGENT, "accept-encoding": "gzip, deflate, br", ...(opts.headers ?? {}) },
        lookup: guardedLookup(allow) as unknown as typeof dnsLookup,
        timeout: opts.timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, location: res.headers.location, contentType: "", body: Buffer.alloc(0), truncated: false });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        const unzip = decoder(res.headers["content-encoding"]);
        const stream = unzip ? res.pipe(unzip) : res;
        const done = () => resolve({ status, contentType: String(res.headers["content-type"] ?? ""), body: Buffer.concat(chunks), truncated });
        stream.on("data", (c: Buffer) => {
          if (truncated) return;
          size += c.length;
          if (size > opts.maxBytes) {
            chunks.push(c.subarray(0, c.length - (size - opts.maxBytes)));
            truncated = true;
            res.destroy();
            done();
            return;
          }
          chunks.push(c);
        });
        stream.on("end", () => !truncated && done());
        stream.on("error", (e) => (truncated ? undefined : reject(e)));
      },
    );
    req.on("timeout", () => req.destroy(new FetchBlocked(`The site didn't answer within ${Math.round(opts.timeoutMs / 1000)} seconds.`)));
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

/** Fetches a public web address under the rules above. Throws FetchBlocked or a network error. */
export async function safeFetch(raw: string, options: SafeFetchOptions = {}): Promise<SafeResponse> {
  const allow = options.allowAddress ?? isPublicIp;
  const opts = { ...options, method: (options.method ?? "GET").toUpperCase(), timeoutMs: options.timeoutMs ?? 8_000, maxBytes: options.maxBytes ?? 2 * 1024 * 1024 };
  let u = checkUrl(raw, options.anyPort);
  let method = opts.method;
  let body = opts.body;
  for (let hop = 0; ; hop++) {
    const r = await once(u, { ...opts, method, body }, allow);
    if (!r.location) {
      const charset = /charset=([\w-]+)/i.exec(r.contentType)?.[1] ?? "utf-8";
      let text: string;
      try {
        text = new TextDecoder(charset).decode(r.body);
      } catch {
        text = new TextDecoder("utf-8").decode(r.body);
      }
      return { url: u.toString(), status: r.status, contentType: r.contentType, text, truncated: r.truncated };
    }
    if (hop >= (opts.maxRedirects ?? 3)) throw new FetchBlocked("The site redirected too many times.");
    u = checkUrl(new URL(r.location, u).toString(), options.anyPort);
    if (r.status === 303 || ((r.status === 301 || r.status === 302) && method !== "GET" && method !== "HEAD")) {
      method = "GET";
      body = null;
    }
  }
}

// --- pages -----------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m),
  );

/** A page as a program sees it: title, readable text and links (absolute http/https), never raw HTML. */
export function htmlToPage(html: string, url: string, maxText = 20_000): { url: string; title: string; text: string; links: string[] } {
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const links: string[] = [];
  // Quoted or unquoted (minified pages drop the quotes); in-page "#" anchors skipped.
  for (const m of html.matchAll(/<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? "";
    if (!raw || raw.startsWith("#")) continue;
    try {
      const href = new URL(decodeEntities(raw), url);
      if ((href.protocol === "http:" || href.protocol === "https:") && !links.includes(href.toString())) links.push(href.toString());
    } catch {
      // not a usable link
    }
    if (links.length >= 50) break;
  }
  const text = decodeEntities(
    html
      .replace(/<(script|style|noscript|template|svg|head|title)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .slice(0, maxText);
  return { url, title, text, links };
}
