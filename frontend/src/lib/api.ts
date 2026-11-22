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
  /** Open chat on a skill-tree node: the way to earn on it (a checked problem). */
  claim?: {
    conceptId: string;
    title: string;
    reason: string | null;
    existingSessionId: string | null;
    reward: number;
    /** Earn in the chat itself by explaining the concept (POST /testify). */
    chatReward: number;
    testimonyTriesLeft: number;
    earnedHere: RewardView | null;
  } | null;
  messages: ChatMessage[];
}

export interface Features {
  tts: boolean;
  learnMore: boolean;
  llmProvider: string;
  solana: boolean;
  codeRunner?: boolean;
  personalizedConcepts?: boolean;
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
  /** Added to the map by a student asking about a new topic. */
  grown?: boolean;
  bankTemplateId: string | null;
  practiceOnly?: boolean;
  objective?: string | null;
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

let mapProbe: Promise<boolean> | null = null;
export function mapAvailable(): Promise<boolean> {
  mapProbe ??= fetch("/api/concepts", { credentials: "same-origin" })
    .then((r) => r.status !== 404 && (r.headers.get("content-type") ?? "").includes("json"))
    .catch(() => false);
  return mapProbe;
}

let featuresProbe: Promise<Features | null> | null = null;
export function getFeatures(): Promise<Features | null> {
  featuresProbe ??= api<Features>("/api/features").catch(() => null);
  return featuresProbe;
}

export function isGuestName(username: string) {
  return /^(guest|copycat)-/.test(username);
}

export const USERNAME_RE = /^[a-z0-9_-]{2,24}$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

function randomPassword() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "x");
}

export async function signUpThrowaway(prefix: "guest" | "copycat") {
  for (let attempt = 0; attempt < 3; attempt++) {
    const username = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      return await api<{ username: string; walletPubkey: string }>("/api/auth/signup", { username, password: randomPassword() });
    } catch (e) {
      if ((e as ApiError).status !== 409) throw e;
    }
  }
  throw new ApiError(409, "Couldn't find a free guest name. Please try again.");
}

export interface ConceptBrief {
  id: string;
  title: string;
  subject: string;
  prereqs: string[];
  bankTemplateId: string | null;
  practiceOnly: boolean;
  objective: string | null;
}

export interface Proposal {
  proposalId: string;
  anchorId: string;
  title: string;
  objective: string;
  reason: string;
  prereqIds: string[];
}

export type NextStep = { kind: "existing"; concept: ConceptBrief } | { kind: "proposal"; proposal: Proposal };

export function nextStep(conceptId: string) {
  return api<NextStep>(`/api/concepts/${encodeURIComponent(conceptId)}/next-step`, {});
}

export function acceptProposal(proposalId: string) {
  return api<{ conceptId: string }>(`/api/concept-proposals/${encodeURIComponent(proposalId)}/accept`, {});
}

export async function startConcept(c: { id: string; title: string; bankTemplateId: string | null }) {
  try {
    return await api<{ sessionId: string }>("/api/sessions", { conceptId: c.id });
  } catch (e) {
    const err = e as ApiError;
    if (err.status !== 400 || !/Unknown problem/i.test(err.message)) throw e;
    return api<{ sessionId: string }>("/api/sessions", c.bankTemplateId ? { templateId: c.bankTemplateId } : { custom: { kind: "topic", text: c.title, quest: true } });
  }
}

export interface TartsLedgerEntry extends RewardView {
  sessionId: string;
  kind: "problem" | "topic";
  title: string;
  createdAt: string;
}

export interface TartsRates {
  bankBase: number[];
  questBase: number;
  hintMult: number[];
  attemptStep: number;
  attemptFloor: number;
  testimonyMiss: number;
  minimumShare: number;
}

export interface Treasury {
  earnedToday: number;
  dailyCap: number;
  topicRewardsToday: number;
  dailyTopicCap: number;
  mintUrl: string | null;
  totals: { paid: number; paidCount: number; forfeitedCount: number; pendingCount: number };
  daily: { date: string; amount: number }[];
  ledger: TartsLedgerEntry[];
  rates: TartsRates;
}

export interface TartsEstimate {
  amount: number;
  uncapped: number;
  summary: string;
  note: string | null;
}
