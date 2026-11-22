//! Integration tests for the auth endpoints. If a database url is not present in the environment,
//! these tests will do nothing.

use axum::Router;
use axum::body::{Body, to_bytes};
use axum::http::{Request, StatusCode};
use serde_json::{Value, json};
use socra::config::Config;
use socra::routes::api_router;
use socra::state::AppState;
use tower::ServiceExt;

const PASSWORD: &str = "correct-horse-battery";
const OTHER_PASSWORD: &str = "wonderland-42";

static ROUTER: tokio::sync::OnceCell<Router> = tokio::sync::OnceCell::const_new();
static DB_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Build the router, or `None` if there is no database to test against.
///
/// Since `cargo test` will not have a DATABASE_URL, this mechanism short-circuits the tests in
/// this file unless a proper DATABASE_URL is available (i.e. production and CI).
async fn router() -> Option<&'static Router> {
    let _ = dotenvy::dotenv();
    if std::env::var("DATABASE_URL").is_err() {
        return None;
    }
    Some(
        ROUTER
            .get_or_init(|| async {
                let cfg = Config::from_env().expect("config from .env/environment");
                let state = AppState::new(cfg).await.expect("DATABASE_URL is reachable");
                sqlx::migrate!("./migrations")
                    .run(&state.pool)
                    .await
                    .unwrap();
                api_router().with_state(state)
            })
            .await,
    )
}

/// A username guaranteed to be fresh and valid
fn new_username() -> String {
    let hex = uuid::Uuid::new_v4().to_string().replace('-', "");
    format!("usr{}", &hex[..12])
}

/// Send a request to the router. Returns in the form (status, parsed JSON body, set-cookie header).
async fn call(
    r: &Router,
    method: &str,
    path: &str,
    body: Option<&Value>,
    cookie: Option<&str>,
) -> (StatusCode, Value, Option<String>) {
    let mut builder = Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json");
    if let Some(c) = cookie {
        builder = builder.header("cookie", c);
    }
    let bytes = match body {
        Some(b) => serde_json::to_vec(b).unwrap(),
        None => Vec::new(),
    };
    let req = builder.body(Body::from(bytes)).unwrap();
    let resp = r.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let set_cookie = resp
        .headers()
        .get("set-cookie")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let body_bytes = to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
    let body: Value = serde_json::from_slice(&body_bytes).unwrap_or(Value::Null);
    (status, body, set_cookie)
}

/// Split a raw cookie pair
fn cookie_pair(set_cookie: &str) -> String {
    set_cookie.split(';').next().unwrap().trim().to_string()
}

async fn signup_fresh(r: &Router) -> (String, String) {
    let username = new_username();
    let (status, body, set_cookie) = call(
        r,
        "POST",
        "/api/auth/signup",
        Some(&json!({ "username": username, "password": PASSWORD })),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "signup should succeed: {body}");
    assert_eq!(body["username"], username);
    assert!(
        body["walletPubkey"]
            .as_str()
            .map(|s| !s.is_empty())
            .unwrap_or(false),
        "walletPubkey should be a non-empty string: {body}"
    );
    let set_cookie = set_cookie.expect("signup should set a session cookie");
    (username, cookie_pair(&set_cookie))
}

// ---------- signup ----------

#[tokio::test]
async fn signup_creates_account_and_sets_session_cookie() {
    let Some(r) = router().await else {
        return;
    };
    let _guard = DB_LOCK.lock().await;
    let (username, cookie) = signup_fresh(r).await;
    assert!(cookie.starts_with("socra_session="), "cookie: {cookie}");
    let _ = username;
}

#[tokio::test]
async fn signup_rejects_duplicate_username() {
    let Some(r) = router().await else {
        return;
    };
    let _guard = DB_LOCK.lock().await;
    let (username, _) = signup_fresh(r).await;
    let (status, body, _) = call(
        r,
        "POST",
        "/api/auth/signup",
        Some(&json!({ "username": username, "password": PASSWORD })),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "duplicate username: {body}");
    assert!(body["error"].is_string());
}

#[tokio::test]
async fn signup_rejects_invalid_username() {
    let Some(r) = router().await else {
        return;
    };
    let _guard = DB_LOCK.lock().await;
    // NB: the backend lowercases usernames, so "ALICE" is accepted as "alice" — not tested here.
    for bad in ["a", "has space", "x".repeat(25).leak()] {
        let (status, body, _) = call(
            r,
            "POST",
            "/api/auth/signup",
            Some(&json!({ "username": bad, "password": PASSWORD })),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "username {bad:?}: {body}");
    }
}

#[tokio::test]
async fn signup_rejects_short_password() {
    let Some(r) = router().await else {
        return;
    };
    let _guard = DB_LOCK.lock().await;
    let (status, body, _) = call(
        r,
        "POST",
        "/api/auth/signup",
        Some(&json!({ "username": new_username(), "password": "short" })),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "short password: {body}");
}

#[tokio::test]
async fn signup_rejects_missing_fields() {
    let Some(r) = router().await else {
        return;
    };
    let _guard = DB_LOCK.lock().await;
    let (status, body, _) = call(r, "POST", "/api/auth/signup", Some(&json!({})), None).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "empty body: {body}");
}

// ---------- login ----------

#[tokio::test]
async fn login_succeeds_with_correct_password() {
    let Some(r) = router().await else {
        return;
    };
    let _guard = DB_LOCK.lock().await;
    let (username, _) = signup_fresh(r).await;
    let (status, body, set_cookie) = call(
        r,
        "POST",
        "/api/auth/login",
        Some(&json!({ "username": username, "password": PASSWORD })),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "login should succeed: {body}");
    assert_eq!(body["username"], username);
    assert!(
        set_cookie
            .as_deref()
            .unwrap_or("")
            .starts_with("socra_session=")
    );
}

#[tokio::test]
async fn login_rejects_wrong_password() {
    let Some(r) = router().await else {
        return;
    };
    let _guard = DB_LOCK.lock().await;
    let (username, _) = signup_fresh(r).await;
    let (status, body, _) = call(
        r,
        "POST",
        "/api/auth/login",
        Some(&json!({ "username": username, "password": OTHER_PASSWORD })),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "wrong password: {body}");
    assert_eq!(body["error"], "Unknown username or password.");
}

#[tokio::test]
async fn login_rejects_unknown_username() {
    let Some(r) = router().await else {
        return;
    };
    let _guard = DB_LOCK.lock().await;
    let (status, body, _) = call(
        r,
        "POST",
        "/api/auth/login",
        Some(&json!({ "username": new_username(), "password": PASSWORD })),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "unknown user: {body}");
    assert_eq!(body["error"], "Unknown username or password.");
}

#[tokio::test]
async fn login_rejects_short_password() {
    let Some(r) = router().await else {
        return;
    };
    let _guard = DB_LOCK.lock().await;
    let (status, body, _) = call(
        r,
        "POST",
        "/api/auth/login",
        Some(&json!({ "username": new_username(), "password": "nope" })),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "short password: {body}");
}

// ---------- the issued cookie actually authenticates ----------

#[tokio::test]
async fn session_cookie_grants_access_to_me() {
    let Some(r) = router().await else {
        return;
    };
    let _guard = DB_LOCK.lock().await;
    let (username, cookie) = signup_fresh(r).await;
    // No cookie -> 401.
    let (status, _, _) = call(r, "GET", "/api/me", None, None).await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "no cookie should be rejected"
    );
    // With the issued cookie -> 200 and the right identity.
    let (status, body, _) = call(r, "GET", "/api/me", None, Some(&cookie)).await;
    assert_eq!(status, StatusCode::OK, "valid cookie should be accepted");
    assert_eq!(body["username"], username);
}
