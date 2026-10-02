import { describe, expect, it } from "vitest";
import { base58Decode, base58Encode, finishSignIn, sessionWallet, sign, startSignIn, unsign } from "./auth";
import { testWallet } from "./testWallet";

describe("base58", () => {
  it("round-trips, including leading zeros", () => {
    for (const bytes of [[0, 0, 1, 2, 255], [255, 254], [0], Array.from({ length: 32 }, (_, i) => i * 7)]) {
      const enc = base58Encode(Uint8Array.from(bytes));
      expect([...base58Decode(enc)]).toEqual(bytes);
    }
    // Known vector: the System Program is 32 zero bytes.
    expect(base58Encode(new Uint8Array(32))).toBe("11111111111111111111111111111111");
    expect(base58Decode("So11111111111111111111111111111111111111112").length).toBe(32);
  });
});

describe("sign in with Solana", () => {
  it("accepts the wallet's own signature and issues a session", () => {
    const w = testWallet();
    const { message, cookie } = startSignIn(w.address, "localhost:3000", 1000);
    expect(message).toContain(w.address);
    const session = finishSignIn(cookie, w.address, w.sign(message), "localhost:3000", 2000);
    expect(sessionWallet(session, 3000)).toBe(w.address);
    expect(sessionWallet(session, 3000 + 31 * 86_400_000)).toBeNull(); // expired
  });

  it("rejects another wallet's signature, other hosts, stale nonces and tampering", () => {
    const w = testWallet();
    const other = testWallet();
    const { message, cookie } = startSignIn(w.address, "localhost:3000", 1000);
    expect(() => finishSignIn(cookie, w.address, other.sign(message), "localhost:3000", 2000)).toThrow(/signature/);
    expect(() => finishSignIn(cookie, w.address, w.sign(message), "evil.example", 2000)).toThrow();
    expect(() => finishSignIn(cookie, w.address, w.sign(message), "localhost:3000", 1000 + 11 * 60_000)).toThrow(/expired/);
    const forged = sign({ wallet: other.address, exp: Date.now() + 1e9 }).replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    expect(sessionWallet(forged)).toBeNull();
    expect(unsign("garbage")).toBeNull();
    expect(() => startSignIn("not a wallet", "x")).toThrow();
  });
});
