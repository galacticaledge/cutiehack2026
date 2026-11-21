import "server-only";
import OpenAI from "openai";

export type LLMKind = "tutor" | "check";
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export class LLMUnavailableError extends Error {
  name = "LLMUnavailableError";
}

let aisaClient: OpenAI | null = null;
let openaiClient: OpenAI | null = null;

function aisa(): OpenAI | null {
  if (!process.env.AISA_API_KEY) return null;
  aisaClient ??= new OpenAI({
    apiKey: process.env.AISA_API_KEY,
    baseURL: process.env.AISA_BASE_URL || "https://api.aisa.one/v1",
    timeout: 30_000,
    maxRetries: 0,
  });
  return aisaClient;
}

function openai(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 0 });
  return openaiClient;
}

export function llmConfigured(): boolean {
  return Boolean(process.env.AISA_API_KEY || process.env.OPENAI_API_KEY);
}

export function activeProvider(): "aisa" | "openai" | "none" {
  if (process.env.LLM_PROVIDER !== "openai" && process.env.AISA_API_KEY) return "aisa";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "none";
}

async function callOnce(client: OpenAI, model: string, messages: ChatMessage[], effort: string | undefined, json: boolean) {
  const base = {
    model,
    messages,
    store: false,
    ...(json ? { response_format: { type: "json_object" as const } } : {}),
  };
  try {
    const res = await client.chat.completions.create({ ...base, ...(effort ? { reasoning_effort: effort } : {}) } as never);
    return (res as OpenAI.Chat.Completions.ChatCompletion).choices[0]?.message?.content ?? "";
  } catch (e) {
    const msg = String((e as Error)?.message ?? "");
    if (effort && /reasoning|effort/i.test(msg)) {
      const res = await client.chat.completions.create(base as never);
      return (res as OpenAI.Chat.Completions.ChatCompletion).choices[0]?.message?.content ?? "";
    }
    throw e;
  }
}

/** AIsa first (if configured), OpenAI fallback. Returns { text, provider }. */
export async function complete(
  kind: LLMKind,
  messages: ChatMessage[],
  opts: { json?: boolean; effort?: string } = {},
): Promise<{ text: string; provider: "aisa" | "openai" }> {
  const effort = opts.effort ?? (kind === "tutor" ? process.env.LLM_TUTOR_EFFORT || "low" : process.env.LLM_CHECK_EFFORT || "none");
  const json = Boolean(opts.json);
  const a = process.env.LLM_PROVIDER !== "openai" ? aisa() : null;
  if (a) {
    try {
      const text = await callOnce(a, process.env.AISA_MODEL || "gpt-6.1-terra", messages, effort, json);
      return { text, provider: "aisa" };
    } catch (e) {
      console.warn("[llm] aisa failed, falling back:", (e as Error)?.message);
    }
  }
  const o = openai();
  if (!o) throw new LLMUnavailableError("No LLM provider available");
  try {
    const text = await callOnce(o, process.env.OPENAI_MODEL || "gpt-6.1-terra", messages, effort, json);
    return { text, provider: "openai" };
  } catch (e) {
    console.warn("[llm] openai failed:", (e as Error)?.message);
    throw new LLMUnavailableError("LLM call failed");
  }
}

/** Defensive JSON parse: strips code fences, returns null on failure. */
export function parseJson<T>(text: string): T | null {
  const cleaned = text.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}

export async function completeJson<T>(kind: LLMKind, messages: ChatMessage[], effort?: string): Promise<T | null> {
  const { text } = await complete(kind, messages, { json: true, effort });
  return parseJson<T>(text);
}
