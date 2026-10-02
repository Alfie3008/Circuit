/**
 * Sign in with Solana: the browser's wallet signs a one-time message, the
 * server checks the ed25519 signature against the wallet address, and sets a
 * signed session cookie. No passwords, no emails, no funds involved.
 *
 * Cookies are HMAC-signed with CIRCUIT_SESSION_SECRET. Without one, a dev
 * secret is used, and only outside production.
 */
import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import { isAddress } from "@/lib/chain/parse";
import { ServerError } from "./types";

export const SESSION_COOKIE = "circuit_session";
export const NONCE_COOKIE = "circuit_nonce";
export const SESSION_DAYS = 30;
const NONCE_MINUTES = 10;

function secret(): string {
  const s = process.env.CIRCUIT_SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production" || process.env.VERCEL)
    throw new ServerError("Sign-in is disabled: set CIRCUIT_SESSION_SECRET (32+ random characters).", 500);
  return "circuit-dev-session-secret-not-for-production";
}

const b64url = (b: Buffer) => b.toString("base64url");
const mac = (payload: string) => b64url(createHmac("sha256", secret()).update(payload).digest());

/** `payload.mac`, payload being base64url JSON. */
export function sign(value: object): string {
  const payload = b64url(Buffer.from(JSON.stringify(value)));
  return `${payload}.${mac(payload)}`;
}

export function unsign<T>(token: string | undefined | null): T | null {
  if (!token) return null;
  const [payload, given] = token.split(".");
  if (!payload || !given) return null;
  const a = Buffer.from(given);
  const b = Buffer.from(mac(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as T;
  } catch {
    return null;
  }
}

// --- base58 (Solana addresses) ---------------------------------------------

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Decode(s: string): Buffer {
  let zeros = 0;
  while (s[zeros] === "1") zeros++;
  const bytes: number[] = []; // little-endian
  for (const ch of s.slice(zeros)) {
    let carry = ALPHABET.indexOf(ch);
    if (carry < 0) throw new Error("not base58");
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    for (; carry; carry >>= 8) bytes.push(carry & 0xff);
  }
  return Buffer.from([...new Array<number>(zeros).fill(0), ...bytes.reverse()]);
}

export function base58Encode(buf: Uint8Array): string {
  let zeros = 0;
  while (zeros < buf.length && buf[zeros] === 0) zeros++;
  const digits: number[] = []; // little-endian
  for (const byte of buf.subarray(zeros)) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] * 256;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    for (; carry; carry = Math.floor(carry / 58)) digits.push(carry % 58);
  }
  return "1".repeat(zeros) + digits.reverse().map((d) => ALPHABET[d]).join("");
}

// --- the sign-in message ----------------------------------------------------

interface Nonce {
  wallet: string;
  nonce: string;
  issuedAt: number;
  host: string;
}

export function signInMessage(n: Nonce): string {
  return [
    `${n.host} wants you to sign in to CIRCUIT with your Solana account:`,
    n.wallet,
    "",
    "This only proves you own this wallet. It is free and cannot move funds.",
    "",
    `Nonce: ${n.nonce}`,
    `Issued At: ${new Date(n.issuedAt).toISOString()}`,
  ].join("\n");
}

/** Starts a sign-in: the message to sign and the cookie that remembers it. */
export function startSignIn(wallet: string, host: string, now = Date.now()) {
  if (!isAddress(wallet)) throw new ServerError("That isn't a Solana wallet address.");
  const n: Nonce = { wallet, nonce: randomBytes(12).toString("hex"), issuedAt: now, host };
  return { message: signInMessage(n), cookie: sign(n) };
}

const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");

/** True if `signature` is `wallet`'s ed25519 signature of `message`. */
export function verifySignature(wallet: string, message: string, signature: Buffer): boolean {
  try {
    const raw = base58Decode(wallet);
    if (raw.length !== 32 || signature.length !== 64) return false;
    const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519, raw]), format: "der", type: "spki" });
    return verify(null, Buffer.from(message), key, signature);
  } catch {
    return false;
  }
}

/** Finishes a sign-in. Returns the session cookie value. */
export function finishSignIn(nonceCookie: string | undefined, wallet: string, signatureB64: string, host: string, now = Date.now()): string {
  const n = unsign<Nonce>(nonceCookie);
  if (!n) throw new ServerError("Sign-in expired. Try again.", 401);
  if (n.wallet !== wallet || n.host !== host) throw new ServerError("Sign-in doesn't match this wallet. Try again.", 401);
  if (now - n.issuedAt > NONCE_MINUTES * 60_000) throw new ServerError("Sign-in expired. Try again.", 401);
  const signature = Buffer.from(signatureB64, "base64");
  if (!verifySignature(wallet, signInMessage(n), signature)) throw new ServerError("The wallet signature didn't check out.", 401);
  return sign({ wallet, exp: now + SESSION_DAYS * 86_400_000 });
}

/** The signed-in wallet from a session cookie value, or null. */
export function sessionWallet(cookie: string | undefined | null, now = Date.now()): string | null {
  const s = unsign<{ wallet: string; exp: number }>(cookie);
  return s && s.exp > now && isAddress(s.wallet) ? s.wallet : null;
}

/** Reads a cookie from a request's Cookie header. */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export const requestWallet = (req: Request) => sessionWallet(readCookie(req, SESSION_COOKIE));

export function cookieHeader(name: string, value: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}
