//! Small, safe math expression parser/evaluator (the symbolic engine; replaces mathjs).
//! Supports numbers, + - * / ^, unary minus, parentheses, implicit multiplication
//! (`21x^2`, `2(x+1)`), functions sqrt/sin/cos/tan/exp/log/ln/abs, constants pi/e,
//! and at most one named variable. Anything else is rejected.

pub const TARGET_PRECISION: f64 = 1e-12;

#[derive(Debug, Clone)]
pub enum Expr {
    Num(f64),
    Var,
    Neg(Box<Expr>),
    Bin(char, Box<Expr>, Box<Expr>),
    Func(Func, Box<Expr>),
}

#[derive(Debug, Clone, Copy)]
pub enum Func {
    Sqrt,
    Sin,
    Cos,
    Tan,
    Exp,
    Ln,
    Abs,
}

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Num(f64),
    Ident(String),
    Op(char),
    LParen,
    RParen,
}

/// Normalize unicode math glyphs a student might type or paste.
pub fn normalize_math(input: &str) -> String {
    let mut s = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '−' | '–' | '—' => s.push('-'),
            '×' | '·' => s.push('*'),
            '÷' => s.push('/'),
            'π' => s.push_str("pi"),
            '√' => s.push_str("sqrt"),
            _ => s.push(ch),
        }
    }
    let s = s.replace("**", "^");
    // "sqrt9" / "sqrt 9" → "sqrt(9)"
    let mut out = String::new();
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i..].starts_with(&['s', 'q', 'r', 't']) {
            out.push_str("sqrt");
            i += 4;
            let mut j = i;
            while j < chars.len() && chars[j] == ' ' {
                j += 1;
            }
            if j < chars.len() && (chars[j].is_ascii_digit() || chars[j] == '.') {
                let start = j;
                while j < chars.len() && (chars[j].is_ascii_digit() || chars[j] == '.') {
                    j += 1;
                }
                out.push('(');
                out.extend(&chars[start..j]);
                out.push(')');
                i = j;
            }
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out.trim().to_string()
}

fn tokenize(s: &str) -> Option<Vec<Tok>> {
    let chars: Vec<char> = s.chars().collect();
    let mut toks = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
        } else if c.is_ascii_digit() || c == '.' {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                i += 1;
            }
            // scientific notation like 1e-6 is not needed; keep it simple
            let text: String = chars[start..i].iter().collect();
            toks.push(Tok::Num(text.parse().ok()?));
        } else if c.is_ascii_alphabetic() {
            let start = i;
            while i < chars.len() && chars[i].is_ascii_alphabetic() {
                i += 1;
            }
            toks.push(Tok::Ident(
                chars[start..i].iter().collect::<String>().to_lowercase(),
            ));
        } else if "+-*/^".contains(c) {
            toks.push(Tok::Op(c));
            i += 1;
        } else if c == '(' || c == '[' {
            toks.push(Tok::LParen);
            i += 1;
        } else if c == ')' || c == ']' {
            toks.push(Tok::RParen);
            i += 1;
        } else {
            return None;
        }
    }
    Some(toks)
}

struct Parser<'a> {
    toks: Vec<Tok>,
    pos: usize,
    var: Option<&'a str>,
    depth: usize,
}

impl<'a> Parser<'a> {
    fn peek(&self) -> Option<&Tok> {
        self.toks.get(self.pos)
    }
    fn next(&mut self) -> Option<Tok> {
        let t = self.toks.get(self.pos).cloned();
        self.pos += 1;
        t
    }

    fn expr(&mut self) -> Option<Expr> {
        self.depth += 1;
        if self.depth > 60 {
            return None;
        }
        let mut lhs = self.term()?;
        while let Some(Tok::Op(op @ ('+' | '-'))) = self.peek().cloned() {
            self.pos += 1;
            let rhs = self.term()?;
            lhs = Expr::Bin(op, Box::new(lhs), Box::new(rhs));
        }
        self.depth -= 1;
        Some(lhs)
    }

    fn term(&mut self) -> Option<Expr> {
        let mut lhs = self.unary()?;
        loop {
            match self.peek().cloned() {
                Some(Tok::Op(op @ ('*' | '/'))) => {
                    self.pos += 1;
                    let rhs = self.unary()?;
                    lhs = Expr::Bin(op, Box::new(lhs), Box::new(rhs));
                }
                // implicit multiplication
                Some(Tok::Num(_)) | Some(Tok::Ident(_)) | Some(Tok::LParen) => {
                    let rhs = self.power()?;
                    lhs = Expr::Bin('*', Box::new(lhs), Box::new(rhs));
                }
                _ => break,
            }
        }
        Some(lhs)
    }

    fn unary(&mut self) -> Option<Expr> {
        match self.peek() {
            Some(Tok::Op('-')) => {
                self.pos += 1;
                Some(Expr::Neg(Box::new(self.unary()?)))
            }
            Some(Tok::Op('+')) => {
                self.pos += 1;
                self.unary()
            }
            _ => self.power(),
        }
    }

    fn power(&mut self) -> Option<Expr> {
        let base = self.primary()?;
        if let Some(Tok::Op('^')) = self.peek() {
            self.pos += 1;
            let exp = self.unary()?;
            return Some(Expr::Bin('^', Box::new(base), Box::new(exp)));
        }
        Some(base)
    }

    fn primary(&mut self) -> Option<Expr> {
        match self.next()? {
            Tok::Num(n) => Some(Expr::Num(n)),
            Tok::LParen => {
                let e = self.expr()?;
                match self.next()? {
                    Tok::RParen => Some(e),
                    _ => None,
                }
            }
            Tok::Ident(id) => {
                let func = match id.as_str() {
                    "sqrt" => Some(Func::Sqrt),
                    "sin" => Some(Func::Sin),
                    "cos" => Some(Func::Cos),
                    "tan" => Some(Func::Tan),
                    "exp" => Some(Func::Exp),
                    "log" | "ln" => Some(Func::Ln),
                    "abs" => Some(Func::Abs),
                    _ => None,
                };
                if let Some(f) = func {
                    if self.next()? != Tok::LParen {
                        return None;
                    }
                    let arg = self.expr()?;
                    if self.next()? != Tok::RParen {
                        return None;
                    }
                    return Some(Expr::Func(f, Box::new(arg)));
                }
                match id.as_str() {
                    "pi" => Some(Expr::Num(std::f64::consts::PI)),
                    "e" if self.var != Some("e") => Some(Expr::Num(std::f64::consts::E)),
                    v if Some(v) == self.var => Some(Expr::Var),
                    _ => None,
                }
            }
            _ => None,
        }
    }
}

/// Parse an expression; `var` is the only identifier allowed besides functions/constants.
pub fn parse(input: &str, var: Option<&str>) -> Option<Expr> {
    if input.len() > 300 {
        return None;
    }
    let toks = tokenize(input)?;
    if toks.is_empty() {
        return None;
    }
    let mut p = Parser {
        toks,
        pos: 0,
        var,
        depth: 0,
    };
    let e = p.expr()?;
    if p.pos != p.toks.len() {
        return None;
    }
    Some(e)
}

pub fn eval(e: &Expr, x: f64) -> f64 {
    match e {
        Expr::Num(n) => *n,
        Expr::Var => x,
        Expr::Neg(a) => -eval(a, x),
        Expr::Bin(op, a, b) => {
            let (a, b) = (eval(a, x), eval(b, x));
            match op {
                '+' => a + b,
                '-' => a - b,
                '*' => a * b,
                '/' => a / b,
                '^' => a.powf(b),
                _ => f64::NAN,
            }
        }
        Expr::Func(f, a) => {
            let a = eval(a, x);
            match f {
                Func::Sqrt => a.sqrt(),
                Func::Sin => a.sin(),
                Func::Cos => a.cos(),
                Func::Tan => a.tan(),
                Func::Exp => a.exp(),
                Func::Ln => a.ln(),
                Func::Abs => a.abs(),
            }
        }
    }
}

/// Evaluate a constant expression (no variables). None if unparseable or not finite.
pub fn eval_number(input: &str) -> Option<f64> {
    let e = parse(input, None)?;
    let v = eval(&e, 0.0);
    v.is_finite().then_some(v)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn n(s: &str) -> Option<f64> {
        eval_number(s)
    }

    #[test]
    fn arithmetic() {
        assert_eq!(n("1+2*3"), Some(7.0));
        assert_eq!(n("-3^2"), Some(-9.0));
        assert_eq!(n("2^3^2"), Some(512.0));
        assert_eq!(n("3/4"), Some(0.75));
        assert_eq!(n("sqrt(16)"), Some(4.0));
        assert_eq!(n("2(3+1)"), Some(8.0));
        assert!((n("2pi").unwrap() - 2.0 * std::f64::consts::PI).abs() < TARGET_PRECISION);
        assert_eq!(n("1/0"), None);
        assert_eq!(n("foo"), None);
        assert_eq!(n("2+"), None);
        assert_eq!(n("(1"), None);
    }

    #[test]
    fn implicit_mult_with_var() {
        let e = parse("21x^2+8x-3", Some("x")).unwrap();
        assert_eq!(eval(&e, 2.0), 21.0 * 4.0 + 16.0 - 3.0);
        assert!(parse("21y^2", Some("x")).is_none());
    }

    #[test]
    fn trig() {
        assert_eq!(n("sin(0)"), Some(0.0));
        assert_eq!(n("cos(0)"), Some(1.0));
        assert!(n("sin(pi/2)").unwrap() - 1.0 < TARGET_PRECISION);
        assert!(n("cos(pi/2)").unwrap() < TARGET_PRECISION);
        assert!(n("sin(pi)").unwrap() < TARGET_PRECISION);
        assert!(n("cos(pi)").unwrap() + 1.0 < TARGET_PRECISION);
        assert!(n("sin(3*pi/2)").unwrap() + 1.0 < TARGET_PRECISION);
        assert!(n("cos(3*pi/2)").unwrap() < TARGET_PRECISION);

        // Can specify direct multiples of a given variable
        assert!(n("sin(3pi/2)").unwrap() + 1.0 < TARGET_PRECISION);
        assert!(n("cos(3pi/2)").unwrap() < TARGET_PRECISION);
    }
}
