import { handler, json } from "@/lib/http";
import { clearSessionCookie } from "@/lib/session";

export const runtime = "nodejs";

export const POST = handler(async () => {
  await clearSessionCookie();
  return json({ ok: true });
});
