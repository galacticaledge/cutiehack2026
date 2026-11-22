import katex from "katex";
import { useMemo } from "react";

const MATH_KEYS: { label: string; insert: string; caret?: number; title: string }[] = [
  { label: "√", insert: "sqrt()", caret: 5, title: "Square root: sqrt(…)" },
  { label: "π", insert: "pi", title: "Pi" },
  { label: "a⁄b", insert: "/", title: "Fraction (divide)" },
  { label: "−", insert: "-", title: "Minus / negative" },
  { label: "xʸ", insert: "^", title: "Power" },
  { label: "( )", insert: "()", caret: 1, title: "Brackets" },
  { label: ".", insert: ".", title: "Decimal point" },
];

function matching(s: string, open: number) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

const ATOM = String.raw`(?:\d+(?:\.\d+)?|\\pi|\\sqrt\{[^{}]*\}|\([^()]*\))`;

function answerToLatex(raw: string): string {
  let s = raw.replace(/[−–]/g, "-").replace(/√/g, "sqrt").replace(/sqrt\s*(\d+(?:\.\d+)?)/g, "sqrt($1)").replace(/\s+/g, "");
  const sqrt = (str: string): string => {
    let out = "";
    for (let i = 0; i < str.length; ) {
      if (str.startsWith("sqrt(", i)) {
        const close = matching(str, i + 4);
        if (close === -1) return out + "\\sqrt{" + sqrt(str.slice(i + 5)) + "}";
        out += "\\sqrt{" + sqrt(str.slice(i + 5, close)) + "}";
        i = close + 1;
      } else {
        out += str[i++];
      }
    }
    return out;
  };
  s = sqrt(s).replace(/pi/g, "\\pi ");
  const frac = new RegExp(`(${ATOM})/(${ATOM})`);
  for (let guard = 0; guard < 8 && frac.test(s); guard++) {
    s = s.replace(frac, (_, a: string, b: string) => `\\frac{${a.replace(/^\((.*)\)$/, "$1")}}{${b.replace(/^\((.*)\)$/, "$1")}}`);
  }
  return s.replace(/\*/g, " \\cdot ").replace(/\^(\d+|\([^()]*\))/g, (_, e: string) => `^{${e.replace(/^\((.*)\)$/, "$1")}}`);
}

function answerHint(raw: string): string | null {
  const s = raw.replace(/[−–]/g, "-").replace(/√/g, "sqrt").replace(/\s+/g, "");
  if (/sqrt\(?-/.test(s)) return "A square root of a negative number isn't a real number. Check your sign.";
  if (/sqrt(?![(\d.])/.test(s)) return "Write square roots with brackets, like sqrt(5).";
  return null;
}

export function AnswerPreview({ value }: { value: string }) {
  const hint = useMemo(() => answerHint(value), [value]);
  const html = useMemo(() => {
    const v = value.trim();
    if (!v || answerHint(v)) return null;
    try {
      return katex.renderToString(answerToLatex(v), { throwOnError: true, displayMode: false, strict: "ignore", maxExpand: 50 });
    } catch {
      return null;
    }
  }, [value]);
  if (hint) {
    return (
      <p className="answer-preview" aria-live="polite">
        <span className="text-[var(--heart)]">{hint}</span>
      </p>
    );
  }
  if (!html) return null;
  return (
    <p className="answer-preview" aria-live="polite">
      <span className="text-muted-foreground">Reads as</span> <span dangerouslySetInnerHTML={{ __html: html }} />
    </p>
  );
}

export function MathKeys({ onInsert, disabled }: { onInsert: (insert: string, caret?: number) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Math keys">
      {MATH_KEYS.map((k) => (
        <button
          key={k.label}
          type="button"
          className="math-key"
          title={k.title}
          aria-label={k.title}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(k.insert, k.caret)}
        >
          {k.label}
        </button>
      ))}
    </div>
  );
}
