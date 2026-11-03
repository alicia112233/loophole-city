import { after, NextResponse } from "next/server";
import { notifyFeedback } from "@/lib/feedback-email";
import { limits } from "@/lib/limits";
import { claimIpSlot, db, HttpError, route } from "@/lib/server";

export const POST = route(async (req: Request) => {
  const body = await req.json().catch(() => ({}));
  const message = String(body.message ?? "").trim();
  if (message.length < 3) throw new HttpError(400, "Tell us a little more.");
  if (message.length > 1000) throw new HttpError(400, "Keep it under 1,000 characters.");

  if (!(await claimIpSlot(req, "feedback", limits().feedbackPerIpPerDay))) {
    throw new HttpError(429, "Thanks, we have plenty from you today. Please try again tomorrow.");
  }

  const page = String(body.page ?? "").slice(0, 40) || null;
  const { data: feedback, error } = await db()
    .from("feedback")
    .insert({ message, page })
    .select("id, message, page, created_at")
    .single();
  if (error) throw error;
  after(async () => {
    await notifyFeedback(feedback);
  });
  return NextResponse.json({ ok: true });
});
