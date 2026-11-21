export class ApiError extends Error {
  status: number;
  data?: Record<string, unknown>;
  constructor(status: number, message: string, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function api<T = Record<string, unknown>>(path: string, body?: unknown, method?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: method ?? (body !== undefined ? "POST" : "GET"),
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    if (res.status === 401 && window.location.pathname !== "/") window.location.href = "/";
    throw new ApiError(res.status, String(data.error ?? "Something went wrong."), data);
  }
  return data as T;
}

export function refreshBalance() {
  window.dispatchEvent(new Event("socra:balance"));
}

/** Best-effort anti-cheat telemetry. Never sends pasted content, only its length. */
export function postEvent(sessionId: string, type: "hidden" | "visible" | "paste", data: Record<string, unknown> = {}) {
  try {
    const body = JSON.stringify({ type, data });
    const url = `/api/sessions/${sessionId}/events`;
    if (!navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) {
      void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
    }
  } catch {
    /* ignore */
  }
}

// ---- API types (mirror the Rust responses; never contain answers) ----
export interface Me {
  username: string;
  walletPubkey: string;
  walletUrl: string;
  balance: number;
  balanceSource: "chain" | "db";
  earnedToday: number;
  dailyCap: number;
}

export interface Problem {
  id: string;
  title: string;
  concept: string;
  difficulty: number;
  earned: boolean;
  rewardStatus: string | null;
  maxReward: number;
}

export interface Chip {
  label: string;
  status: "correct" | "incorrect";
}

export interface ChatMessage {
  id: string;
  role: "user" | "tutor";
  content: string;
  verdicts: Chip[];
  pending?: boolean;
}

export interface RewardView {
  amount: number;
  status: "paid" | "failed" | "forfeited" | "minting" | "practice";
  breakdown: string;
  explorerUrl?: string | null;
  flags?: string[] | null;
}

export interface SessionView {
  id: string;
  source: "bank" | "quest" | "custom_problem" | "custom_topic";
  conceptId?: string | null;
  practiceReason?: string | null;
  checkedBy?: "engine" | "sandbox" | null;
  templateId: string | null;
  title: string;
  prompt: string;
  difficulty: number;
  checkpointCount: number;
  startedAt: string;
  solvedAt: string | null;
  hintsUsed: number;
  revealedHints: string[];
  wrongAttempts: number;
  attemptsToday: number;
  attemptsDateUtc: string;
  attemptsLeft: number | null;
  locked: boolean;
  status: "active" | "solved" | "done";
  practice: boolean;
  potentialReward: number;
  hasAnswerCheck: boolean;
  testimonyTriesLeft?: number;
  explainPassed: boolean | null;
  explainFeedback: string | null;
  explanation: string | null;
  reward: RewardView | null;
  matchedTemplate?: { id: string; title: string } | null;
  messages: ChatMessage[];
}

export interface Features {
  tts: boolean;
  learnMore: boolean;
  llmProvider: string;
  solana: boolean;
  codeRunner?: boolean;
}

export interface ConceptNode {
  id: string;
  title: string;
  subject: string;
  prereqs: string[];
  status: "mastered" | "available" | "locked";
  proficiency: "new" | "learning" | "demonstrated" | "proficient";
  attemptsToday: number;
  rewarded: boolean;
  bankTemplateId: string | null;
}

export interface ConceptMap {
  concepts: ConceptNode[];
  attemptsDateUtc: string;
  topicRewardsToday: number;
  dailyTopicCap: number;
  questBase: number;
}

export interface JournalEntry {
  sessionId: string;
  templateId: string;
  title: string;
  difficulty: number;
  startedAt: string;
  solvedAt: string | null;
  hintsUsed: number;
  wrongAttempts: number;
  explanation: string | null;
  explainPassed: boolean | null;
  explainFeedback: string | null;
  reward: RewardView | null;
}

/** Whether this server has the Map of Wonderland (/api/concepts). Checked once per page load. */
let mapProbe: Promise<boolean> | null = null;
export function mapAvailable(): Promise<boolean> {
  mapProbe ??= fetch("/api/concepts", { credentials: "same-origin" })
    // Only a real JSON answer counts (an HTML page or a 404 means this server has no map).
    .then((r) => r.status !== 404 && (r.headers.get("content-type") ?? "").includes("json"))
    .catch(() => false);
  return mapProbe;
}

/** Server features, fetched once per page load. */
let featuresProbe: Promise<Features | null> | null = null;
export function getFeatures(): Promise<Features | null> {
  featuresProbe ??= api<Features>("/api/features").catch(() => null);
  return featuresProbe;
}

/** Throwaway demo accounts (guest pass, judge mode) never hold real tokens. */
export function isGuestName(username: string) {
  return /^(guest|copycat)-/.test(username);
}

