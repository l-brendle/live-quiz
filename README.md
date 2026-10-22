# Live Quiz

A small Kahoot-style live quiz. The host writes the questions on the fly, players scan a QR code, choose a nickname and play on their phones. No accounts, no login.

- **Question types:** multiple choice (2–4 options), right or wrong, free text
- **Join any time:** the QR code stays on the host screen during the game
- **Live ranking:** most correct answers first; ties go to the player who answered those questions faster
- **Near real-time sync:** clients poll every ~0.7 s while a question is open, so it runs on plain Vercel serverless functions with nothing else to host

## Hosting a game

1. Open `/host`, write or paste your questions (an example is prefilled; your draft stays in the browser).
2. Click **Create game**. Show the screen to the room: players scan the QR code or enter the PIN on the start page.
3. Click **Start**. Each question closes when the timer runs out or everyone has answered, then the answer and the ranking appear. Click **Next question** to continue.

The question config looks like this:

```
title: Friday Fun Quiz

? What is the capital of Australia?
- Sydney
* Canberra          <- the correct option is marked with *
- Melbourne

? The Great Wall of China is visible from space.
= false             <- right or wrong question

? Which planet is the largest?
time: 15            <- optional, seconds (default 20)
= Jupiter | Jupyter <- free text, | separates accepted answers
```

Free-text answers ignore case, accents and punctuation. JSON works too:
`{"title": "…", "questions": [{"type": "choice" | "truefalse" | "text", "question": "…", "options": […], "answer": …, "time": 20}]}`.

## Deploying to Vercel

1. Import this repository in Vercel (framework preset: Next.js, no settings needed).
2. In the project, open **Storage** → **Create Database** → **Upstash for Redis** (free tier is fine) and connect it to the project. This adds the `KV_REST_API_URL` / `KV_REST_API_TOKEN` environment variables.
3. Redeploy. Done.

Redis is required on Vercel because each request can be served by a different function instance. `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` work too if you create the Upstash database yourself. Games expire after 12 hours.

Without Redis the app falls back to an in-memory store (the host screen shows a warning). That's handy for local development but won't work reliably on Vercel.

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # config parser tests
```

To play from your phone locally, open the host page through your machine's LAN IP (e.g. `http://192.168.1.20:3000/host`) so the QR code points to an address the phone can reach.

## How it works

- `lib/quiz.ts`: config parsing and answer checking
- `lib/game.ts`: game logic. Only the host rewrites the game state; joins and answers go into Redis hashes with atomic `HSETNX`/`HINCRBY`, so many players answering at once can't overwrite each other. Answer time is measured on the server.
- `lib/store.ts`: Upstash Redis or in-memory store
- `app/host/[code]`: host screen (lobby with QR, question, reveal, ranking, podium)
- `app/play/[code]`: mobile player screen

The host's control token lives in the browser's localStorage, so host from the same browser you created the game in.
