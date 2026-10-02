"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { XIcon } from "@/components/ui/icons";
import { useProjectStore } from "@/store/project";

/** Transient messages (import results, errors). Info auto-dismisses; errors wait for the user. */
export function NoticeToast() {
  const notice = useProjectStore((s) => s.notice);
  const dismiss = useProjectStore((s) => s.dismissNotice);

  useEffect(() => {
    if (notice?.kind !== "info") return;
    const t = setTimeout(dismiss, 4000);
    return () => clearTimeout(t);
  }, [notice, dismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4" aria-live="polite">
      <AnimatePresence>
        {notice && (
          <motion.div
            key={notice.id}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            role={notice.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex max-w-lg items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-2xl shadow-black/50 ${
              notice.kind === "error" ? "border-red-500/40 bg-[#2a1416] text-red-100" : "border-line bg-panel text-fg"
            }`}
          >
            <p className="whitespace-pre-line">{notice.text}</p>
            <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100">
              <XIcon width={14} height={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
