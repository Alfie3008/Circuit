/** Circuit's own Solana encoding, checked byte for byte against @solana/web3.js. */
import { Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { bondingCurveAddress } from "./creator";
import { addressBytes, base58Decode, base58Encode, findProgramAddress, memoMessage, signedTransaction } from "./keys";
import { PUMP_PROGRAM } from "./parse";
import { anchorSigner } from "@/lib/server/anchor";
import { MEMO_PROGRAM } from "@/lib/proof/proof";

const MINTS = ["4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", "So11111111111111111111111111111111111111112", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"];

describe("Solana encoding without an SDK", () => {
  it("base58 matches, including leading zeros", () => {
    for (const m of MINTS) {
      expect(base58Encode(new PublicKey(m).toBytes())).toBe(m);
      expect([...base58Decode(m)]).toEqual([...new PublicKey(m).toBytes()]);
    }
    expect(base58Encode(new Uint8Array(32))).toBe("11111111111111111111111111111111");
  });

  it("program-derived addresses match findProgramAddressSync", () => {
    for (let i = 0; i < 40; i++) {
      const mint = Keypair.generate().publicKey;
      const expected = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mint.toBuffer()], new PublicKey(PUMP_PROGRAM))[0].toBase58();
      expect(bondingCurveAddress(mint.toBase58())).toBe(expected);
    }
    const seeds = [Buffer.from("x"), addressBytes(MINTS[0])];
    expect(findProgramAddress(seeds, MEMO_PROGRAM)).toBe(PublicKey.findProgramAddressSync(seeds, new PublicKey(MEMO_PROGRAM))[0].toBase58());
  });

  it("the memo transaction is the one web3.js builds, and its signature verifies", () => {
    const secret = Keypair.generate();
    const blockhash = Keypair.generate().publicKey.toBase58();
    const memo = "circuit:batch:v1:" + "ab".repeat(32) + ":3";
    const tx = new Transaction({ feePayer: secret.publicKey, recentBlockhash: blockhash }).add(
      new TransactionInstruction({ programId: new PublicKey(MEMO_PROGRAM), keys: [{ pubkey: secret.publicKey, isSigner: true, isWritable: true }], data: Buffer.from(memo) }),
    );
    const mine = memoMessage(secret.publicKey.toBase58(), MEMO_PROGRAM, blockhash, memo);
    expect(Buffer.from(mine).toString("hex")).toBe(tx.serializeMessage().toString("hex"));

    const signer = anchorSigner(JSON.stringify([...secret.secretKey]))!;
    expect(signer.address).toBe(secret.publicKey.toBase58());
    const raw = signedTransaction(signer.sign(mine), mine);
    const back = Transaction.from(Buffer.from(raw));
    expect(back.verifySignatures()).toBe(true);
  });
});
