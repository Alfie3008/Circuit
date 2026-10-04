# CIRCUIT — Handoff

Written 2026-10-04 for the developer taking over the back end (fee claiming,
coin launch, project wallets, real money, on-chain agents). It describes what
exists, why it was built that way, what is assumed, and what your back end has
to provide. Read §0 and §8 first if you're short on time.

The repo has two parts:

- `SPEC.md` — the original product spec (1,300 lines). Useful for intent, but
  **parts of it are superseded by decisions recorded here** (see §1.3).
- `circuit/` — the app (Next.js). All code paths below are relative to `circuit/`.

---

## 0. TL;DR

**What CIRCUIT is:** a website where a non-technical person ("normie") designs
how a pump.fun coin behaves, by snapping blocks together (Scratch-style), then
launches the coin. The blocks decide what happens on events (trades, volume
milestones, timers, holder counts…) and, crucially, **how the coin's creator
fees are spent**. After launch the rules are locked forever, run on Circuit's
servers, and every run leaves a public receipt that anyone can verify on Solana.

**What's built (all in this repo, working, tested):**
the block editor; a custom language (Circuit IR) with a validator; an
interpreter that runs identically in the browser (simulator) and on the server
(live); 112 blocks; AI (build a program from a sentence, and AI blocks inside
programs) with a real-cost spend meter; read-only Solana (trades, wallet,
holders, graduation, token balances) via Helius; the always-on server (Postgres,
cron, webhooks, per-project locking, limits); wallet sign-in; public coin pages;
proof on Solana (rules fingerprints, Merkle-anchored receipts, a real Verify
button); a safe web fetcher; extensive failsafes.

**What is NOT built and is yours:** anything that moves real money or creates
things on chain on a coin's behalf:
1. Launch a coin on pump.fun with its **creator-fee recipient = a per-coin project wallet**.
2. Hold and use that project wallet's keys (custody).
3. Claim the creator fees into the project wallet (before and after graduation).
4. Execute the money actions the rules ask for (transfer, buy, sell, rewards, paying for AI) from the project wallet, safely.
5. On-chain agents (if they get their own wallets).

Everything in Circuit that touches money today is **simulated** and clearly
labelled so. The code was structured so these become adapter implementations
(§4.3, §8.3), not a rewrite.

---

## 1. Product

### 1.1 Audience
Non-technical coin creators. The bar is "a normie can follow along". Every
decision below leans toward: automatic defaults over settings, plain-English
messages over technical ones, nothing that only power users need. (Example: a
"backtest" feature was built and then removed because only the builder found
it useful.)

### 1.2 The core model (decided 2026-10-04 by the founder)
1. **Design**: the creator builds rules in blocks, including exactly how fees are spent (AI, buybacks, rewards, payouts to themselves, anything).
2. **Test**: in the builder's simulator (fake trades, fake money, real AI optional).
3. **Launch**: Circuit creates the coin on pump.fun. The coin's **creator-fee recipient is a project wallet made for that coin**, not the creator's personal wallet.
4. **Run**: fees land in the project wallet, get claimed, and are spent **only as the rules say**. The creator earns whatever the rules pay them (e.g. a block "send 30% of fees to my wallet"), visibly.
5. **Locked**: the rules cannot change after launch. **No emergency pause** (founder's decision). So the simulator and pre-launch checks carry all the safety weight, and each coin must be pinned to the Circuit runtime version it launched on (not built yet, §7).

### 1.3 Decisions that supersede SPEC.md
- **No "I already have a coin" mode.** SPEC describes Existing Token mode; it was built (it's the only real mode today) but the founder dropped it from the product ("too complicated and frankly useless"). Its *trade-watching code* is exactly what launched coins need, so it stays; only the user-facing option goes away (not done yet).
- **Rules locked at launch.** Phase 8 built rule *versioning* (republish → new version written to Solana). Under the locked model there will be one version, at launch.
- **Who pays for AI:** today, Circuit's own Anthropic key pays, and a coin's AI is capped at 90% of the creator fees it has earned (measured from trade volume × fee rate). That was a stopgap. In the target model the **project wallet pays** for its AI from claimed fees. See §6 assumption A3.
- **Business model:** the founder launches a main "Circuit" coin whose fees partly fund the platform (servers, DB, RPC). Each launched coin pays its own running costs (AI etc.) from its own fees. **Open question:** does each launched coin also pay the platform a % of fees? Not decided.

### 1.4 What a user does, end to end (target)
Home → Builder (`/build`) → pick a template or "Build with AI" (describe it in a sentence) → edit blocks → simulate events (Buy, Sell, +10 SOL, Fees, Timer…) and watch blocks light up, receipts, world, feed → read the plain-English version of the rules → Launch (name, ticker, image, wallet sign-in, checklist, one transaction) → coin page `/p/<slug>` shows rules in plain English, world/agents/feed, activity with receipts, Verify buttons.

---

## 2. Status at a glance

| Area | State | Where |
|---|---|---|
| Block editor (Blockly, custom renderer/theme) | Real | `src/components/builder`, `src/lib/blocks` |
| Circuit IR + Zod validation + Blockly↔IR round trip | Real | `src/lib/ir` |
| Interpreter (browser + server, same code) | Real | `src/lib/runtime` |
| 112 blocks in 13 categories, 4 templates | Real | `src/lib/blocks/library`, `src/lib/templates` |
| Plain-English rules (generated, not AI) | Real | `src/lib/explain` |
| Build with AI (sentence → program) | Real (Anthropic) | `src/lib/ai/compile.ts`, `/api/compile` |
| AI blocks in programs | Real (Anthropic) with fallbacks | `src/lib/ai/runtime.ts`, `/api/ai`, runner |
| AI spend meter (real token cost, hard daily stop) | Real | `src/lib/ai/spend.ts`, `meter.ts` |
| Solana reads (trades, SOL/token balances, holders, graduation, creator) | Real (Helius or any RPC) | `src/lib/chain` |
| Always-on server: Postgres store, cron, Helius webhooks, runner | Real | `src/lib/server` |
| Wallet sign-in (Sign in with Solana) | Real | `src/lib/server/auth.ts`, `/api/auth/*` |
| Publishing + public coin page | Real | `/api/projects*`, `src/app/p/[slug]` |
| Proof: rules fingerprint memo, Merkle-anchored receipts, Verify | Real (anchoring needs a funded key) | `src/lib/proof`, `src/lib/server/anchor.ts` |
| Safe web access (pages, HTTP, webhooks) | Real | `src/lib/server/safeFetch.ts`, `web.ts` |
| Failsafes (no program can crash Circuit) | Real, fuzz-tested | §4.2 |
| **Coin launch on pump.fun** | **Not built** | yours |
| **Project wallet + key custody** | **Not built** (treasury simulated) | yours |
| **Fee claiming** | **Not built** (fees only *estimated* from volume) | yours |
| **Real money actions** (transfer/buy/sell/rewards) | **Simulated** | yours |
| On-chain agents | Not built (agents live in the DB) | yours |
| Web search | Simulated (needs a search API key) | — |
| Image generation | Placeholder (needs an image API) | — |
| Post to Discord/Telegram/X, email | Simulated | — |
| Launch flow UI, hiding "I have a coin" | Not built | planned next |
| Runtime version pinning | Not built | needed for "locked" |

---

## 3. Repo map and how to run

### 3.1 Stack
Next.js 16.3.8 (App Router; note `circuit/AGENTS.md`: this Next version has breaking changes vs. older docs, e.g. `error.tsx` gets `retry` not `reset`), React 19, TypeScript, Tailwind 4, Blockly 12 (Zelos-based custom renderer), Zod 4, Zustand 5, `postgres` (postgres.js) 3, `@anthropic-ai/sdk`, Vitest 4. `@solana/web3.js` is pinned to **1.98.4** and used **only in the browser** (wallet signing) and in tests — see §5.8.

### 3.2 Layout (`circuit/src`)
```
app/                 pages + API routes (Next App Router)
  build/             the builder
  p/[slug]/          public coin page
  api/               see §3.4
  dev/block-export/  dev-only: exports real block SVG/PNGs for design work
components/          UI (builder, proof/receipts, runtime panels, site)
lib/
  blocks/            block library (specs), Blockly registration, renderer, theme, toolbox
  ir/                Circuit IR schema, validate (parseProgram), Blockly<->IR, fingerprint
  runtime/           interpreter, engine (trigger/begin/finish), events, adapters, state, values
  explain/           IR -> plain English
  ai/                compile (NL -> IR), runtime ops, model caller, spend meter, guard
  chain/             Solana: RPC, parsing, creator lookup, base58/PDA/memo tx (keys.ts), client adapters
  server/            store (memory/file + Postgres), runner, tick (cron), chainFeed, helius, projects,
                     auth, proofs, anchor, publicView, safeFetch, web
  proof/             fingerprints, Merkle tree, memos, browser Verify
  fuel.ts            AI fuel (90%-of-fees stopgap, see §1.3)
  templates/         4 starter programs as IR
store/               Zustand stores: project (editor), runtime (simulator), account, liveChain
```

### 3.3 Run it
```bash
cd circuit
npm install
cp .env.example .env.local   # fill in what you need; everything is optional for a first run
npm run dev                  # http://localhost:3000
npm run cron                 # second terminal: calls /api/cron/tick every minute (timers, polling, anchoring)
npm test                     # vitest (~140 tests, ~5 s)
npm run typecheck && npm run lint
```
- Without `DATABASE_URL`, the server stores data in `circuit/.circuit-data/db.json` (single process only).
- Postgres store tests: `CIRCUIT_TEST_DATABASE_URL=postgres://… npm test`. **They TRUNCATE Circuit's tables** — use a separate database.
- Load test: `CIRCUIT_LOAD_TEST=1 CIRCUIT_TEST_DATABASE_URL=… npx vitest run src/lib/server/load` (300 live projects, 2,000-trade burst; passes against Supabase in ~2.5 min from a home connection).

### 3.4 API routes
| Route | Purpose | Auth |
|---|---|---|
| `GET/POST /api/ai` | runtime AI op for builder runs; GET = status + today's spend | guard (password/localhost) |
| `POST /api/compile` | Build with AI | guard |
| `/api/auth/nonce`, `verify`, `me`, `logout` | Sign in with Solana | — |
| `GET /api/chain/balance?wallet=[&mint=]`, `events`, `holders`, `status` | chain reads for the builder | guard |
| `GET /api/web/open`, `/api/web/get` | builder's real web reads (safe fetcher) | guard |
| `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id` | publish, settings, unpublish | wallet session |
| `POST /api/projects/:id/rules` | record a rules fingerprint memo tx | wallet session |
| `GET /api/proof/creator?mint=`, `/api/proof/blockhash` | creator check, blockhash for the memo tx | wallet session |
| `GET /api/p/:slug`, `/proof?receipt=`, `/tx?receipt=|version=` | public coin page data, receipt proof, proof-tx fallback | public, IP rate-limited |
| `GET /api/cron/tick` | timers, chain polling, holder refresh, anchoring | `CRON_SECRET` or localhost |
| `POST /api/webhooks/helius` | Helius raw webhook | `HELIUS_WEBHOOK_AUTH` header |
| `GET /api/server/status` | how the server is configured (no secrets) | — |

"guard" = `src/lib/ai/guard.ts`: if `CIRCUIT_AI_PASSWORD` is set, requests need the `x-circuit-password` header; if not set, only localhost is served. Per-client per-minute limits; in-memory (see §7).

### 3.5 Environment variables
All documented in `circuit/.env.example`. The important ones: `ANTHROPIC_API_KEY`, `CIRCUIT_COMPILE_MODEL` (Sonnet 5.5), `CIRCUIT_RUNTIME_MODEL` (Haiku 4.5), `CIRCUIT_AI_DAILY_USD` (hard daily AI stop, whole server), `HELIUS_API_KEY` (or `CIRCUIT_SOLANA_RPC_URL`), `DATABASE_URL` (Supabase *transaction pooler*, port 6543), `CIRCUIT_SESSION_SECRET`, `CRON_SECRET`, `HELIUS_WEBHOOK_AUTH`, `CIRCUIT_PUBLIC_URL`, `CIRCUIT_ANCHOR_KEY` (funded keypair for receipt batches), `CIRCUIT_WEB_ENABLED`, `CIRCUIT_CREATOR_FEE_RATE`.

---

## 4. Architecture

### 4.1 The pipeline
```
Blockly workspace JSON
   │  lib/ir/fromBlockly.ts          (pure JSON transform)
   ▼
Circuit IR (Program)  ◄── Build with AI writes IR directly (lib/ai/compile.ts), validated + repaired
   │  lib/ir/validate.ts parseProgram()   Zod shape + connection types + canonical form; NEVER throws
   ▼
validated Program ──► fingerprint (sha256 of canonical rules)      lib/ir/fingerprint.ts, lib/proof
   │               ──► plain English                                 lib/explain
   ▼
engine.trigger(state, program, event) → matches (scripts whose event block fires)
engine.begin(...) → receipt + async generator  ──►  interpreter (lib/runtime/interpreter.ts)
   │                                                   └─ outside world ONLY via adapters (ai, web, chain)
   ▼
engine.finish(...) → receipt closed, world trimmed
   ▼
Browser: simulator (store/runtime.ts, paced, debuggable)   |   Server: runner (lib/server/runner.ts)
```

**Circuit IR** (`lib/ir/schema.ts`): `Program = { version: 1, variables, scripts: [{ event: IRNode, body: IRNode[] }], loose }`. Every node is `{ type, id?, ...fields }`; each block spec in `lib/blocks/library/*` declares its IR type and fields, and the Zod schema is generated from the specs. Values are literals or nested reporter nodes. Block ids are kept so receipts/errors can point at canvas blocks.

### 4.2 Interpreter, limits and failsafes
`lib/runtime/interpreter.ts` walks IR. It is an async generator that yields before each statement, so the browser can pace, pause, step and highlight; the server just drains it. **No user or AI code is ever evaluated** — every node type maps to fixed behaviour.

Limits (`lib/runtime/state.ts` `LIMITS`, interpreter constants): 500 steps/run, REPEAT ≤ 1,000, values ≤ 100k chars, 500 agents, 2,000 entities, 200 bounties, 200 names per table; agent memory/history, collections, submissions and feed keep their newest entries; receipts ≤ 600 lines × 2,000 chars; server never saves a world > ~4 MB (the run's changes are undone and the receipt says why). Chains of events raised by a run: ≤ 25.

Failsafes: every adapter answer is checked (`guarded()` in `lib/runtime/adapters.ts`): AI failure/junk → simple fallback answer (label says why); web failure → plain error; chain failure → "unknown". Unexpected JS errors become "Something went wrong in the X block, so this run stopped safely". `parseProgram` checks size/nesting iteratively first (150 deep, 20k parts) and never throws. A fuzz test (`lib/runtime/failsafe.test.ts`) builds 1,000 random programs from every block, runs them with working/failing/junk adapters, and asserts no raw error ever escapes.

### 4.3 Adapters — the seam for your back end
Everything outside the interpreter goes through three interfaces in `lib/runtime/adapters.ts`:

```ts
interface AiAdapter    { label; ask; structured; choose; classify; summarize; identity; decide; generateText; review; runAgent }
interface WebAdapter   { label; search(query); open(url): Page; request(method, url, headers, body): HttpResult }
interface ChainAdapter { label; balance(wallet): number|null; tokenBalance(wallet, mint): number|null }
```
Implementations: mocks (`mockAi/mockWeb/mockChain`), browser (`remoteAi` in `lib/runtime/remoteAi.ts`, `remoteWeb/remoteChain` in `lib/chain/client.ts`), server (runner's `budgetedAi`, `liveWeb` in `lib/server/web.ts`, `solanaChain` in runner.ts).

**There is no money adapter yet.** Money blocks (`sim_transfer`, `sim_buy`, `sim_sell`, `sim_reward`, `budget_*`, `treasury`) act on `state.treasury` / `state.budgets` / `state.portfolio` inside the interpreter (search `case "sim_` in interpreter.ts). Making them real = adding a `FinanceAdapter` (§8.3) and routing those cases through it.

### 4.4 Runtime state (one per project)
`RuntimeState` (`lib/runtime/state.ts`): variables, agents (name, species, personality, memory, inventory, budget, custom props…), entities, collections, counters, website values, feed, **treasury {SOL, USDC} (simulated)**, budgets, portfolio, bounties, market {totalVolume, marketCap, holders, trades, ticks, priceSol}, cooldowns, recent runs (receipts), seed. Plain JSON. Browser keeps it in localStorage per project; server in Postgres (`project_state`).

### 4.5 The server
- **Store** (`lib/server/types.ts` `Db` interface; `memoryDb.ts` file store for dev, `pgDb.ts` Postgres). Tables (auto-created in schema `circuit`): `projects` (incl. `proof` jsonb), `project_state` (state, meta, **version** for optimistic concurrency), `receipts` (+ `batch_id`, `leaf_index`), `seen` (claimed tx signatures per project), `ai_usage` (project/day: calls, usd, fees_usd), `batches` (receipt anchor batches).
- **Publish** (`lib/server/projects.ts`): re-validates the program server-side (browser never trusted), slug rules, creator check (§4.8), settings (live on/off, reset world, layout).
- **Runner** (`lib/server/runner.ts` `runProject`): per-project in-process lock + versioned state writes (two servers can't clobber each other; loser retries on fresh state, ≤ 3 attempts); runs per project per minute (60), time budget per invocation (20 s), WAIT capped at 10 s on the server, AI allowance (fuel + server daily cap), per-event try/catch, world-size guard, receipts stored.
- **Events in** (`lib/server/chainFeed.ts`): Helius raw webhooks (`/api/webhooks/helius`, one webhook auto-registered for all watched addresses, `lib/server/helius.ts`) and cron polling as a safety net (every minute without webhooks, every 10 with). Every event is **claimed** (`seen` table, key `signature:type`) before running, so a tx that arrives both ways runs once. `intake()` also records creator-fee estimates (§6 A3).
- **Cron tick** (`lib/server/tick.ts`, `/api/cron/tick`): for each live project: due timers (`schedule.ts`: every-N-minutes and at-time in the project's time zone), chain polling, holder-count refresh (every 10 min), then receipt anchoring (`anchor.ts`). 45 s budget per tick, 4 projects in parallel.

### 4.6 Solana reads (`lib/chain`)
Trades are detected **from balance changes, not program instructions** (`parse.ts`): if the transaction signer's balance of the mint changed, it's a trade; SOL moved the other way (+ wrapped SOL) is the size. This works the same on the pump.fun bonding curve, after graduation, and on any DEX, without decoding each program. Also parsed: SOL arriving at a watched wallet, pump.fun `Migrate` (graduation). Market cap = trade price × supply × SOL/USD (Jupiter price, fallback env). Holder count = Helius DAS `getTokenAccounts` (≤ 20 pages). Token balances = `getTokenAccountsByOwner`. All RPC goes through our own `rpc()` (no SDK on the server).

### 4.7 AI (`lib/ai`)
- **Compile** (`compile.ts`): a system prompt with the full block catalogue (generated from specs) + JSON schema of IR; the model returns IR; `parseProgram` validates; on failure the issues are sent back for repair (bounded attempts). Offline fallback: hand-written examples for demo prompts. Prompt caching on the system prompt (verified: 2nd build ~⅓ the cost).
- **Runtime ops** (`runtime.ts`): each AI block is a small typed op (ask, structured, choose, classify, identity, decide, review, runAgent…) on the cheaper model.
- **Cost** (`spend.ts`, `meter.ts`): every call is priced from the token usage Anthropic returns (input, output, cache write 1.25×, cache read 0.1×; unknown models at the top rate) and recorded in `ai_usage`; past `CIRCUIT_AI_DAILY_USD` all AI stops before sending. Live coins also check their AI fuel.

### 4.8 Proof on Solana (`lib/proof`, `lib/server/proofs.ts`, `anchor.ts`)
- **Rules fingerprint** = SHA-256 of the canonical, validated program (layout and block ids stripped, keys sorted). The owner's wallet writes `circuit:rules:v1:<slug>:<sha256>` in a Memo-program transaction; the server reads it back from chain, checks signer + fingerprint, records a version.
- **Receipts**: each finished server receipt's leaf = SHA-256 of its canonical JSON; it also records the rules fingerprint it ran with. Every ~3 min the cron batches unanchored receipts (≤ 5,000, claimed with `FOR UPDATE SKIP LOCKED`), builds a Merkle tree, writes `circuit:batch:v1:<root>:<count>` signed by `CIRCUIT_ANCHOR_KEY`, confirms via signature status, and frees the receipts if it never lands. One network fee per batch regardless of volume.
- **Verify** (browser, `lib/proof/verify.ts`): recomputes the receipt hash, fetches its Merkle path, reads the batch tx **from Solana's public RPC** (server endpoint only as a labelled fallback), checks the path reaches the root, and that the receipt's rules fingerprint is a version the creator wrote.
- **Creator check**: pump.fun bonding curve PDA `["bonding-curve", mint]`, `creator` field at byte offset 49; else the mint's first-transaction signer. In the launch model this check becomes unnecessary (Circuit creates the coin).

### 4.9 Auth
Sign in with Solana: wallet signs a one-time message (nonce cookie, 10 min), server verifies ed25519, sets an HMAC-signed session cookie (30 days, `CIRCUIT_SESSION_SECRET`). Owner = wallet address. Drafts in the builder are **browser-only (localStorage)**; only published projects live on the server.

### 4.10 Safe web (`lib/server/safeFetch.ts`)
http/https on ports 80/443 only, no URL credentials, every resolved address checked **at connect time** (private/loopback/link-local/metadata/reserved and IPv6 equivalents refused — defeats DNS rebinding), ≤ 3 redirects each re-checked, 8 s / 2 MB, pages reduced to title/text/links. 10 web calls per run. In the builder only reads are real; sends (POST, webhooks) are simulated.

---

## 5. Why it was built this way (and what was rejected)

1. **Own IR + interpreter instead of generating JavaScript.** Programs come from normies and from an LLM; executing generated code is unsafe and unverifiable. A fixed interpreter over a validated IR gives: safety (no eval), identical behaviour in simulator and live, a stable fingerprint, plain-English output, step-by-step debugging, and strict limits. Cost: every block's behaviour is hand-written in `interpreter.ts`.
2. **Same engine in browser and server.** "What you simulated is what runs." The simulator isn't a model of the server; it is the server's code with mock adapters.
3. **Adapters as the only door to the outside world.** Lets mocks, browser, and server implementations swap without touching the interpreter, and is where your back end plugs in.
4. **Read trades from balance deltas, not instruction decoding.** pump.fun's program changes, graduation moves trading to PumpSwap, aggregators route through other programs. Balance deltas of the signer catch all of them with one parser. Weakness: see A5.
5. **Webhooks + polling + claim table.** Webhooks are fast but can drop; polling is reliable but slow; the claim table makes running twice impossible. Alternative considered: Helius enhanced/parsed webhooks — rejected to keep one parser for both paths (raw tx shape = `getTransaction` shape).
6. **Serverless-friendly server (Vercel + cron).** Every piece is request-scoped: runs finish within a time budget, WAIT is capped at 10 s, timers are evaluated by a once-a-minute tick. This made deployment trivial but is the main architectural limitation (see §9 — a long-running worker on Railway would lift it).
7. **Optimistic concurrency on state (version column) instead of DB locks across a run.** Runs can take seconds (AI calls); holding a DB lock that long on a pooled Supabase connection is worse. Conflicts retry on fresh state.
8. **No Solana SDK on the server.** `@solana/web3.js` 1.x's CommonJS build fails on Node 20.15 (its websocket dep requires an ESM-only `uuid`), and it drags in a large dependency tree with an open DoS advisory in its RPC client. The server needs very little: base58, PDA derivation, and a one-instruction memo transaction — hand-written in `lib/chain/keys.ts` and **checked byte-for-byte against web3.js in tests** (`keys.test.ts`). Signing uses `node:crypto` ed25519. web3.js is only used in the browser to hand a transaction to the user's wallet. **If your stack already uses a Solana SDK server-side, feel free to replace this** — just keep the tests' behaviour.
9. **Merkle batches for receipts** instead of one transaction per receipt: cost and rate limits. One tx per ~3 minutes for the whole platform.
10. **Postgres via postgres.js, not the Supabase client.** Plain SQL, works with any Postgres (Railway Postgres is fine); tables live in a private `circuit` schema so Supabase's public REST API doesn't expose them. Uses the transaction pooler (no prepared statements).
11. **Drafts in localStorage.** Prototype simplicity; no account needed to build. Cross-device drafts would need server storage (not built).

---

## 6. Assumptions that may be wrong (ranked by risk)

**A1 — pump.fun creator-fee mechanics (HIGH).** The whole product assumes a coin can be created on pump.fun with its **creator-fee recipient set to a wallet other than the signer** (a per-coin project wallet), and that fees can then be claimed from that wallet programmatically, before and after graduation. Not verified. If creator = signer is fixed, the project wallet itself must sign the create transaction (then it needs SOL for creation first), or a fee-sharing/`set_creator` mechanism is needed. **This is the first thing to confirm with your tech.**

**A2 — Bonding-curve layout (MEDIUM).** The creator check reads `creator` at offset 49 of the bonding-curve account (8 discriminator + 5×u64 + 1 bool). Correct for the layout we know; newer pump.fun versions (create_v2, Token-2022 mints, other modes) may differ. Code: `lib/chain/creator.ts`. Mostly moot once Circuit launches coins.

**A3 — Fees are ESTIMATED, not measured (HIGH for money).** `intake()` (`lib/server/chainFeed.ts`) adds `trade SOL × CIRCUIT_CREATOR_FEE_RATE (0.003) × SOL/USD` per claimed trade. pump.fun fee rates differ before/after graduation and by market-cap tier, and trades missed by the parser aren't counted. Fine as an AI-spend cap; **not fine for anything that spends real money.** Real spending must be driven by the project wallet's actual balance / actual claimed amounts from your system.

**A4 — Circuit fronts AI cost (business).** Today Circuit's Anthropic key pays and is capped by the estimate in A3. Target: project wallet pays. Needs a mechanism: periodically debit the project wallet for metered AI usage (usage is already recorded exactly per project in `ai_usage`), or prepay credits.

**A5 — Trade detection by signer balance delta (MEDIUM).** Misses or misattributes: trades where the fee payer isn't the token owner (relayers, some bots), multi-wallet bundles, and transfers that aren't trades but change the signer's balance (e.g. a signer sending tokens to someone is reported as a "sell" with ~0 SOL). Market cap uses `price × supply × SOL/USD` from a single trade (noisy). If your stack has a proper pump.fun/PumpSwap event decoder, it would be better.

**A6 — Single-region serverless with a 1-minute cron (MEDIUM).** Timers have 1-minute resolution; WAIT > 10 s is shortened on the server; in-memory rate limits and the per-project lock are per-instance (versioned writes keep data safe, but rate limits are not shared across instances).

**A7 — Holder counts via Helius DAS paging (LOW/MEDIUM).** Up to 20 pages × 1,000 accounts; big coins hit the cap (count marked "capped") and each refresh costs ~20 credits. Every 10 minutes per live coin.

**A8 — SOL/USD from Jupiter lite API (LOW).** `lite-api.jup.ag/price/v3`, cached 60 s, fallback `CIRCUIT_SOL_USD`.

**A9 — Anthropic models/prices (LOW).** Prices hard-coded in `lib/ai/spend.ts` (Sonnet 5.5 $2/$10, Haiku 4.5 $1/$5 per MTok). Unknown models are priced at the top rate.

**A10 — Agents are not on chain.** "Create agent" makes a DB record with AI-generated identity. If on-chain agents (wallets, NFTs, identities) are in scope, the data model (`Agent` in state.ts) needs an on-chain id and the create/remove blocks need a chain adapter.

---

## 7. Known gaps and unfinished work
- Launch flow UI; removing "I have a coin" from the UI; project wallet/treasury display (planned next, front end).
- **Runtime version pinning** (needed for "locked"): store the runtime version on each coin at launch; keep old block behaviour working on newer releases (or run each coin on its pinned interpreter version).
- Rate limits and AI-guard counters are in memory (per instance).
- WAIT on the server capped at 10 s (needs a scheduler / long-running worker).
- Search, image generation, Discord/Telegram/X posting, email: simulated; need provider keys.
- Bounty submissions are simulated (needs a public submission form on the coin page).
- Block for "per-coin secrets" (e.g. Discord webhook URLs/tokens) — no encrypted secret storage yet.
- Tests that hit Postgres truncate tables — run them on a separate DB.
- `fuel.ts`' 90% rule is a stopgap (§1.3, A3, A4).
- Webhook POSTs from programs aren't signed (no per-coin signing secret yet).

---

## 8. What the back end needs to do

### 8.1 Responsibilities
1. **Launch**: create the pump.fun coin (name, ticker, image, description) with creator-fee recipient = a new project wallet; return mint, project wallet address, tx signature. Ideally in the same flow, the rules fingerprint is written (Circuit already does the memo; it can be a second tx).
2. **Custody**: generate and hold one project wallet per coin; sign automatically for that coin's allowed actions only. Strongly prefer keys in a KMS/MPC/key-management service with per-key policies (max per tx, max per day, allowed programs/destinations) as a second line of defence behind Circuit's rule limits.
3. **Claim fees** into the project wallet on a schedule (bonding curve and post-graduation), and report actual amounts.
4. **Execute money actions** requested by running programs: transfer SOL/tokens, buy/sell (swap, e.g. via Jupiter), pay rewards, pay for AI. Idempotent (each request carries an id; retries must not double-pay), with pre-send simulation and hard limits.
5. **Report**: balances, claimed fees, executed actions with signatures (Circuit puts them on receipts with Solscan links).
6. (If in scope) **on-chain agents**: agent wallets/identities.

### 8.2 Flows (proposed)
```
LAUNCH
 builder ──(program validated, fingerprint)──► Circuit server ──► your API: createCoin({name, symbol, image, metadata, projectId})
                                                                   ◄── { mint, projectWallet, signature }
 Circuit: store mint/projectWallet on the project, pin runtime version, write rules memo, mark live,
          start watching the mint (existing chainFeed/webhook code)

FEES
 your scheduler: claimFees(projectWallet) → { amountSol, signature }  ──► POST Circuit /api/... (to build) 
 Circuit: event "creator_fees" {amount, signature} → programs with "when creator fees arrive" run
          (this event type and block already exist; today it's only simulated)

SPEND
 program runs "transfer 0.1 SOL to X" ──► FinanceAdapter.transfer({projectId, to, amount, idempotencyKey})
          ──► your API ──► { signature } | error
 Circuit: receipt line "Sent 0.1 SOL to X" + Solscan link; on error, plain message, run continues/stops per block
```

### 8.3 Proposed contract between Circuit and your service
Circuit side (to add in `lib/runtime/adapters.ts`, implemented by a thin HTTP client to your service, mocked in the builder):
```ts
interface FinanceAdapter {
  readonly label: string;
  /** Project wallet balances (SOL, USDC, tokens). */
  balances(projectId: string): Promise<{ sol: number; tokens: Record<string, number> } | null>;
  transfer(req: { projectId: string; to: string; amount: number; asset: "SOL" | string; idempotencyKey: string; memo?: string }): Promise<{ signature: string }>;
  swap(req: { projectId: string; from: string; to: string; amount: number; maxSlippageBps: number; idempotencyKey: string }): Promise<{ signature: string; received: number }>;
}
```
Your service (any stack; you mentioned Railway):
```
POST /coins                  { projectId, name, symbol, imageUrl, description } → { mint, projectWallet, signature }
GET  /projects/:id/wallet    → { address, sol, tokens }
POST /projects/:id/transfer  { to, amount, asset, idempotencyKey } → { signature }
POST /projects/:id/swap      { from, to, amount, maxSlippageBps, idempotencyKey } → { signature, received }
POST /projects/:id/claim     → { amountSol, signature }            (or your own schedule + callback)
Callback to Circuit: POST {CIRCUIT}/api/finance/events  (signed)   { projectId, type: "creator_fees"|"transfer_confirmed"|…, … }
```
Auth between the two: a shared secret or signed requests (HMAC), never exposed to the browser. Idempotency keys = `${projectId}:${receiptId}:${blockId}:${n}` so a retried run can't pay twice.

### 8.4 Where Circuit code changes when you plug in
- `lib/runtime/adapters.ts`: add `FinanceAdapter`, mock, and `guarded()` wrapper (limits, idempotency).
- `lib/runtime/interpreter.ts`: `sim_transfer`, `sim_buy`, `sim_sell`, `sim_reward`, `treasury`, `wallet_balance("treasury")` → call the adapter on the server; keep simulated in the builder.
- `lib/server/runner.ts`: construct the real FinanceAdapter for live coins.
- `lib/server/projects.ts` / `types.ts`: project gets `mint`, `projectWallet`, `runtimeVersion`, launch tx.
- `lib/server/chainFeed.ts`: real `creator_fees` events from your callbacks; drop the volume-based estimate for money (keep it only if useful as a display).
- `lib/fuel.ts`: AI paid from the project wallet (A4).
- New route for your callbacks (`/api/finance/events`), verified like the Helius webhook.

### 8.5 Things to decide together
- Custody model (A1/§8.1-2).
- Whether launched coins pay a platform %.
- Hosting topology: keep Circuit on Vercel + your service on Railway, or move Circuit's runner to a long-running worker on Railway (§9).
- Limits on money actions per coin (per tx, per day) — must be fixed at launch since rules are locked.
- How the user pays for coin creation (their wallet funds the project wallet? Circuit fronts it?).

---

## 9. Hosting notes
The code assumes serverless (Vercel): request-scoped work, `/api/cron/tick` every minute (Vercel Pro cron, or a free external cron like cron-job.org with `CRON_SECRET`), Helius webhooks to `CIRCUIT_PUBLIC_URL/api/webhooks/helius`. It runs anywhere Next.js runs (`npm run build && npm start`), including Railway; there, a small always-on worker calling `tick()` (and draining webhook events from a queue) would remove the 1-minute timer resolution and the 10 s WAIT cap. Postgres: Supabase or Railway Postgres both work (`DATABASE_URL`; on Supabase use the transaction pooler string).

## 10. Glossary
- **Block / spec**: a draggable piece; its spec (`lib/blocks/library`) defines fields, inputs, shape and IR type.
- **IR**: Circuit's JSON program format. **Script**: an event block + the blocks under it. **Receipt**: the record of one run (trigger, steps, status, proof).
- **Simulator / builder**: `/build`, runs in the browser with fake events. **Live / server run**: a published coin running on real events.
- **Fingerprint**: SHA-256 of canonical rules (pages show the first 8 hex chars). **Anchor / batch**: a Merkle root of receipt hashes written to Solana.
- **AI fuel**: the AI budget of a coin (stopgap: 90% of estimated fees). **Project wallet**: the per-coin wallet receiving creator fees (to be built).
