import { prisma } from "@/lib/db";
import { HttpError, handler, json, readJson } from "@/lib/http";
import { setSessionCookie } from "@/lib/session";
import { generateUserWallet } from "@/lib/solana";

export const runtime = "nodejs";

export const POST = handler(async (req: Request) => {
  const body = await readJson<{ username?: string }>(req);
  const username = String(body.username ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,24}$/.test(username)) {
    throw new HttpError(400, "Usernames are 2–24 characters: letters, numbers, - and _.");
  }
  let user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    const w = generateUserWallet();
    user = await prisma.user.upsert({
      where: { username },
      update: {},
      create: { username, walletPubkey: w.pubkey, walletSecret: w.secret },
    });
  }
  await setSessionCookie(user.id);
  return json({ username: user.username, walletPubkey: user.walletPubkey });
});
