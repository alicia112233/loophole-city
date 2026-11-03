export type FeedbackEmail = {
  id: string;
  message: string;
  page: string | null;
  created_at: string;
};

/** Feedback is already saved before this runs. Email failures must not invite resubmission. */
export async function notifyFeedback(feedback: FeedbackEmail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.FEEDBACK_EMAIL_TO?.trim();
  const from = process.env.FEEDBACK_EMAIL_FROM?.trim() || "Loophole City <onboarding@resend.dev>";

  if (!apiKey || !to) {
    console.warn("Feedback email is not configured; submission saved", { feedbackId: feedback.id });
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `feedback/${feedback.id}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "New Loophole City feedback",
        text: [
          "Someone sent feedback through Loophole City.",
          "",
          `Page: ${feedback.page || "Not specified"}`,
          `Submitted: ${feedback.created_at}`,
          `Feedback ID: ${feedback.id}`,
          "",
          feedback.message,
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      // Provider responses can include private message content; log only the status and ID.
      console.error("Feedback email rejected; submission saved", {
        feedbackId: feedback.id,
        status: response.status,
      });
      return false;
    }

    console.info("Feedback email accepted", { feedbackId: feedback.id });
    return true;
  } catch {
    console.error("Feedback email request failed; submission saved", { feedbackId: feedback.id });
    return false;
  }
}
