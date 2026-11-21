// Anti-cheat flags (SPEC §11). Pure: evaluated when the correct answer is submitted.

export type Flag = "too_fast" | "answer_pasted" | "away_then_correct";

export interface TelemetryEvent {
  type: string; // hidden | visible | paste
  data: { length?: number; target?: string } | null;
  createdAt: Date;
}

export function computeFlags(opts: {
  startedAt: Date;
  submittedAt: Date;
  minSolveSeconds: number;
  events: TelemetryEvent[];
}): Flag[] {
  const flags: Flag[] = [];
  const submit = opts.submittedAt.getTime();
  if ((submit - opts.startedAt.getTime()) / 1000 < opts.minSolveSeconds) flags.push("too_fast");

  const events = [...opts.events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const pastedRecently = events.some(
    (e) => e.type === "paste" && (e.data?.target ?? "answer") === "answer" && submit - e.createdAt.getTime() <= 60_000,
  );
  if (pastedRecently) flags.push("answer_pasted");

  let hiddenAt: number | null = null;
  for (const e of events) {
    const t = e.createdAt.getTime();
    if (e.type === "hidden") hiddenAt = t;
    else if (e.type === "visible" && hiddenAt !== null) {
      const awayMs = t - hiddenAt;
      if (awayMs >= 30_000 && submit - t < 20_000 && submit >= t) {
        flags.push("away_then_correct");
        break;
      }
      hiddenAt = null;
    }
  }
  return flags;
}

export const FLAG_LABELS: Record<Flag, string> = {
  too_fast: "solved unusually fast",
  answer_pasted: "answer was pasted",
  away_then_correct: "left the tab, then answered right away",
};
