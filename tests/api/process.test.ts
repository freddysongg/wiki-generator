import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/pipeline/run-batch", () => ({
  runBatch: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/config", () => ({
  loadConfig: () => ({
    anthropicApiKey: "k",
    vaultPath: "/tmp/v",
    wikiSubfolder: "wiki",
    extractionModel: "claude-sonnet-4-6",
    ocrModel: "claude-haiku-4-5-20251001",
    maxConcurrentPdfs: 1,
    ocrTextThreshold: 100,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/process", () => {
  it("returns batchId and triggers runBatch", async () => {
    const { POST } = await import("@/app/api/process/route");
    const formData = new FormData();
    formData.append("granularity", "medium");
    formData.append(
      "files",
      new File([new Uint8Array([1, 2, 3])], "x.pdf", { type: "application/pdf" }),
    );
    const req = new Request("http://localhost/api/process", { method: "POST", body: formData });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.batchId).toBe("string");
    expect(json.batchId.length).toBeGreaterThan(0);
  });

  it("rejects when no files supplied", async () => {
    const { POST } = await import("@/app/api/process/route");
    const formData = new FormData();
    formData.append("granularity", "medium");
    const req = new Request("http://localhost/api/process", { method: "POST", body: formData });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects invalid granularity", async () => {
    const { POST } = await import("@/app/api/process/route");
    const formData = new FormData();
    formData.append("granularity", "weird");
    formData.append("files", new File([new Uint8Array([1])], "x.pdf", { type: "application/pdf" }));
    const req = new Request("http://localhost/api/process", { method: "POST", body: formData });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
