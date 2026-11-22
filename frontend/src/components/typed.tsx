import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";

const TOKENS = /(\$\$[\s\S]*?\$\$|\$[^$\n]*\$|```[\s\S]*?```|`[^`\n]*`|\s+|[^\s$`]+|[$`])/g;

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
    const step = Math.max(1, Math.ceil(total / 60));
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
      <span className="sr-only">{done ? null : text}</span>
      <div aria-hidden={!done}>
        <Markdown>{visible}</Markdown>
      </div>
      {!done && <span className="type-caret" aria-hidden="true" />}
    </div>
  );
}
