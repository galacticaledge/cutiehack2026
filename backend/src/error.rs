//! API errors: always friendly JSON `{ error }`, never a stack trace.
use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

#[derive(Debug)]
pub struct AppError {
    pub status: StatusCode,
    pub message: String,
}

impl AppError {
    pub fn new(status: StatusCode, message: impl Into<String>) -> Self {
        AppError {
            status,
            message: message.into(),
        }
    }
    pub fn bad(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, message)
    }
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, message)
    }
}

/// The LLM providers are all unavailable.
#[derive(Debug)]
pub struct LlmUnavailable(pub String);
impl std::fmt::Display for LlmUnavailable {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "LLM unavailable: {}", self.0)
    }
}
impl std::error::Error for LlmUnavailable {}

impl<E: Into<anyhow::Error>> From<E> for AppError {
    fn from(e: E) -> Self {
        let e: anyhow::Error = e.into();
        if e.downcast_ref::<LlmUnavailable>().is_some() {
            tracing::warn!("{e}");
            return AppError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "The tutor is having trouble connecting right now. Please try again in a moment.",
            );
        }
        tracing::error!("unhandled error: {e:#}");
        AppError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Something went wrong. Please try again.",
        )
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (self.status, Json(json!({ "error": self.message }))).into_response()
    }
}

pub type ApiResult<T> = Result<T, AppError>;
