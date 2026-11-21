//! Socra backend: Socratic tutor that pays LEARN (Solana devnet) for verified learning.

// Pure, unit-tested core
pub mod anticheat;
pub mod answers;
pub mod leak;
pub mod mathexpr;
pub mod problems;
pub mod rewards;
pub mod rng;
pub mod verify;

// Server
pub mod auth;
pub mod claims;
pub mod config;
pub mod context;
pub mod custom;
pub mod error;
pub mod llm;
pub mod models;
pub mod prompts;
pub mod resources;
pub mod routes;
pub mod sessions;
pub mod solana;
pub mod state;
pub mod tts;
pub mod tutor;
