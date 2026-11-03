# Loophole City

You write the laws. Six AI citizens find the loophole.

**Play it:** https://loophole-city.vercel.app

Built for [Claude SG X Supabase: Build with Claude and Supabase](https://luma.com/ClaudesgXsupabase).

## How to play

1. **Take office.** Enter your name to found a town. You are the host.
2. **Invite friends (optional).** They scan the QR code or enter the four-letter town code on their phones.
3. **Write a law.** Type your own or tap a suggestion. It needs a majority of everyone in town, and you can force it through for 5 public trust. If you are playing alone, it passes straight away. A new law starts on the next day.
4. **Press Next day.** Only the host can. Watch what the citizens do with your law, then read the Daily Loophole.
5. **Investigate.** Click a citizen to see their motive, their reasoning and their transactions.
6. **Fix it.** Pass a new law to close the loophole. Only one law is in force at a time, and every fix tends to cause a new problem.
7. **Rewind.** Pick a past day on the timeline, change the law and get a different disaster. Earlier timelines are kept so you can compare them.

Your administration ends when:

- the treasury reaches $0
- public trust reaches 0
- you serve the full 15 days
- you resign in disgrace

You then get a final newspaper and a shareable "Your administration lasted N days" card.

## How to run it

You need Node.js, a [Supabase](https://supabase.com) project and a [Vercel AI Gateway](https://vercel.com/ai-gateway) key.

**1. Install dependencies**

```bash
npm install
```

**2. Create `.env.local`** in the project root:

```bash
AI_GATEWAY_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GAME_SECRET=
```

Set `GAME_SECRET` to any long random string, which you can generate with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Two more settings are optional:

| Variable | Default | What it does |
|---|---|---|
| `LOOPHOLE_MODEL` | `anthropic/claude-opus-5.5` | The model the citizens run on |
| `MAX_DAYS_PER_HOUR` | `120` | Limit on game days per hour across all towns, to protect your AI credit |

**3. Set up the database**

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

**4. Start the app**

```bash
npm run dev
```

Open http://localhost:3000.

**Tests**

```bash
npm test
npm run typecheck
```

With the app running, `node scripts/e2e.mjs http://localhost:3000` checks the full game against your real database. It also makes real model calls, so it uses a small amount of AI credit.
