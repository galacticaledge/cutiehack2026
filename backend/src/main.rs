use socra::config::Config;
use socra::routes::api_router;
use socra::state::AppState;
use std::path::Path;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,sqlx=warn,tower_http=info".into()),
        )
        .init();

    let cfg = Config::from_env()?;
    let port = cfg.port;
    let static_dir = cfg.static_dir.clone();
    let state = AppState::new(cfg).await?;
    sqlx::migrate!("./migrations").run(&state.pool).await?;
    tracing::info!(
        "llm provider: {} · solana minting: {} · tts: {} · learn-more: {} · solari code runner: {}",
        state.cfg.active_llm_provider(),
        state.solana.is_some(),
        state.cfg.tts_enabled(),
        state.cfg.resources_enabled(),
        state.cfg.code_runner_enabled()
    );

    let mut app = api_router();
    let index = Path::new(&static_dir).join("index.html");
    if index.exists() {
        // Serve the React SPA; unknown paths fall back to index.html for client-side routing.
        app = app
            .fallback_service(ServeDir::new(&static_dir).not_found_service(ServeFile::new(index)));
        tracing::info!("serving frontend from {static_dir}");
    } else {
        tracing::info!("no frontend build at {static_dir} (dev mode: run the Vite dev server)");
    }
    let app = app.layer(TraceLayer::new_for_http()).with_state(state);

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    tracing::info!("Socra listening on http://localhost:{port}");
    axum::serve(listener, app).await?;
    Ok(())
}
