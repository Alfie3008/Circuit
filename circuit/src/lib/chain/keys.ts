/**
 * The small pieces of Solana's key and transaction formats Circuit needs on
 * the server, without a Solana SDK: base58, program-derived addresses, and a
 * one-instruction memo transaction (legacy message format).
 */
import { createHash } from "node:crypto";

/** BigInt constants (the build targets pre-ES2020, which has no 1n literals). */
const B0 = BigInt(0);
const B1 = BigInt(1);
const B2 = BigInt(2);
const B3 = BigInt(3);
const B4 = BigInt(4);
const B5 = BigInt(5);
const B7 = BigInt(7);
const B8 = BigInt(8);
const B19 = BigInt(19);
const B58 = BigInt(58);
const B255 = BigInt(255);
const B256 = BigInt(256);
const B121665 = BigInt(121665);
const B121666 = BigInt(121666);

// --- base58 ------------------------------------------------------------------

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Encode(bytes: Uint8Array): string {
  let n = B0;
  for (const b of bytes) n = n * B256 + BigInt(b);
  let out = "";
  while (n > B0) {
    out = ALPHABET[Number(n % B58)] + out;
    n /= B58;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

export function base58Decode(text: string): Uint8Array {
  let n = B0;
  for (const c of text) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) throw new Error("Not base58.");
    n = n * B58 + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > B0) {
    bytes.unshift(Number(n % B256));
    n /= B256;
  }
  for (const c of text) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

/** 32-byte public key from a base58 address. */
export function addressBytes(address: string): Uint8Array {
  const b = base58Decode(address);
  if (b.length !== 32) throw new Error("Not a Solana address.");
  return b;
}

// --- program-derived addresses -------------------------------------------------

const P = B2 ** B255 - B19;
const D = (-B121665 * inv(B121666)) % P;
const SQRT_M1 = pow(B2, (P - B1) / B4);

function mod(a: bigint) {
  const r = a % P;
  return r >= B0 ? r : r + P;
}
function pow(b: bigint, e: bigint): bigint {
  let r = B1;
  b = mod(b);
  while (e > B0) {
    if (e & B1) r = mod(r * b);
    b = mod(b * b);
    e >>= B1;
  }
  return r;
}
function inv(a: bigint) {
  return pow(a, P - B2);
}

/** Whether 32 bytes decode to a point on the ed25519 curve (a PDA must not). */
export function isOnCurve(bytes: Uint8Array): boolean {
  let y = B0;
  for (let i = 31; i >= 0; i--) y = (y << B8) | BigInt(i === 31 ? bytes[i] & 0x7f : bytes[i]);
  const sign = bytes[31] >> 7;
  if (y >= P) return false;
  const y2 = mod(y * y);
  const u = mod(y2 - B1);
  const v = mod(D * y2 + B1);
  let x = mod(u * pow(v, B3) * pow(u * pow(v, B7), (P - B5) / B8));
  const vx2 = mod(v * x * x);
  if (vx2 === u) {
    // root found
  } else if (vx2 === mod(-u)) x = mod(x * SQRT_M1);
  else return false;
  return !(x === B0 && sign === 1);
}

/** Solana's findProgramAddress: the first bump (255 down) whose hash is off the curve. */
export function findProgramAddress(seeds: Uint8Array[], programId: string): string {
  const program = addressBytes(programId);
  for (let bump = 255; bump >= 0; bump--) {
    const h = createHash("sha256");
    for (const s of seeds) h.update(s);
    h.update(Uint8Array.of(bump));
    h.update(program);
    h.update(Buffer.from("ProgramDerivedAddress"));
    const out = new Uint8Array(h.digest());
    if (!isOnCurve(out)) return base58Encode(out);
  }
  throw new Error("No program address found.");
}

// --- memo transaction ----------------------------------------------------------

/** Solana's compact-u16 length prefix. */
function compactU16(n: number): number[] {
  const out: number[] = [];
  for (;;) {
    let b = n & 0x7f;
    n >>= 7;
    if (n) b |= 0x80;
    out.push(b);
    if (!n) return out;
  }
}

/**
 * The message of a transaction with one Memo instruction, paid and signed by
 * `payer` (legacy format: header, account keys, blockhash, instructions).
 */
export function memoMessage(payer: string, memoProgram: string, blockhash: string, memo: string): Uint8Array {
  const data = Buffer.from(memo, "utf8");
  return Uint8Array.from([
    1, // signatures required
    0, // read-only signed accounts
    1, // read-only unsigned accounts (the memo program)
    ...compactU16(2),
    ...addressBytes(payer),
    ...addressBytes(memoProgram),
    ...base58Decode(blockhash),
    ...compactU16(1), // one instruction
    1, // program: account 1 (memo)
    ...compactU16(1),
    0, // its one account: the payer, as signer
    ...compactU16(data.length),
    ...data,
  ]);
}

/** A signed transaction: one signature, then the message. */
export const signedTransaction = (signature: Uint8Array, message: Uint8Array) => Uint8Array.from([...compactU16(1), ...signature, ...message]);
