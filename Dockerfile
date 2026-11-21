# --- 1. React frontend ---
FROM node:22-bookworm-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- 2. Rust backend ---
FROM rust:1-bookworm AS api
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /src
# Cache dependencies: build once with a stub, then with real sources.
COPY backend/Cargo.toml backend/Cargo.lock ./
RUN mkdir -p src/bin && echo "fn main() {}" > src/main.rs && echo "" > src/lib.rs \
    && echo "fn main() {}" > src/bin/seed.rs && echo "fn main() {}" > src/bin/setup_token.rs \
    && cargo build --release && rm -rf src
COPY backend/ ./
RUN touch src/main.rs src/lib.rs && cargo build --release --bins

# --- 3. Runtime ---
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 socra
WORKDIR /app
COPY --from=api /src/target/release/socra /src/target/release/seed /src/target/release/setup_token /app/
COPY --from=web /web/dist /app/static
ENV STATIC_DIR=/app/static PORT=3000 RUST_LOG=info
USER socra
EXPOSE 3000
# DB migrations are embedded in the binary and run on startup.
CMD ["/app/socra"]
