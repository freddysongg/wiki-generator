import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventBus } from "@/lib/events/bus";
import type { BatchEvent } from "@/lib/types";

describe("EventBus", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("delivers events to subscribers of the matching batch", async () => {
    const bus = new EventBus();
    const received: BatchEvent[] = [];
    const unsub = bus.subscribe("b1", (e) => received.push(e));
    bus.publish({ type: "status", batchId: "b1", pdfId: "p", stage: "queued", pagesGenerated: 0 });
    bus.publish({ type: "status", batchId: "b2", pdfId: "p", stage: "queued", pagesGenerated: 0 });
    expect(received).toHaveLength(1);
    if (received[0].type !== "status") throw new Error("expected status event");
    expect(received[0].batchId).toBe("b1");
    unsub();
  });

  it("buffers events published before subscribe and replays on subscribe", () => {
    const bus = new EventBus();
    bus.publish({ type: "status", batchId: "b1", pdfId: "p", stage: "queued", pagesGenerated: 0 });
    const received: BatchEvent[] = [];
    bus.subscribe("b1", (e) => received.push(e));
    expect(received).toHaveLength(1);
  });

  it("stops delivering after unsubscribe", () => {
    const bus = new EventBus();
    const received: BatchEvent[] = [];
    const unsub = bus.subscribe("b1", (e) => received.push(e));
    unsub();
    bus.publish({ type: "status", batchId: "b1", pdfId: "p", stage: "queued", pagesGenerated: 0 });
    expect(received).toHaveLength(0);
  });

  it("isolates a throwing listener from siblings", () => {
    const bus = new EventBus();
    const received: number[] = [];
    bus.subscribe("b1", () => {
      throw new Error("bad listener");
    });
    bus.subscribe("b1", () => {
      received.push(1);
    });
    bus.subscribe("b1", () => {
      received.push(2);
    });
    expect(() =>
      bus.publish({
        type: "status",
        batchId: "b1",
        pdfId: "p",
        stage: "queued",
        pagesGenerated: 0,
      }),
    ).not.toThrow();
    expect(received).toEqual([1, 2]);
  });
});
