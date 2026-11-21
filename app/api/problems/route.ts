import { prisma } from "@/lib/db";
import { handler, json, requireUser } from "@/lib/http";
import { TEMPLATES } from "@/lib/problems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await requireUser();
  const rewards = await prisma.reward.findMany({ where: { userId: user.id }, select: { templateId: true, status: true } });
  const byTemplate = new Map(rewards.map((r) => [r.templateId, r.status]));
  return json(
    TEMPLATES.map((t) => ({
      id: t.id,
      title: t.title,
      concept: t.concept,
      difficulty: t.difficulty,
      earned: byTemplate.get(t.id) === "paid",
      rewardStatus: byTemplate.get(t.id) ?? null,
      maxReward: 100 * t.difficulty,
    })),
  );
});
