"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { post, saveIdentity } from "@/lib/client";
import { CITIZEN_IDS, initialState } from "@/lib/game/types";
import type { Identity } from "@/lib/snapshot";
import { Scene } from "./Scene";
import { Support } from "./Support";

export function Landing() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const out = await post<{ code: string; identity: Identity }>("/api/towns", { name });
      saveIdentity(out.code, out.identity);
      router.push(`/t/${out.code}`);
    } catch (err) {
      setError((err as Error).message);
      setWorking(false);
    }
  };

  return (
    <main className="landing">
      <header className="landing-head">
        <div className="masthead masthead-big">Loophole City</div>
        <div className="paper-meta">
          <span>Population: {CITIZEN_IDS.length}, all of them opportunists</span>
          <span>Treasury: $1,000, for now</span>
        </div>
      </header>

      <div className="landing-grid">
        <section className="landing-copy">
          <h1>You write the laws. They find the loophole.</h1>
          <p className="lede">
            Pass one well-meaning law, then watch six citizens comply with it in the worst way possible.
            Fix it, and something else breaks.
          </p>
          <ol className="story">
            <li><b>Your law:</b> “The town will pay $5 for every piece of litter collected.”</li>
            <li><b>Alice</b> cleans the park.</li>
            <li><b>Bob</b> opens a garbage factory.</li>
            <li><b>Carol</b> buys Bob’s garbage and collects it, repeatedly.</li>
            <li><b>Mayor Mabel</b> announces record environmental progress as the treasury collapses.</li>
          </ol>

          <form className="start" onSubmit={start}>
            <label htmlFor="name">Your name</label>
            <div className="field-row">
              <input id="name" value={name} maxLength={24} placeholder="Councillor…" onChange={(e) => setName(e.target.value)} />
              <button className="btn btn-red" disabled={working || !name.trim()}>
                {working ? "Founding…" : "Take office"}
              </button>
            </div>
          </form>

          <form
            className="start"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) router.push(`/t/${code.trim().toUpperCase()}`);
            }}
          >
            <label htmlFor="code">Joining friends? Town code</label>
            <div className="field-row">
              <input id="code" value={code} maxLength={4} className="code-input" placeholder="ABCD" onChange={(e) => setCode(e.target.value)} />
              <button className="btn" disabled={!code.trim()}>Join town</button>
            </div>
          </form>
          {error && <p className="error" role="alert">{error}</p>}
        </section>

        <div className="stage landing-stage">
          <Scene state={initialState()} active={null} selected={null} busy={false} onSelect={() => {}} />
        </div>
      </div>
      <Support page="landing" />
    </main>
  );
}