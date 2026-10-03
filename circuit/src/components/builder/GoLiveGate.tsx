"use client";

import { useEffect, useState } from "react";
import { api, currentWallet } from "@/lib/account/wallet";
import { useProjectStore } from "@/store/project";
import { GoLiveDialog } from "./GoLiveDialog";

/** Go live: the five-step flow for a new project, or straight to the live settings if it's already published. */
export function GoLiveGate() {
  const current = useProjectStore((s) => s.current);
  const openDialog = useProjectStore((s) => s.openDialog);
  const [published, setPublished] = useState<boolean | null>(null);

  useEffect(() => {
    if (!current) return;
    let alive = true;
    // Signed out: it can't be published by you yet, so skip asking the server.
    void currentWallet()
      .then((w) => (w ? api<{ project: unknown }>(`/api/projects/${current.id}`).then((r) => !!r.project) : false))
      .then(
        (p) => alive && setPublished(p),
        () => alive && setPublished(false), // not ours
      );
    return () => {
      alive = false;
    };
  }, [current]);

  useEffect(() => {
    if (published) openDialog("publish");
  }, [published, openDialog]);

  if (published !== false) return null;
  return <GoLiveDialog onClose={() => openDialog(null)} />;
}
