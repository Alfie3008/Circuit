import Link from "next/link";

/** The "Status" mark: a block with its status light lifted from the corner. */
export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="block shrink-0" aria-hidden>
      <path d="M12 16H35V29H48V52H12Z" fill="#e8e6e1" />
      <rect x="38" y="12" width="14" height="14" fill="oklch(0.84 0.15 80)" />
    </svg>
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
