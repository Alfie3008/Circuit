import { notFound } from "next/navigation";
import { BlockExport } from "./BlockExport";

export const metadata = { title: "Block export", robots: { index: false } };

/** Dev-only: exports every block, drawn by the real renderer, for Claude Design. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BlockExport />;
}
