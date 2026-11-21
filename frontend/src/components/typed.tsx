import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";

// Math ($…$, $$…$$) and code (`…`, ```…```) are revealed whole, so no half-rendered formula ever shows.
const TOKENS = /(\$\$[\s\S]*?\$\$|\$[^$\n]*\$|```[\s\S]*?```|`[^`\n]*`|\s+|[^\s$`]+|[$`])/g;

/**
 * The Cat "types" a new reply: words appear in quick succession (about 1.5 s for a
 * long reply). Click to show it all. Old messages and reduced-motion users get the
 * full text at once.
 */
export function TypedMarkdown({ text, animate, onProgress }: { text: string; animate: boolean; onProgress?: () => void }) {
  const tokens = useRef(text.match(TOKENS) ?? [text]);
  const [shown, setShown] = useState(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    return animate && !reduce ? 0 : tokens.current.length;
  });
  const done = shown >= tokens.current.length;

  useEffect(() => {
    tokens.current = text.match(TOKENS) ?? [text];
  }, [text]);

  useEffect(() => {
    if (done) return;
    const total = tokens.current.length;
    const step = Math.max(1, Math.ceil(total / 60)); // ~60 ticks max
    const t = setInterval(() => {
      setShown((n) => Math.min(total, n + step));
    }, 24);
    return () => clearInterval(t);
  }, [done]);

  useEffect(() => {
    if (!done) onProgress?.();
  }, [shown, done, onProgress]);

  const visible = done ? text : tokens.current.slice(0, shown).join("");
  return (
    <div
      onClick={() => !done && setShown(tokens.current.length)}
      className={done ? undefined : "cursor-pointer"}
      title={done ? undefined : "Click to show the whole reply"}
      aria-busy={!done}
    >
      {/* Screen readers get the whole reply at once, not a stream of fragments. */}
      <span className="sr-only">{done ? null : text}</span>
      <div aria-hidden={!done}>
        <Markdown>{visible}</Markdown>
      </div>
      {!done && <span className="type-caret" aria-hidden="true" />}
    </div>
  );
}
