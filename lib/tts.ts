import "server-only";
import crypto from "node:crypto";

export function ttsEnabled(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
}

/** Turn markdown + LaTeX into something a voice can read. */
export function toSpeakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*/g, " "))
    .replace(/\\[dt]?frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, "$1 over $2")
    .replace(/\\sqrt\s*\{([^}]*)\}/g, "square root of $1")
    .replace(/sqrt\(([^)]*)\)/g, "square root of $1")
    .replace(/\^\s*\{?2\}?/g, " squared")
    .replace(/\^\s*\{?3\}?/g, " cubed")
    .replace(/\^\s*\{?(-?\w+)\}?/g, " to the power $1")
    .replace(/\\(cdot|times)/g, " times ")
    .replace(/\\text\{([^}]*)\}/g, "$1")
    .replace(/\\,/g, " ")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[{}$`*_#>]/g, "")
    .replace(/\s=\s|=/g, " equals ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

const cache = new Map<string, Buffer>();

export async function synthesize(text: string): Promise<Buffer> {
  const speakable = toSpeakable(text);
  const key = crypto.createHash("sha256").update(speakable).digest("hex");
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(process.env.ELEVENLABS_VOICE_ID!)}`, {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({ text: speakable, model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (cache.size > 200) cache.clear();
  cache.set(key, buf);
  return buf;
}
