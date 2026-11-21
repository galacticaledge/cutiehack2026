import { json } from "@/lib/http";
import { activeProvider } from "@/lib/llm";
import { resourcesEnabled } from "@/lib/resources";
import { solanaConfigured } from "@/lib/solana";
import { ttsEnabled } from "@/lib/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return json({ tts: ttsEnabled(), learnMore: resourcesEnabled(), llmProvider: activeProvider(), solana: solanaConfigured() });
}
