# Socra

An AI tutor that never gives you the answer. It guides you to it, and pays you in LEARN (a Solana devnet SPL token) for actually learning. Spec: [SPEC.md](SPEC.md).

**Stack:** Rust (Axum on Tokio, sqlx/Postgres, solana-sdk + spl-token) · React (Vite, Tailwind, shadcn/ui, KaTeX) · OpenAI-compatible LLM via AIsa with OpenAI fallback.

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

Prereqs: Rust (stable), Node 22+, Postgres (local, or `docker compose up -d db`).

```bash
cp .env.example .env          # fill SESSION_SECRET (32+ chars), OPENAI_API_KEY and/or AISA_API_KEY

# One-time Solana setup
cd backend
cargo run --bin setup_token -- --keygen     # paste MINT_AUTHORITY_SECRET into .env
#   fund the printed address at https://faucet.solana.com (devnet)
cargo run --bin setup_token                 # creates the mint, writes MINT_ADDRESS into .env

# Dev: two terminals
cargo run                                   # API on :3000 (runs migrations)
cd ../frontend && npm install && npm run dev   # UI on :5173, proxies /api → :3000

# Or single process: build the UI once and let Rust serve it on :3000
cd frontend && npm run build && cd ../backend && cargo run
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

## Guarantees

- The final answer never reaches the client: answers and checkpoints live only in `backend/src/problems.rs`; the session view omits them; every tutor reply passes the deterministic + LLM leak guard.
- Correctness never comes from the LLM: answers and intermediate steps are checked by `mathexpr`/template ground truth. The LLM only extracts claims and phrases replies.
- Optional features (ElevenLabs read-aloud, Keenable links) hide themselves when their keys are missing.
