import type { Metadata } from "next";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { DocsBody } from "./DocsBody";

export const metadata: Metadata = {
  title: "Docs · How Circuit proves it",
  description: "Receipts, sources, checking on Solana, rules and versions, plain English, going live, AI fuel and public pages.",
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-ink">
      <SiteNav active="/docs" />
      <DocsBody />
      <SiteFooter />
    </div>
  );
}
