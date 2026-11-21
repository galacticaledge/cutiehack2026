use axum::http;
use socra::config::Config;
use socra::routes::api_router;
use socra::state::AppState;
use std::path::Path;
use tower_http::compression::CompressionLayer;
use tower_http::compression::predicate::{DefaultPredicate, NotForContentType, Predicate};
use std::time::Duration;
use tokio::signal;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;

const REQUEST_TIMEOUT_SECS: u64 = 60;

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

    // Unknown /api paths get a JSON 404, never the SPA's index.html (which would look like a 200).
    let mut app = api_router().route(
        "/api/{*rest}",
        axum::routing::any(|| async {
            (
                axum::http::StatusCode::NOT_FOUND,
                axum::Json(serde_json::json!({ "error": "Not found." })),
            )
        }),
    );
    let index = Path::new(&static_dir).join("index.html");
    if index.exists() {
        // Serve the React SPA; unknown paths fall back to index.html for client-side routing.
        app = app.fallback_service(ServeDir::new(&static_dir).fallback(ServeFile::new(index)));
        tracing::info!("serving frontend from {static_dir}");
    } else {
        tracing::info!("no frontend build at {static_dir} (dev mode: run the Vite dev server)");
    }

    // Compress responses (brotli/gzip): the JS bundle and JSON shrink to about a third.
    let app = app
        .layer(
            // Media is already compressed; leave it alone (and keep byte ranges simple for video).
            CompressionLayer::new().compress_when(
                DefaultPredicate::new()
                    .and(NotForContentType::const_new("video/"))
                    .and(NotForContentType::const_new("audio/")),
            ),
        )
        .layer((
            TraceLayer::new_for_http(),
            // Prevent requests from indefinitely hanging. This can be reasonably high since some
            // requests might involve multiple external API calls or slow operations (e.g. getting
            // completions from an LLM).
            TimeoutLayer::with_status_code(
                http::StatusCode::REQUEST_TIMEOUT,
                Duration::from_secs(REQUEST_TIMEOUT_SECS),
            ),
        ))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    tracing::info!("Socra listening on http://localhost:{port}");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("Failed to install the Ctrl+C signal handler!");
    };
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .map_err(|e| anyhow::anyhow!("{e:?}"))
            .expect("Failed to install the SIGTERM signal handler!")
            .recv()
            .await;
    };

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
