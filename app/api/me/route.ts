import { prisma } from "@/lib/db";
import { handler, json, requireUser } from "@/lib/http";
import { earnedToday } from "@/lib/sessions";
import { explorerAddressUrl, fromBaseUnits, getTokenBalance } from "@/lib/solana";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await requireUser();
  const onChain = await getTokenBalance(user.walletPubkey);
  let balance = onChain;
  let balanceSource: "chain" | "db" = "chain";
  if (balance === null) {
    const agg = await prisma.reward.aggregate({ where: { userId: user.id, status: "paid" }, _sum: { amount: true } });
    balance = fromBaseUnits(agg._sum.amount ?? 0);
    balanceSource = "db";
  }
  return json({
    username: user.username,
    walletPubkey: user.walletPubkey,
    walletUrl: explorerAddressUrl(user.walletPubkey),
    balance,
    balanceSource,
    earnedToday: await earnedToday(user.id),
    dailyCap: Number(process.env.DAILY_TOKEN_CAP ?? 1000),
  });
});
