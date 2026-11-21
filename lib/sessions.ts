import "server-only";
import type { ProblemSession, User } from "@prisma/client";
import { attemptsAllowed, isLocked } from "./answers";
import { problemContext } from "./context";
import { prisma } from "./db";
import { HttpError } from "./http";
import { getTemplate } from "./problems";
import { openingMessage } from "./prompts";
import { potentialReward } from "./rewards";
import { hashSeed, randomSeed } from "./rng";
import { explorerTxUrl, fromBaseUnits } from "./solana";
import { verdictChips, type Verdict } from "./verify";

export const DEMO_ACCOUNTS = ["demo", "copycat", "demo-b", "copycat-b"];

export function seedFor(username: string, templateId: string): number {
  if (process.env.DEMO_FIXED_SEEDS === "true" && DEMO_ACCOUNTS.includes(username)) return hashSeed(templateId);
  return randomSeed();
}

export function dailyCap(): number {
  return Number(process.env.DAILY_TOKEN_CAP ?? 1000);
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Whole LEARN paid today. */
export async function earnedToday(userId: string): Promise<number> {
  const agg = await prisma.reward.aggregate({
    where: { userId, status: "paid", createdAt: { gte: startOfToday() } },
    _sum: { amount: true },
  });
  return fromBaseUnits(agg._sum.amount ?? 0);
}

/** A (user, template) payout record from ANY session other than this one → practice mode. */
export async function templateRewardElsewhere(userId: string, templateId: string, sessionId?: string) {
  return prisma.reward.findFirst({ where: { userId, templateId, NOT: sessionId ? { sessionId } : undefined } });
}

export async function createBankSession(user: User, templateId: string, fromSessionId?: string) {
  const template = getTemplate(templateId);
  if (!template) throw new HttpError(400, "Unknown problem.");
  const session = await prisma.problemSession.create({
    data: { userId: user.id, source: "bank", templateId, seed: seedFor(user.username, templateId), fromSessionId },
  });
  await prisma.message.create({ data: { sessionId: session.id, role: "tutor", content: openingMessage(problemContext(session)) } });
  return session;
}

/** Client-safe session state. NEVER includes the answer, checkpoints or customRef. */
export async function sessionView(s: ProblemSession) {
  const ctx = problemContext(s);
  const messages = await prisma.message.findMany({ where: { sessionId: s.id }, orderBy: { createdAt: "asc" } });
  const reward = await prisma.reward.findUnique({ where: { sessionId: s.id } });
  const isBank = s.source === "bank";
  const practice = isBank && s.templateId ? Boolean(await templateRewardElsewhere(s.userId, s.templateId, s.id)) : !isBank;
  const matched = ctx.customRef?.matchedTemplateId ? getTemplate(ctx.customRef.matchedTemplateId) : undefined;

  return {
    id: s.id,
    source: s.source,
    templateId: isBank ? s.templateId : null,
    title: ctx.title,
    prompt: ctx.displayPrompt,
    difficulty: ctx.difficulty,
    hintsUsed: s.hintsUsed,
    revealedHints: ctx.hints.slice(0, s.hintsUsed),
    wrongAttempts: s.wrongAttempts,
    attemptsLeft: isBank ? Math.max(0, attemptsAllowed(s.hintsUsed) - s.wrongAttempts) : null,
    locked: isBank ? isLocked(s.wrongAttempts, s.hintsUsed) : false,
    status: s.status,
    practice,
    potentialReward: isBank && !practice ? potentialReward(ctx.difficulty, s.hintsUsed, s.wrongAttempts) : 0,
    hasAnswerCheck: isBank || ctx.answer !== null,
    explainPassed: s.explainPassed,
    explainFeedback: s.explainFeedback,
    reward: reward
      ? {
          amount: fromBaseUnits(reward.amount),
          status: reward.status,
          breakdown: reward.breakdown,
          explorerUrl: reward.txSig ? explorerTxUrl(reward.txSig) : undefined,
        }
      : null,
    matchedTemplate: !isBank && matched ? { id: matched.id, title: matched.title } : undefined,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      verdicts: m.role === "user" ? verdictChips(m.verdicts as Verdict[] | null) : [],
    })),
  };
}
