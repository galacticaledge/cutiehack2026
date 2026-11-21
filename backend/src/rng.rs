use rand::rngs::StdRng;
use rand::{RngExt, SeedableRng};

pub struct Rng {
    inner: StdRng,
}

impl Rng {
    pub fn new(seed: i64) -> Self {
        Rng { inner: StdRng::seed_from_u64(seed as u64) }
    }

    /// Uniform in [0, 1).
    pub fn next_f64(&mut self) -> f64 {
        self.inner.random::<f64>()
    }

    /// Inclusive range.
    pub fn int(&mut self, min: i64, max: i64) -> i64 {
        self.inner.random_range(min..=max)
    }

    pub fn int_except(&mut self, min: i64, max: i64, except: &[i64]) -> i64 {
        for _ in 0..100 {
            let v = self.int(min, max);
            if !except.contains(&v) {
                return v;
            }
        }
        panic!("int_except: no valid value");
    }
}

pub fn random_seed() -> i64 {
    rand::rng().random_range(0..2_000_000_000)
}

/// Stable 31-bit hash of a string (fixed demo seeds).
pub fn hash_seed(s: &str) -> i64 {
    let mut h: u32 = 2_166_136_261;
    for b in s.encode_utf16() {
        h ^= b as u32;
        h = h.wrapping_mul(16_777_619);
    }
    (h as i64) % 2_000_000_000
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn deterministic() {
        let mut a = Rng::new(42);
        let mut b = Rng::new(42);
        for _ in 0..5 {
            assert_eq!(a.int(0, 100), b.int(0, 100));
        }
        let mut r = Rng::new(7);
        for _ in 0..1000 {
            let v = r.int(-3, 3);
            assert!((-3..=3).contains(&v));
        }
    }
}
