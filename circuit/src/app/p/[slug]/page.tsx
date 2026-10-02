import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/server/db";
import { publicProject } from "@/lib/server/publicView";
import { PublicPage } from "./PublicPage";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const p = await getDb().getProjectBySlug(slug.toLowerCase());
  return p ? { title: `${p.name} · CIRCUIT`, description: `${p.name} runs on CIRCUIT: public rules, live world, and a receipt for every run.` } : { title: "Not found · CIRCUIT" };
}

/** A published project's public page: its rules, its world, and proof of every run. */
export default async function Page({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const view = await publicProject(getDb(), slug.toLowerCase());
  if (!view) notFound();
  return <PublicPage initial={view} />;
}
