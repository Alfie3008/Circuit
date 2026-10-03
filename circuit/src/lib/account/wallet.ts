/**
 * Browser side of Sign in with Solana: find the wallet extension (Phantom,
 * Solflare, Backpack… they all expose the same connect / signMessage API),
 * have it sign the server's message, and send the signature back.
 */

interface PublicKeyLike {
  toString(): string;
}
interface SolanaProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  connect(): Promise<{ publicKey: PublicKeyLike } | void>;
  publicKey?: PublicKeyLike | null;
  signMessage(message: Uint8Array, encoding?: "utf8"): Promise<{ signature: Uint8Array } | Uint8Array>;
  /** Signs and sends a @solana/web3.js transaction (all major wallets support it). */
  signAndSendTransaction?(tx: unknown): Promise<{ signature: string } | string>;
  disconnect?(): Promise<void>;
}

type WalletWindow = Window & {
  phantom?: { solana?: SolanaProvider };
  solflare?: SolanaProvider;
  backpack?: SolanaProvider;
  solana?: SolanaProvider;
};

export function findWallet(): { provider: SolanaProvider; name: string } | null {
  if (typeof window === "undefined") return null;
  const w = window as WalletWindow;
  if (w.phantom?.solana) return { provider: w.phantom.solana, name: "Phantom" };
  if (w.solflare) return { provider: w.solflare, name: "Solflare" };
  if (w.backpack) return { provider: w.backpack, name: "Backpack" };
  if (w.solana) return { provider: w.solana, name: w.solana.isPhantom ? "Phantom" : "wallet" };
  return null;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** Connects the wallet, signs the sign-in message and starts a session. Returns the wallet address. */
export async function signInWithWallet(): Promise<string> {
  const found = findWallet();
  if (!found) throw new Error("No Solana wallet found. Install Phantom (phantom.com) and reload.");
  const { provider } = found;
  const connected = await provider.connect();
  const wallet = (connected && "publicKey" in connected ? connected.publicKey : provider.publicKey)?.toString();
  if (!wallet) throw new Error("The wallet didn't share its address.");
  const { message } = await post<{ message: string }>("/api/auth/nonce", { wallet });
  const signed = await provider.signMessage(new TextEncoder().encode(message), "utf8");
  const signature = signed instanceof Uint8Array ? signed : signed.signature;
  await post("/api/auth/verify", { wallet, signature: toBase64(signature) });
  return wallet;
}

export async function currentWallet(): Promise<string | null> {
  const res = await fetch("/api/auth/me").catch(() => null);
  if (!res?.ok) return null;
  return ((await res.json()) as { wallet: string | null }).wallet;
}

export async function signOut() {
  await post("/api/auth/logout", {});
  await findWallet()?.provider.disconnect?.().catch(() => {});
}

export const shortWallet = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

/** JSON request to the server's API; throws with the server's error message. */
export async function api<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { status: res.status });
  return data;
}

/**
 * Writes a published project's rules fingerprint to Solana: the wallet signs
 * one memo transaction (network fee only, about 0.000005 SOL), then the server
 * reads it back from Solana and records the version.
 */
export async function writeRulesToSolana(projectId: string, slug: string, program: unknown, onStage?: (stage: "wallet" | "confirming") => void): Promise<{ version: number; signature: string }> {
  const found = findWallet();
  if (!found) throw new Error("No Solana wallet found. Install Phantom (phantom.com) and reload.");
  const { provider } = found;
  if (!provider.signAndSendTransaction) throw new Error(`${found.name} can't send transactions from this page. Try Phantom or Solflare.`);
  const connected = await provider.connect();
  const owner = (connected && "publicKey" in connected ? connected.publicKey : provider.publicKey)?.toString();
  if (!owner) throw new Error("The wallet didn't share its address.");

  const [{ rulesFingerprint, rulesMemo, MEMO_PROGRAM }, web3, { blockhash }] = await Promise.all([
    import("@/lib/proof/proof"),
    import("@solana/web3.js"),
    api<{ blockhash: string }>("/api/proof/blockhash"),
  ]);
  const fingerprint = await rulesFingerprint(program);
  const payer = new web3.PublicKey(owner);
  const tx = new web3.Transaction({ feePayer: payer, recentBlockhash: blockhash }).add(
    new web3.TransactionInstruction({ programId: new web3.PublicKey(MEMO_PROGRAM), keys: [{ pubkey: payer, isSigner: true, isWritable: true }], data: new TextEncoder().encode(rulesMemo(slug, fingerprint)) as Buffer }),
  );
  onStage?.("wallet");
  const sent = await provider.signAndSendTransaction(tx);
  const signature = typeof sent === "string" ? sent : sent.signature;
  onStage?.("confirming");

  // Solana takes a few seconds to confirm; the server says 409 until it can read the transaction.
  for (let attempt = 0; ; attempt++) {
    try {
      const { version } = await api<{ version: { version: number } }>(`/api/projects/${projectId}/rules`, { method: "POST", body: { signature } });
      return { version: version.version, signature };
    } catch (e) {
      if ((e as { status?: number }).status !== 409 || attempt >= 8) throw e;
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
}
