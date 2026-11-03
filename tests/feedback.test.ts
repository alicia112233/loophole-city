import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyFeedback } from "@/lib/feedback-email";
import { POST } from "@/app/api/feedback/route";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  claimIpSlot: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));

vi.mock("@/lib/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server")>()),
  db: () => ({ from: mocks.from }),
  claimIpSlot: mocks.claimIpSlot,
}));

const feedback = {
  id: "173dd84a-3a08-4002-9342-7da1c45191a5",
  message: "More citizens, please!\n<script>untrusted input</script>",
  page: "landing",
  created_at: "2026-11-03T07:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RESEND_API_KEY", "re_test_private_key");
  vi.stubEnv("FEEDBACK_EMAIL_TO", "owner@example.com");
  vi.stubEnv("FEEDBACK_EMAIL_FROM", "Loophole City <feedback@example.com>");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"id":"email-id"}', { status: 200 })));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  mocks.claimIpSlot.mockResolvedValue(true);
  mocks.from.mockReturnValue({ insert: mocks.insert });
  mocks.insert.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ single: mocks.single });
  mocks.single.mockResolvedValue({ data: feedback, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("feedback email", () => {
  it("sends plain text to the configured mailbox with a submission-specific idempotency key", async () => {
    expect(await notifyFeedback(feedback)).toBe(true);
    expect(console.info).toHaveBeenCalledWith("Feedback email accepted", { feedbackId: feedback.id });
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options?.headers).toMatchObject({
      Authorization: "Bearer re_test_private_key",
      "Idempotency-Key": `feedback/${feedback.id}`,
    });
    const body = JSON.parse(options?.body as string);
    expect(body).toMatchObject({
      from: "Loophole City <feedback@example.com>",
      to: ["owner@example.com"],
      subject: "New Loophole City feedback",
    });
    expect(body.text).toContain(feedback.message);
    expect(body.text).toContain(feedback.page);
    expect(body.text).toContain(feedback.created_at);
    expect(body.html).toBeUndefined();
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each(["RESEND_API_KEY", "FEEDBACK_EMAIL_TO"])("skips delivery if %s is missing", async (key) => {
    vi.stubEnv(key, "");
    expect(await notifyFeedback(feedback)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), { feedbackId: feedback.id });
  });

  it("uses the Resend account-only sender when no verified sender is configured", async () => {
    vi.stubEnv("FEEDBACK_EMAIL_FROM", "");
    await notifyFeedback({ ...feedback, page: null });
    const options = vi.mocked(fetch).mock.calls[0][1];
    const body = JSON.parse(options?.body as string);
    expect(body.from).toBe("Loophole City <onboarding@resend.dev>");
    expect(body.text).toContain("Page: Not specified");
  });

  it("handles provider rejection without logging its private response body", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("Private provider response", { status: 403 }));
    expect(await notifyFeedback(feedback)).toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.any(String), { feedbackId: feedback.id, status: 403 });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("Private provider response");
  });

  it("handles timeouts and network errors without exposing credentials or feedback", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("re_test_private_key " + feedback.message));
    expect(await notifyFeedback(feedback)).toBe(false);
    const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logs).not.toContain("re_test_private_key");
    expect(logs).not.toContain(feedback.message);
  });
});

describe("feedback route", () => {
  const request = (body: object) => new Request("http://localhost/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  it("saves feedback before scheduling email and ignores client-supplied recipients", async () => {
    const response = await POST(request({ message: feedback.message, page: "landing", to: "attacker@example.com" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.insert).toHaveBeenCalledWith({ message: feedback.message, page: "landing" });
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.single.mock.invocationCallOrder[0]).toBeLessThan(mocks.after.mock.invocationCallOrder[0]);
    expect(fetch).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.to).toEqual(["owner@example.com"]);
  });

  it("does not schedule email if saving the feedback fails", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { code: "database_unavailable" } });
    expect((await POST(request({ message: "A valid suggestion" }))).status).toBe(500);
    expect(mocks.after).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not save or email rate-limited feedback", async () => {
    mocks.claimIpSlot.mockResolvedValue(false);
    expect((await POST(request({ message: "A valid suggestion" }))).status).toBe(429);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("does not save or email invalid feedback", async () => {
    expect((await POST(request({ message: "x" }))).status).toBe(400);
    expect(mocks.claimIpSlot).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
