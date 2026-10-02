import Link from "next/link";
import { LogoMark } from "./Logo";
import { UtcClock } from "./UtcClock";

const COLS: [string, [string, string][]][] = [
  ["PLATFORM", [["Builder", "/build"], ["Examples", "/examples"], ["Modules", "/modules"], ["Brand", "/brand"]]],
  ["DOCS", [["Receipts", "/docs#receipts"], ["Checking on Solana", "/docs#verify"], ["AI fuel", "/docs#fuel"], ["Going live", "/docs#golive"]]],
  ["NETWORK", [["Solana", "https://solana.com"], ["Pump", "https://pump.fun"], ["Webhooks", "/docs#golive"]]],
];

export function SiteFooter() {
  return (
    <footer className="border-t border-[#17191c] bg-[#0a0b0c] px-6 pb-10 pt-14">
      <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-12">
        <div className="flex max-w-[320px] flex-col gap-3.5">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <span className="font-mono text-[14px] font-semibold tracking-[0.18em]">CIRCUIT</span>
          </div>
          <p className="m-0 text-[14px] leading-[1.55] text-dim">
            A visual programming language for making coins and internet projects behave however you want. Simulated purchases are simulations. Nothing here is
            financial advice.
          </p>
        </div>
        <div className="flex flex-wrap gap-14">
          {COLS.map(([title, links]) => (
            <div key={title} className="flex flex-col gap-2.5">
              <span className="font-mono text-[10.5px] tracking-[0.14em] text-faint">{title}</span>
              {links.map(([label, href]) => (
                <Link key={label} href={href} className="text-[14px] text-fg-2 hover:text-signal">
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-10 flex max-w-[1240px] flex-wrap justify-between gap-3 border-t border-[#17191c] pt-5 font-mono text-[11px] tracking-[0.08em] text-faint">
        <span>© 2026 CIRCUIT</span>
        <span>
          <UtcClock /> UTC · ALL SYSTEMS NOMINAL
        </span>
      </div>
    </footer>
  );
}
