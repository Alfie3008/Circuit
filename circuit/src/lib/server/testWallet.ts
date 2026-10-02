/** A throwaway Solana-style keypair for tests: base58 address + a message signer. */
import { generateKeyPairSync, sign } from "node:crypto";
import { base58Encode } from "./auth";

export function testWallet() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(12);
  return { address: base58Encode(raw), sign: (msg: string) => sign(null, Buffer.from(msg), privateKey).toString("base64") };
}
