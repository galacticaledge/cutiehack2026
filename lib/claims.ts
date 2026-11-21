import "server-only";
import { completeJson } from "./llm";
import type { Checkpoint } from "./problems/types";
import { claimExtractionMessages } from "./prompts";
import { looksMathy, verifyClaims, type Claim, type Verdict } from "./verify";

/**
 * Neuro-symbolic step verification (SPEC §8.5).
 * NEURAL: extract claims (the extractor sees checkpoint ids + labels only, never values).
 * SYMBOLIC: verify with mathjs against template ground truth.
 * Never throws: on any failure returns [] so the tutor still replies.
 */
export async function verifyMessage(message: string, checkpoints: Checkpoint[]): Promise<Verdict[]> {
  if (!checkpoints.length || !looksMathy(message)) return [];
  try {
    const r = await completeJson<{ claims?: Claim[] }>("check", claimExtractionMessages(message, checkpoints));
    const claims = Array.isArray(r?.claims)
      ? r!.claims.filter((c) => c && typeof c.checkpointId === "string" && c.claimed != null).map((c) => ({ checkpointId: c.checkpointId, claimed: String(c.claimed) }))
      : [];
    return verifyClaims(claims, checkpoints);
  } catch (e) {
    console.warn("[claims] extractor failed; continuing without verdicts:", (e as Error)?.message);
    return [];
  }
}
