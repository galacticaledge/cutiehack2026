# Socra

Socra is an AI Tutor that incentivizes students to use AI for learning rather than cognitive offloading. It promotes independent learning by rewarding students with cryptocurrency via Solana for engaging with AI to understand concepts, develop problem-solving skills, and arrive at answers themselves instead of relying on AI to think for them.

Spec: [SPEC.md](SPEC.md).

**Stack:** Rust (Axum on Tokio, sqlx/Postgres, solana-sdk + spl-token) · React (Vite, Tailwind, shadcn/ui, KaTeX) · OpenAI Chat Completions.

## Layout

```
backend/            Rust API server (also serves the built React app)
  src/problems.rs   5 seeded problem templates + checkpoints (SERVER ONLY answers)
  src/mathexpr.rs   symbolic engine: safe parser/evaluator (implicit mult, sqrt, pi)
  src/verify.rs     neuro-symbolic step verification (pure, tested)
  src/leak.rs       deterministic leak check (pure, tested)
  src/rewards.rs    reward formula (pure, tested)
  src/answers.rs    answer parsing/checking (pure, tested)
  src/anticheat.rs  paste / tab-away / too-fast flags (pure, tested)
  src/tutor.rs      tutor reply + leak/contradiction guard, regenerate once, safe fallback
  src/claims.rs     LLM claim extraction → symbolic verdicts
  src/custom.rs     bring-your-own problem/topic intake (hidden reference solution)
  src/solana.rs     wallets, minting, balances
  src/routes.rs     HTTP API (SPEC §13)
  src/bin/setup_token.rs   create the LEARN mint
  src/bin/seed.rs          demo accounts, history, cheat sheet, demo-content.md
  migrations/       SQL schema (embedded, applied on startup)
frontend/           Vite + React SPA
```

## Run locally

With Nix flakes enabled, run `nix develop` from the repo root in each development terminal. The shell provides Rust/Cargo, Node.js 22/npm, PostgreSQL 17, and the native Rust build dependencies. Without Nix, install those tools separately.

```bash
cp .env.example .env          # fill SESSION_SECRET (32+ chars), OPENAI_API_KEY

```bash
# One-time Solana setup (optional for local development)
(cd backend && cargo run --bin setup_token -- --keygen)  # paste MINT_AUTHORITY_SECRET into .env
# Fund the printed address at https://faucet.solana.com (devnet)
(cd backend && cargo run --bin setup_token)             # writes MINT_ADDRESS into .env

# Dev: run these in separate terminals from the repo root
(cd backend && cargo run --bin socra)                   # API on :3000 (runs migrations)
(cd frontend && npm ci && npm run dev)                  # UI on :5173, proxies /api → :3000

# Or single process: build the UI and let Rust serve it on :3000
(cd frontend && npm ci && npm run build) && (cd backend && cargo run --bin socra)
```

Tests: `cd backend && cargo test` (rewards, answers, leak, verify, math engine, anti-cheat, templates).

## Demo

```bash
cd backend
cargo run --bin seed              # demo, copycat, demo-b, copycat-b + real-mint history; prints cheat sheet
cargo run --bin seed -- --reset   # wipe ONLY the 4 demo accounts' data and re-seed (between rehearsals)
cargo run --bin seed -- --no-mint # clean accounts, no chain calls
```
Set `DEMO_FIXED_SEEDS=true` so demo accounts get the numbers in the cheat sheet. Paste-ready lines are in `demo-content.md`.

## Docker

```bash
docker compose up -d --build      # db (postgres:17) + app on http://localhost:3000
```
If a local Postgres already uses 5432, set `DB_PORT=5433` in `.env`. Run `seed` from the host against the Compose DB (`DATABASE_URL=postgresql://socra:socra@localhost:$DB_PORT/socra`), or inside the container: `docker compose exec app /app/seed --no-mint`.

## Earning on new topics (knowledge map)

Only the 42 public concepts can earn LEARN. Migration `backend/migrations/0004_personalized_concepts.sql` is the source of public IDs, aliases, bank bindings, and prerequisite edges (page: `/map`). It backfills known session IDs without changing historical evidence and still accepts legacy public inserts that omit `concept_id`. Migration `0003` adds password authentication; `0004` runs after it. Anti-farming rules:

- **Same topic, different words → same node.** Free-text topics still map to the public catalog by alias match, then by an LLM limited to those public IDs. Topics off the public catalog are practice only.
- **One payout per node per user** (`rewards.template_id = "concept:<id>"`, enforced by the existing unique constraint).
- **Prerequisites first:** a node pays only after you've solved and explained every node it builds on.
- **The student never writes the problem.** The LLM templates from the stored concept (including the objective for private concepts); the server picks the numbers, `mathexpr` computes the answer, and an independent LLM solve must agree (`backend/src/quest.rs`). The free-text flow falls back to unchecked practice if it cannot build a checked quest.
- **No public rerolling:** asking again for a public node with an unfinished problem reopens it, even when its attempts are exhausted.
- **Explain-back required** (no half reward), the usual anti-cheat flags (60 s minimum), base 50 instead of 100, and `DAILY_TOPIC_CAP` (default 3) new-topic rewards per day.
- Nodes that already have a bank template earn only through the verified bank problem.
- **Code-tracing topics run the code (Solari).** With `SOLARI_API_KEY` set, computer-science nodes get a Python program instead of a math template. The server fills in the numbers and runs that exact program in a network-less [Solari](https://www.getsolari.com/) sandbox (`backend/src/solari.rs`). What it prints is the answer. Without a key, these nodes fall back to the math path.

### Personalized graph API

`PERSONALIZED_CONCEPTS_ENABLED` defaults to off and does not invalidate existing cookies. When upgrading from username-only login, stop the old app instances and rotate `SESSION_SECRET` before enabling personalization. Rotation signs everyone out; accounts without a password hash need a password provisioned before they can sign back in. After deploying password authentication and invalidating old cookies, set `PERSONALIZED_CONCEPTS_ENABLED=true` to enable the API.

All routes require the existing session cookie. When disabled, the API excludes private concepts, returns `404` for next-step, acceptance, and private session access (even for persisted sessions), and keeps public flows available. When enabled, private concepts are scoped to the signed-in user, always practice-only, and never published. Only accepting a proposal adds it to the map.

| Endpoint | Request and success response |
| --- | --- |
| `GET /api/concepts` | Existing response and progress fields; includes public nodes and, when enabled, the caller’s accepted private nodes. Each adds `practiceOnly` and `objective` (`null` for public nodes). |
| `POST /api/concepts/{conceptId}/next-step` | No body. Returns `{kind:"existing", concept:{id,title,subject,prereqs,bankTemplateId,practiceOnly,objective}}` if an unmastered direct neighbor is ready (successors first, then prerequisites). Otherwise, a demonstrated anchor can get `{kind:"proposal", proposal:{proposalId,anchorId,title,objective,reason,prereqIds}}`. An eligible pending proposal is reused. |
| `POST /api/concept-proposals/{proposalId}/accept` | No body; client-supplied topic fields are ignored. Rechecks the saved prerequisites, then returns `{conceptId}`. Repeating a successful accept returns the same ID. |
| `POST /api/sessions` | Additive `{conceptId}` alternative to `{templateId}` and `{custom}`; returns `{sessionId}`. Starts a bank session when available; otherwise resumes or builds a checked quest. Private quests use numeric checks only, require ready prerequisites, and record attempts and explain-back without any payout. The session view includes `conceptId`, `practice`, and `practiceReason`. |

An exhausted private practice quest can be replaced through `{conceptId}`; the old session and evidence are kept. Unknown and other users’ IDs return `404`; unmet prerequisites, conflicting proposals, or work already in progress for the same topic return `409` (retry shortly for in-progress work). Provider unavailability returns `503`, and malformed proposals return `502`.

New proposals and generated quest builds started by ID (public or private) are limited to 3 and 6 per user per UTC day, respectively (`429` when exhausted). Typed-topic starts share the quest generation claim but do not spend quota. Provider failures consume a reserved attempt; returning existing results or rejecting an in-progress duplicate does not.

## Learning progress

The map and checked Workspace count accepted final-answer checks (right or wrong, including practice) since midnight UTC. The map counts across a concept; the Workspace counts only the current problem session. Invalid or rejected submissions, chat, and custom sessions do not count. Historical session counters and solves can show progress but are not backfilled as daily attempts.

- **New:** no checked attempt. **Learning:** at least one checked attempt or solve.
- **Demonstrated:** a verified solve and an explain-back pass, including legacy and fallback passes.
- **Proficient:** verified solves with actual grader passes on at least two distinct rendered prompts. The same question counts once even if it was generated with different seeds.

The attempt log stores correctness and the number of revealed hints, not the submitted answer. Existing problem identity, solve timing and flags remain available as evidence. Explain-backs record when they were accepted and whether the pass/fail came from the grader or a fallback. None of this changes reward eligibility, amounts, or existing limits.

## Guarantees

- The final answer never reaches the client: answers and checkpoints live only in `backend/src/problems.rs`; the session view omits them; every tutor reply passes the deterministic + LLM leak guard.
- Correctness never comes from the LLM: answers and intermediate steps are checked by `mathexpr`/template ground truth. The LLM only extracts claims and phrases replies.
- Optional features (ElevenLabs read-aloud, Keenable links) hide themselves when their keys are missing.
