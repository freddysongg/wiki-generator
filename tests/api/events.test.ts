import { describe, it, expect } from "vitest";
import { getEventBus } from "@/lib/events/bus";

describe("GET /api/events/[batchId]", () => {
  it("streams events as SSE messages", async () => {
    const { GET } = await import("@/app/api/events/[batchId]/route");
    const bus = getEventBus();
    const req = new Request("http://localhost/api/events/b1");
    const res = await GET(req, { params: Promise.resolve({ batchId: "b1" }) });
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    bus.publish({ type: "status", batchId: "b1", pdfId: "p", stage: "queued", pagesGenerated: 0 });
    bus.publish({
      type: "complete",
      batchId: "b1",
      totals: { pages: 0, links: 0, failed: 0 },
    });

    const reader = res.body?.getReader();
    if (!reader) throw new Error("no stream");
    const dec = new TextDecoder();
    let buf = "";
    for (let i = 0; i < 5; i++) {
      const chunk = await reader.read();
      if (chunk.value) buf += dec.decode(chunk.value);
      if (buf.includes('"type":"complete"')) break;
    }
    expect(buf).toContain('"type":"status"');
    expect(buf).toContain('"type":"complete"');
    await reader.cancel();
  });
});
