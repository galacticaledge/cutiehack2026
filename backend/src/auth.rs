//! Username + password login with an HMAC-signed session cookie.
use crate::error::AppError;
use crate::models::User;
use crate::state::AppState;
use argon2::password_hash::{PasswordHash, PasswordHasher, SaltString};
use argon2::{Argon2, PasswordVerifier};
use axum::extract::FromRequestParts;
use axum::http::StatusCode;
use axum::http::request::Parts;
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use base64::Engine;
use hmac::{Hmac, Mac};
use sha2::Sha256;

pub const COOKIE: &str = "socra_session";

fn sign(secret: &str, value: &str) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("hmac key");
    mac.update(value.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
}

pub fn make_token(secret: &str, user_id: &str) -> String {
    format!("{user_id}.{}", sign(secret, user_id))
}

pub fn read_token(secret: &str, token: &str) -> Option<String> {
    let (user_id, sig) = token.rsplit_once('.')?;
    let sig_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(sig)
        .ok()?;
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).ok()?;
    mac.update(user_id.as_bytes());
    mac.verify_slice(&sig_bytes).ok()?; // constant-time
    Some(user_id.to_string())
}

pub fn session_cookie(state: &AppState, user_id: &str) -> Cookie<'static> {
    Cookie::build((COOKIE, make_token(&state.cfg.session_secret, user_id)))
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(state.cfg.secure_cookies)
        .path("/")
        .max_age(time_days(30))
        .build()
}

fn time_days(d: i64) -> time::Duration {
    time::Duration::days(d)
}

// ---------- credentials ----------

/// True when a username satisfies the API's rules (2–24 chars, [a-z0-9_-]).
pub fn valid_username(username: &str) -> bool {
    (2..=24).contains(&username.len())
        && username
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

/// True when a password is within the accepted length window (8–72 chars).
pub fn valid_password(password: &str) -> bool {
    (8..=72).contains(&password.len())
}

/// Hash a plaintext password into an Argon2id PHC string for storage.
pub fn hash_password(password: &str) -> String {
    use argon2::password_hash::rand_core::OsRng;
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .expect("argon2 hash of a bounded-length password")
        .to_string()
}

/// Constant-time check of a plaintext password against a stored Argon2id PHC string.
/// Returns false for empty/malformed stored hashes rather than panicking.
pub fn verify_password(password: &str, stored: &str) -> bool {
    if stored.is_empty() {
        return false;
    }
    let parsed = match PasswordHash::new(stored) {
        Ok(h) => h,
        Err(_) => return false,
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

/// Extractor: the logged-in user, or 401.
pub struct AuthUser(pub User);

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let jar = CookieJar::from_headers(&parts.headers);
        let unauthorized = || AppError::new(StatusCode::UNAUTHORIZED, "Please log in first.");
        let token = jar.get(COOKIE).ok_or_else(unauthorized)?;
        let user_id =
            read_token(&state.cfg.session_secret, token.value()).ok_or_else(unauthorized)?;
        let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
            .bind(&user_id)
            .fetch_optional(&state.pool)
            .await?
            .ok_or_else(unauthorized)?;
        Ok(AuthUser(user))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn token_roundtrip() {
        let s = "x".repeat(40);
        let t = make_token(&s, "abc123");
        assert_eq!(read_token(&s, &t).as_deref(), Some("abc123"));
        assert!(read_token(&s, "abc123.AAAA").is_none());
        assert!(read_token(&"y".repeat(40), &t).is_none());
        assert!(read_token(&s, "garbage").is_none());
    }

    #[test]
    fn password_roundtrip() {
        let pw = "correct-horse-battery";
        let h = hash_password(pw);
        assert!(verify_password(pw, &h));
        assert!(!verify_password("correct-horse-batteri", &h));
        // each hash uses a fresh salt
        assert_ne!(hash_password(pw), h);
    }

    #[test]
    fn password_rejects_empty_or_garbage() {
        assert!(!verify_password("anything", ""));
        assert!(!verify_password("anything", "not-a-pwc-string"));
    }

    #[test]
    fn credential_validation() {
        assert!(valid_username("alice"));
        assert!(!valid_username("a"));
        assert!(!valid_username("way-too-long-username-xxxxxxxxxxxxx"));
        assert!(!valid_username("UPPER"));
        assert!(valid_password("abcdefgh"));
        assert!(!valid_password("short"));
    }
}
