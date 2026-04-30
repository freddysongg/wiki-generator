// @vitest-environment jsdom
import { forwardRef } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { GraphPreview } from "@/components/graph-preview";

vi.mock("react-force-graph-2d", () => ({
  default: forwardRef<HTMLDivElement>((_props, ref) => (
    <div ref={ref} data-testid="force-graph" />
  )),
}));

const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("GraphPreview", () => {
  it("renders the graph when manifest loads", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        version: "1.0.0",
        batchId: "b1",
        createdAt: "2026-04-27T00:00:00.000Z",
        granularity: "medium",
        pages: [
          {
            title: "A",
            filename: "A.md",
            aliases: [],
            type: "concept",
            source: "x.pdf",
            sourcePages: "p.1",
            tags: [],
            links: ["B"],
            createdAt: "2026-04-27T00:00:00.000Z",
          },
          {
            title: "B",
            filename: "B.md",
            aliases: [],
            type: "concept",
            source: "x.pdf",
            sourcePages: "p.2",
            tags: [],
            links: [],
            createdAt: "2026-04-27T00:00:00.000Z",
          },
        ],
      }),
    }) as unknown as typeof fetch;

    render(<GraphPreview batchId="b1" />);
    await waitFor(() =>
      expect(screen.getByTestId("force-graph")).toBeInTheDocument(),
    );
    expect(screen.getByText(/2 concepts/i)).toBeInTheDocument();
    expect(screen.getByText(/1 link/i)).toBeInTheDocument();
  });

  it("shows not-found message on 404", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "manifest not found" }),
    }) as unknown as typeof fetch;
    render(<GraphPreview batchId="missing" />);
    await waitFor(() =>
      expect(screen.getByText(/manifest unavailable/i)).toBeInTheDocument(),
    );
  });

  it("shows empty message when manifest has zero pages", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        version: "1.0.0",
        batchId: "b1",
        createdAt: "2026-04-27T00:00:00.000Z",
        granularity: "medium",
        pages: [],
      }),
    }) as unknown as typeof fetch;
    render(<GraphPreview batchId="b1" />);
    await waitFor(() =>
      expect(screen.getByText(/no concepts/i)).toBeInTheDocument(),
    );
  });
});
