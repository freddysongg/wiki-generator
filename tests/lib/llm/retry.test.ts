import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry, defaultRetryOn, TimeoutError } from "@/lib/llm/retry";

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

class CodeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

describe("defaultRetryOn", () => {
  it("retries on retryable HTTP statuses", () => {
    expect(defaultRetryOn(new HttpError(429, "rate limited"))).toBe(true);
    expect(defaultRetryOn(new HttpError(503, "unavailable"))).toBe(true);
    expect(defaultRetryOn(new HttpError(408, "timeout"))).toBe(true);
  });

  it("does not retry on non-retryable HTTP statuses", () => {
    expect(defaultRetryOn(new HttpError(400, "bad request"))).toBe(false);
    expect(defaultRetryOn(new HttpError(401, "unauthorized"))).toBe(false);
    expect(defaultRetryOn(new HttpError(404, "not found"))).toBe(false);
  });

  it("retries on retryable error codes", () => {
    expect(defaultRetryOn(new CodeError("ETIMEDOUT", "timed out"))).toBe(true);
    expect(defaultRetryOn(new CodeError("ECONNRESET", "reset"))).toBe(true);
    expect(defaultRetryOn(new CodeError("EAI_AGAIN", "dns"))).toBe(true);
  });

  it("retries on retryable message fragments", () => {
    expect(defaultRetryOn(new Error("Rate limit exceeded"))).toBe(true);
    expect(defaultRetryOn(new Error("Service Temporarily Unavailable"))).toBe(
      true,
    );
    expect(defaultRetryOn(new Error("operation timeout"))).toBe(true);
  });

  it("does not retry on unrelated errors", () => {
    expect(defaultRetryOn(new Error("validation error"))).toBe(false);
    expect(defaultRetryOn("string thrown")).toBe(false);
    expect(defaultRetryOn(undefined)).toBe(false);
  });
});

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the value on first success without delay", async () => {
    const fn = vi.fn(async () => "ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on a retryable error and eventually returns", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new HttpError(429, "rate limited"))
      .mockRejectedValueOnce(new HttpError(503, "unavailable"))
      .mockResolvedValueOnce("done");

    const promise = withRetry(fn, { retries: 3, baseMs: 10, maxMs: 100 });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("done");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws immediately on non-retryable error", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new HttpError(400, "bad request"));

    const promise = withRetry(fn, { retries: 5, baseMs: 10 });
    await expect(promise).rejects.toMatchObject({ status: 400 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws the last error after exhausting retries", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new HttpError(503, "still unavailable"));

    const promise = withRetry(fn, { retries: 2, baseMs: 10, maxMs: 100 });
    promise.catch(() => undefined);
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toMatchObject({
      status: 503,
      message: "still unavailable",
    });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("respects a custom retryOn predicate", async () => {
    const customRetryable = new Error("custom retryable");
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(customRetryable)
      .mockResolvedValueOnce("ok");

    const promise = withRetry(fn, {
      retries: 2,
      baseMs: 10,
      retryOn: (err) => err === customRetryable,
    });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry under custom retryOn that rejects all", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new HttpError(429, "rate limited"));

    const promise = withRetry(fn, {
      retries: 5,
      baseMs: 10,
      retryOn: () => false,
    });
    await expect(promise).rejects.toMatchObject({ status: 429 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("waits within full-jitter exponential bounds between attempts", async () => {
    vi.useRealTimers();
    const baseMs = 50;
    const maxMs = 1000;

    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    const setTimeoutSpy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation(((handler: TimerHandler, ms?: number) => {
        if (typeof ms === "number") delays.push(ms);
        return originalSetTimeout(handler as () => void, 0);
      }) as unknown as typeof setTimeout);

    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new HttpError(503, "x"))
      .mockRejectedValueOnce(new HttpError(503, "x"))
      .mockRejectedValueOnce(new HttpError(503, "x"))
      .mockResolvedValueOnce("ok");

    const SENTINEL_TIMEOUT_MS = 999_999;
    await expect(
      withRetry(fn, {
        retries: 3,
        baseMs,
        maxMs,
        timeoutMs: SENTINEL_TIMEOUT_MS,
      }),
    ).resolves.toBe("ok");

    const sleepDelays = delays.filter((d) => d !== SENTINEL_TIMEOUT_MS);
    expect(sleepDelays).toHaveLength(3);
    for (let i = 0; i < sleepDelays.length; i++) {
      const cap = Math.min(maxMs, baseMs * 2 ** i);
      expect(sleepDelays[i]).toBeGreaterThanOrEqual(baseMs);
      expect(sleepDelays[i]).toBeLessThanOrEqual(cap);
    }

    setTimeoutSpy.mockRestore();
  });

  it("rejects with TimeoutError when fn exceeds the per-attempt timeout", async () => {
    vi.useRealTimers();
    const fn = vi.fn<() => Promise<string>>().mockImplementation(
      () =>
        new Promise<string>((res) => {
          const t: NodeJS.Timeout = setTimeout(() => res("late"), 200);
          t.unref();
        }),
    );

    const err = await withRetry(fn, {
      retries: 0,
      baseMs: 1,
      maxMs: 1,
      timeoutMs: 20,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TimeoutError);
    expect((err as TimeoutError).timeoutMs).toBe(20);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("TimeoutError", () => {
  it("is an Error with timeoutMs and a descriptive message", () => {
    const err = new TimeoutError(123);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("TimeoutError");
    expect(err.timeoutMs).toBe(123);
    expect(err.message).toContain("123");
  });

  it("is recognized as retryable by defaultRetryOn", () => {
    expect(defaultRetryOn(new TimeoutError(100))).toBe(true);
  });
});
