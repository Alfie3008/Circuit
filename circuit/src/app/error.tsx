"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Failsafe for any page that hits a problem while drawing: a plain message and a way back. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[circuit] page failed to draw", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[560px] flex-col items-start justify-center gap-4 px-6 text-fg">
      <div className="font-mono text-[11.5px] tracking-[0.14em] text-dim">SOMETHING WENT WRONG</div>
      <h1 className="m-0 text-[32px] font-medium tracking-[-0.03em]">This page hit a problem.</h1>
      <p className="m-0 text-[15px] leading-[1.6] text-fg-2">
        Nothing was lost: projects are saved in your browser, and live programs keep running on the server. Try again, or head back home.
      </p>
      <div className="flex gap-2">
        <button onClick={() => retry()} className="h-[38px] cursor-pointer rounded-lg bg-signal px-4 text-[14px] font-medium text-signal-ink hover:brightness-[1.08]">
          Try again
        </button>
        <Link href="/" className="inline-flex h-[38px] items-center rounded-lg border border-line-2 px-4 text-[14px] text-fg hover:bg-raised">
          Home
        </Link>
      </div>
    </div>
  );
}
