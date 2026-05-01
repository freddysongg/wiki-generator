export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  timeoutMs?: number;
  retryOn?: (err: unknown) => boolean;
}

const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_MS = 1000;
const DEFAULT_MAX_MS = 30000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export class TimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`Operation timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([
  408, 425, 429, 500, 502, 503, 504,
]);

const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
]);

const RETRYABLE_MESSAGE_FRAGMENTS: readonly string[] = [
  "rate limit",
  "timeout",
  "temporarily unavailable",
];

function getStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const candidate = (err as { status?: unknown }).status;
  return typeof candidate === "number" ? candidate : undefined;
}

function getCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const candidate = (err as { code?: unknown }).code;
  return typeof candidate === "string" ? candidate : undefined;
}

function getMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (typeof err !== "object" || err === null) return undefined;
  const candidate = (err as { message?: unknown }).message;
  return typeof candidate === "string" ? candidate : undefined;
}

export function defaultRetryOn(err: unknown): boolean {
  if (err instanceof TimeoutError) return true;

  const status = getStatus(err);
  if (status !== undefined && RETRYABLE_STATUSES.has(status)) return true;

  const code = getCode(err);
  if (code !== undefined && RETRYABLE_CODES.has(code)) return true;

  const message = getMessage(err);
  if (message) {
    const lower = message.toLowerCase();
    if (
      RETRYABLE_MESSAGE_FRAGMENTS.some((fragment) => lower.includes(fragment))
    ) {
      return true;
    }
  }

  return false;
}

function computeDelayMs(
  attempt: number,
  baseMs: number,
  maxMs: number,
): number {
  const exponentialCap = Math.min(maxMs, baseMs * 2 ** attempt);
  if (exponentialCap <= baseMs) return baseMs;
  return baseMs + Math.random() * (exponentialCap - baseMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(timeoutMs)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions,
): Promise<T> {
  const retries = opts?.retries ?? DEFAULT_RETRIES;
  const baseMs = opts?.baseMs ?? DEFAULT_BASE_MS;
  const maxMs = opts?.maxMs ?? DEFAULT_MAX_MS;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryOn = opts?.retryOn ?? defaultRetryOn;

  let attempt = 0;
  for (;;) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (err) {
      if (attempt >= retries || !retryOn(err)) throw err;
      await sleep(computeDelayMs(attempt, baseMs, maxMs));
      attempt += 1;
    }
  }
}
