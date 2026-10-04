# CIRCUIT

Design how a pump.fun coin behaves with snap-together blocks, launch it, and
let its creator fees be spent only the way the rules say.

**Start with [`../HANDOFF.md`](../HANDOFF.md)**: what's built, why, the
assumptions, and what the back end (coin launch, project wallets, fee
claiming, real money) needs to provide. The original product spec is
[`../SPEC.md`](../SPEC.md) (partly superseded; see the handoff).

## Run

```bash
npm install
cp .env.example .env.local   # every setting is optional for a first run
npm run dev                  # http://localhost:3000
npm run cron                 # second terminal: timers, chain polling, receipt anchoring
npm test                     # vitest
npm run typecheck && npm run lint
```

Note: this project uses Next.js 16, which differs from older Next.js docs.
See `AGENTS.md`.
