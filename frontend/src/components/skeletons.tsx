/** Loading placeholders shaped like face-down playing cards, dealt onto the table. */

export function DealtCards({ count = 5, className = "h-[25rem]", label = "Loading" }: { count?: number; className?: string; label?: string }) {
  return (
    <>
      <span className="sr-only" role="status">
        {label}
      </span>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`card-skeleton deal-in rounded-2xl ${className}`}
          style={{ animationDelay: `${i * 90}ms`, "--tilt": `${(i % 2 ? 1 : -1) * (2 + (i % 3))}deg` } as React.CSSProperties}
        />
      ))}
    </>
  );
}

/** Workspace placeholder: a problem card and a chat panel, face down. */
export function WorkspaceSkeleton() {
  return (
    <main className="mx-auto grid max-w-[90rem] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] xl:grid-cols-[15rem_minmax(0,5fr)_minmax(0,6fr)]">
      <span className="sr-only" role="status">
        Loading the dream
      </span>
      <div aria-hidden="true" className="card-skeleton deal-in hidden h-[24rem] rounded-2xl xl:block" />
      <div aria-hidden="true" className="space-y-4">
        <div className="card-skeleton deal-in h-[20rem] rounded-2xl" style={{ animationDelay: "90ms" }} />
        <div className="card-skeleton deal-in h-[7rem] rounded-2xl" style={{ animationDelay: "180ms" }} />
      </div>
      <div aria-hidden="true" className="card-skeleton deal-in hidden h-[calc(100vh-8rem)] rounded-2xl lg:block" style={{ animationDelay: "270ms" }} />
    </main>
  );
}

/** Shown when something couldn't be loaded, instead of dealing cards forever. */
export function LostInWonderland({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <div className="parchment mx-auto my-10 max-w-md space-y-3 rounded-2xl p-8 text-center" role="alert">
      <p className="font-display text-4xl text-[var(--tan)]">?</p>
      <p className="font-display text-2xl">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
      <div className="flex justify-center gap-2 pt-1">{action}</div>
    </div>
  );
}
