import type { Metadata } from "next";
import { Builder } from "@/components/builder/Builder";

export const metadata: Metadata = { title: "Builder · CIRCUIT" };

export default function BuildPage() {
  return <Builder />;
}
