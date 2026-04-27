import { describe, it, expect } from "vitest";
import { EventBus } from "@/lib/events/bus";
import type { BatchEvent } from "@/lib/types";

describe("EventBus", () => {
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
});
