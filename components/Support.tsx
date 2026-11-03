"use client";

import { useState } from "react";
import { post } from "@/lib/client";

const REPO_URL = "https://github.com/alicia112233/loophole-city";
const DONATE_URL = process.env.NEXT_PUBLIC_DONATE_URL;

/** Star, donate and feedback links, shown on the landing page, in town and on the final edition. */
export function Support({ page }: { page: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setWorking(true);
    setError(null);
    try {
      await post("/api/feedback", { message, page });
      setSent(true);
      setMessage("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <footer className="support">
      <p className="support-note">Loophole City is free to play. Every day in town costs real AI credit.</p>
      <div className="support-links">
        <a className="btn btn-small" href={REPO_URL} target="_blank" rel="noreferrer">
          Star on GitHub
        </a>
        {DONATE_URL && (
          <a className="btn btn-small" href={DONATE_URL} target="_blank" rel="noreferrer">
            Buy the town a coffee
          </a>
        )}
        <button type="button" className="btn btn-small" aria-expanded={open} onClick={() => setOpen(!open)}>
          Suggest an improvement
        </button>
      </div>
      {open &&
        (sent ? (
          <p className="support-thanks" role="status">Filed at Town Hall. Thank you.</p>
        ) : (
          <form className="support-form" onSubmit={send}>
            <label htmlFor={`feedback-${page}`}>What should we change? No account needed.</label>
            <textarea
              id={`feedback-${page}`}
              rows={3}
              maxLength={1000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="support-actions">
              <button className="btn btn-small btn-red" disabled={working || message.trim().length < 3}>
                {working ? "Sending…" : "Send feedback"}
              </button>
              <a href={`${REPO_URL}/issues/new`} target="_blank" rel="noreferrer">
                Or open a GitHub issue
              </a>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
          </form>
        ))}
    </footer>
  );
}