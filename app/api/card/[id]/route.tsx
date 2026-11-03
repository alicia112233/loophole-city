import { ImageResponse } from "next/og";
import { db } from "@/lib/server";
import type { EndingRow } from "@/lib/snapshot";

async function displayFont(text: string) {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Fraunces:wght@800&text=${encodeURIComponent(text)}`,
      { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8)" } },
    ).then((r) => r.text());
    const url = css.match(/src: url\((.+?)\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const { data } = await db().from("endings").select("*").eq("id", id).maybeSingle();
  const ending = data as EndingRow | null;
  if (!ending) return new Response("Not found", { status: 404 });

  const unit = ending.days_lasted === 1 ? "day" : "days";
  const kicker = "YOUR ADMINISTRATION LASTED";
  const number = `${ending.days_lasted} ${unit}`;
  const font = await displayFont(`${kicker}${number}${ending.epitaph}Loophole City`);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f4ecdb",
          color: "#1d2433",
          padding: 56,
          border: "14px solid #1d2433",
          fontFamily: font ? "Fraunces" : "serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 34, letterSpacing: 4, color: "#c4412d" }}>{kicker}</div>
          <div style={{ fontSize: 190, lineHeight: 1.05 }}>{number}</div>
        </div>
        <div style={{ fontSize: 46, lineHeight: 1.2, maxWidth: 1000 }}>{ending.epitaph}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, borderTop: "4px solid #1d2433", paddingTop: 20 }}>
          <span>Loophole City</span>
          <span>${ending.stats.treasury.toLocaleString("en-US")}</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: font ? [{ name: "Fraunces", data: font, weight: 800, style: "normal" }] : undefined,
    },
  );
}
