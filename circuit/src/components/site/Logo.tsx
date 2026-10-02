import Link from "next/link";

/** The "Status" mark: a block with its status light lifted from the corner. */
export function LogoMark({ size = 20, ink = "#e8e6e1", accent = "oklch(0.84 0.15 80)" }: { size?: number; ink?: string; accent?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="block shrink-0" aria-hidden>
      <path d="M12 16H35V29H48V52H12Z" fill={ink} />
      <rect x="38" y="12" width="14" height="14" fill={accent} />
    </svg>
  );
}

/** Wordmark: Geist Mono SemiBold, uppercase, tracked +220. */
export function Wordmark({ size = 14, ink = "#e8e6e1" }: { size?: number; ink?: string }) {
  return (
    <span className="font-mono font-semibold leading-none" style={{ fontSize: size, letterSpacing: "0.22em", color: ink }}>
      CIRCUIT
    </span>
  );
}

/** Lockup: the mark at 1.9× the cap height, with a gap of 0.38× the mark. */
export function Lockup({ size = 56, ink, accent }: { size?: number; ink?: string; accent?: string }) {
  return (
    <span className="inline-flex items-center" style={{ gap: size * 0.38 }}>
      <LogoMark size={size} ink={ink} accent={accent} />
      <Wordmark size={Math.round(size / 1.9 / 0.72)} ink={ink} />
    </span>
  );
}

export function Logo({ href = "/", wordmark = true }: { href?: string; wordmark?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 text-fg hover:text-fg" aria-label="CIRCUIT home">
      <LogoMark />
      {wordmark && <span className="font-mono text-[14px] font-semibold tracking-[0.18em]">CIRCUIT</span>}
    </Link>
  );
}
