import { NextResponse } from "next/server";
import { getTown, loadSnapshot, route } from "@/lib/server";

export const dynamic = "force-dynamic";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ code: string }> }) => {
  const { code } = await ctx.params;
  return NextResponse.json(await loadSnapshot(await getTown(code)));
});
