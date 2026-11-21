import type { Reward } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { problemContext } from "@/lib/context";
import { prisma } from "@/lib/db";
import { HttpError, handler, json, readJson, requireSession, requireUser } from "@/lib/http";
import { completeJson } from "@/lib/llm";
import { graderMessages } from "@/lib/prompts";
import { computeReward } from "@/lib/rewards";
import { dailyCap, earnedToday, templateRewardElsewhere } from "@/lib/sessions";
import { explorerTxUrl, fromBaseUnits, mintReward, solanaConfigured, toBaseUnits } from "@/lib/solana";

export const runtime = "nodejs";
export const maxDuration = 60;

async function mintWithRetry(pubkey: string, amountBase: number): Promise<string> {
  try {
    return await mintReward(pubkey, amountBase);
  } catch (e) {
    console.warn("[mint] first attempt failed, retrying:", (e as Error)?.message);
    return mintReward(pubkey, amountBase);
  }
}

/** Mint a reward row currently in status "minting". */
async function settle(reward: Reward, walletPubkey: string): Promise<Reward> {
  if (!solanaConfigured()) {
    console.warn("[mint] Solana not configured (MINT_ADDRESS / MINT_AUTHORITY_SECRET)");
    return prisma.reward.update({ where: { id: reward.id }, data: { status: "failed" } });
  }
  try {
    const sig = await mintWithRetry(walletPubkey, reward.amount);
    console.log(`[mint] ${fromBaseUnits(reward.amount)} LEARN → ${walletPubkey}: ${explorerTxUrl(sig)}`);
    return prisma.reward.update({ where: { id: reward.id }, data: { status: "paid", txSig: sig } });
  } catch (e) {
    console.error("[mint] failed:", (e as Error)?.message);
    return prisma.reward.update({ where: { id: reward.id }, data: { status: "failed" } });
  }
}

function rewardView(r: Reward, summary?: string) {
  const b = r.breakdown as { summary?: string } | null;
  return {
    amount: fromBaseUnits(r.amount),
    status: r.status,
    breakdown: summary ?? b?.summary ?? "",
    flags: r.flags,
    explorerUrl: r.txSig ? explorerTxUrl(r.txSig) : undefined,
  };
}

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const s = await requireSession(id, user.id);
  if (s.source !== "bank") throw new HttpError(400, "Practice sessions don't pay out. Try a verified problem on this concept to earn LEARN.");
  if (s.status === "active") throw new HttpError(400, "Solve the problem first.");

  // Retry path: a previous mint failed.
  const existing = await prisma.reward.findUnique({ where: { sessionId: s.id } });
  if (existing) {
    if (existing.status === "failed") {
      const claimed = await prisma.reward.updateMany({ where: { id: existing.id, status: "failed" }, data: { status: "minting" } });
      if (claimed.count === 1) {
        const settled = await settle({ ...existing, status: "minting" }, user.walletPubkey);
        return json({ pass: s.explainPassed ?? true, feedback: s.explainFeedback ?? "", reward: rewardView(settled) });
      }
    }
    return json({ pass: s.explainPassed ?? true, feedback: s.explainFeedback ?? "", reward: rewardView(existing) });
  }
  if (s.explanation) {
    return json({ pass: s.explainPassed ?? true, feedback: s.explainFeedback ?? "", reward: { amount: 0, status: "practice", breakdown: "Practice mode: no reward" } });
  }

  const body = await readJson<{ text?: string }>(req);
  const text = String(body.text ?? "").trim();
  if (text.length < 10) throw new HttpError(400, "Write a sentence or two explaining why your method works.");
  if (text.length > 1500) throw new HttpError(400, "Please keep it under 1500 characters.");

  const ctx = problemContext(s);
  let pass = true;
  let feedback = "Nice work explaining your reasoning!";
  const graded = await completeJson<{ pass?: boolean; feedback?: string }>("check", graderMessages(ctx, text));
  if (graded && typeof graded.pass === "boolean") {
    pass = graded.pass;
    if (typeof graded.feedback === "string" && graded.feedback.trim()) feedback = graded.feedback.trim().slice(0, 400);
  }

  const marked = await prisma.problemSession.updateMany({
    where: { id: s.id, explanation: null },
    data: { explanation: text, explainPassed: pass, explainFeedback: feedback, status: "done" },
  });
  if (marked.count !== 1) throw new HttpError(409, "Already submitted.");

  if (await templateRewardElsewhere(user.id, s.templateId!, s.id)) {
    return json({ pass, feedback, reward: { amount: 0, status: "practice", breakdown: "Practice mode: no reward (you've already earned on this problem)" } });
  }

  const solveEvent = await prisma.event.findFirst({ where: { sessionId: s.id, type: "solve" }, orderBy: { createdAt: "desc" } });
  const flags = ((solveEvent?.data as { flags?: string[] } | null)?.flags ?? []) as string[];
  const r = computeReward({
    difficulty: ctx.difficulty,
    hintsUsed: s.hintsUsed,
    wrongAttempts: s.wrongAttempts,
    explainPassed: pass,
    flagged: flags.length > 0,
    earnedToday: await earnedToday(user.id),
    dailyCap: dailyCap(),
  });

  const status = r.status === "forfeited" ? "forfeited" : r.amount === 0 ? "paid" : "minting";
  let reward: Reward;
  try {
    reward = await prisma.reward.create({
      data: {
        userId: user.id,
        sessionId: s.id,
        templateId: s.templateId!,
        amount: toBaseUnits(r.amount),
        breakdown: { items: r.breakdown, summary: r.summary } as object,
        status,
        flags: flags.length ? flags : undefined,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return json({ pass, feedback, reward: { amount: 0, status: "practice", breakdown: "Practice mode: no reward" } });
    }
    throw e;
  }
  if (status === "minting") reward = await settle(reward, user.walletPubkey);
  if (r.status === "forfeited") console.log(`[reward] forfeited for ${user.username} on ${s.templateId} (flags: ${flags.join(", ")})`);
  return json({ pass, feedback, reward: rewardView(reward, r.summary) });
});
