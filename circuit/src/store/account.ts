import { create } from "zustand";
import { currentWallet, signInWithWallet, signOut } from "@/lib/account/wallet";

interface AccountState {
  /** Signed-in wallet, null when signed out, undefined until checked. */
  wallet: string | null | undefined;
  busy: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAccount = create<AccountState>((set) => ({
  wallet: undefined,
  busy: false,
  error: null,
  refresh: async () => set({ wallet: await currentWallet() }),
  signIn: async () => {
    set({ busy: true, error: null });
    try {
      set({ wallet: await signInWithWallet() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Closing the wallet popup isn't an error worth shouting about.
      set({ error: /reject|cancel|denied/i.test(msg) ? "Sign-in cancelled." : msg });
    } finally {
      set({ busy: false });
    }
  },
  signOut: async () => {
    await signOut().catch(() => {});
    set({ wallet: null });
  },
}));
