import Link from "next/link";
import { Logo } from "./Logo";

const LINKS = [
  { href: "/build", label: "Build" },
  { href: "/modules", label: "Modules" },
  { href: "/examples", label: "Examples" },
  { href: "/docs", label: "Docs" },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#1d1f23] bg-[rgba(11,12,13,.82)] backdrop-blur-[12px]">
      <div className="mx-auto flex h-[60px] max-w-[1240px] items-center gap-8 px-6">
        <Logo />
        <nav className="hidden flex-wrap gap-6 text-[14px] sm:flex">
          {LINKS.map((l, i) => (
            <Link key={l.href} href={l.href} className="text-[#a9abb1] hover:text-signal">
              <span className="mr-1.5 font-mono text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex-1" />
        <Link
          href="/build"
          className="inline-flex h-[34px] items-center whitespace-nowrap rounded-[7px] bg-signal px-3.5 text-[13.5px] font-medium text-signal-ink hover:text-signal-ink hover:brightness-[1.08]"
        >
          Open Builder
        </Link>
      </div>
    </header>
  );
}
