import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScoreCard } from "@/components/Panels";
import { db } from "@/lib/server";
import type { EndingRow } from "@/lib/snapshot";

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await db().from("endings").select("*").eq("id", id).maybeSingle();
  return data as EndingRow | null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const ending = await load(id);
  if (!ending) return { title: "Loophole City" };
  const title = `This administration lasted ${ending.days_lasted} ${ending.days_lasted === 1 ? "day" : "days"}`;
  const image = `/api/card/${id}`;
  return {
    title: `${title} | Loophole City`,
    description: ending.epitaph,
    openGraph: { title, description: ending.epitaph, images: [image] },
    twitter: { card: "summary_large_image", title, description: ending.epitaph, images: [image] },
  };
}

export default async function CardPage({ params }: Props) {
  const { id } = await params;
  const ending = await load(id);
  if (!ending) notFound();
  return (
    <main className="center-page card-page">
      <article className="paper paper-final">
        <div className="masthead">The Daily Loophole</div>
        <h1 className="paper-head">{ending.headline}</h1>
        <p className="paper-sub">{ending.subhead}</p>
      </article>
      <ScoreCard ending={ending} />
      <a className="btn btn-red btn-big" href="/">Start your own disaster</a>
    </main>
  );
}
