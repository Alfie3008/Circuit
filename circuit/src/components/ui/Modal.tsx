"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";
import { XIcon } from "@/components/ui/icons";

export const field =
  "h-8 w-full rounded-md border border-line-2 bg-canvas px-2.5 font-mono text-[12.5px] text-fg placeholder:text-faint focus:border-signal/60 focus:outline-none";
export const label = "mb-1 block font-mono text-[10.5px] tracking-[0.12em] text-dim";

export function Modal({ title, onClose, children, width = 760 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.15 }}
        style={{ width }}
        className="flex max-h-[88vh] max-w-full flex-col overflow-hidden rounded-[14px] border border-[#23252a] bg-panel shadow-2xl shadow-black/60"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-mono text-[12px] tracking-[0.14em] text-muted">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-dim hover:text-fg">
            <XIcon width={14} height={14} />
          </button>
        </header>
        <div className="overflow-y-auto p-5">{children}</div>
      </motion.div>
    </div>
  );
}
