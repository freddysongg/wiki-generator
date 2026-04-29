// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusList } from "@/components/status-list";
import { BatchProvider } from "@/components/batch-context";
import type { ManifestPage, PdfStatus } from "@/lib/types";

vi.mock("@/components/batch-context", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/batch-context")>();
  const stubPage: ManifestPage = {
    title: "Backpropagation",
    filename: "Backpropagation.md",
    aliases: [],
    type: "concept",
    source: "alpha.pdf",
    sourcePages: "pp. 1-2",
    tags: ["wiki-generator"],
    links: [],
    createdAt: "2026-04-29T00:00:00.000Z",
  };
  return {
    ...actual,
    useBatch: () => ({
      snapshot: {
        stage: "complete" as const,
        queuedCount: 0,
        statuses: [],
        totals: null,
        importResult: null,
        manifest: null,
      },
      setQueuedCount: () => {},
      startBatch: () => {},
      importBatch: async () => {},
      isImporting: false,
      resetBatch: () => {},
      getPagesForSource: (source: string): ManifestPage[] =>
        source === "alpha.pdf" ? [stubPage] : [],
    }),
  };
});

describe("StatusList", () => {
  it("renders each pdf row with stage label", () => {
    const items: PdfStatus[] = [
      {
        pdfId: "a",
        filename: "gamma.pdf",
        stage: "extracting",
        pagesGenerated: 0,
      },
      { pdfId: "b", filename: "beta.pdf", stage: "done", pagesGenerated: 12 },
    ];
    render(
      <BatchProvider>
        <StatusList items={items} />
      </BatchProvider>,
    );
    expect(screen.getByText("gamma.pdf")).toBeInTheDocument();
    expect(screen.getByText("beta.pdf")).toBeInTheDocument();
    expect(screen.getByText(/12/)).toBeInTheDocument();
    expect(screen.getByText(/extracting/i)).toBeInTheDocument();
    expect(screen.getByText(/done/i)).toBeInTheDocument();
  });

  it("shows error message on failed rows", () => {
    const items: PdfStatus[] = [
      {
        pdfId: "x",
        filename: "x.pdf",
        stage: "failed",
        pagesGenerated: 0,
        error: "boom",
      },
    ];
    render(
      <BatchProvider>
        <StatusList items={items} />
      </BatchProvider>,
    );
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });

  it("does not render an expand chevron when no pages exist for source", () => {
    const items: PdfStatus[] = [
      { pdfId: "a", filename: "gamma.pdf", stage: "done", pagesGenerated: 3 },
    ];
    render(
      <BatchProvider>
        <StatusList items={items} onPageOpen={() => {}} />
      </BatchProvider>,
    );
    expect(screen.queryByRole("button", { name: /expand pages/i })).toBeNull();
  });

  it("does not render chevron for parsing or failed stages even when manifest has pages", () => {
    const items: PdfStatus[] = [
      {
        pdfId: "a",
        filename: "alpha.pdf",
        stage: "parsing",
        pagesGenerated: 0,
      },
      {
        pdfId: "b",
        filename: "alpha.pdf",
        stage: "failed",
        pagesGenerated: 0,
        error: "boom",
      },
    ];
    render(
      <BatchProvider>
        <StatusList items={items} onPageOpen={() => {}} />
      </BatchProvider>,
    );
    expect(screen.queryByRole("button", { name: /expand pages/i })).toBeNull();
  });

  it("renders chevron for done stage when manifest has pages", () => {
    const items: PdfStatus[] = [
      { pdfId: "a", filename: "alpha.pdf", stage: "done", pagesGenerated: 1 },
    ];
    render(
      <BatchProvider>
        <StatusList items={items} onPageOpen={() => {}} />
      </BatchProvider>,
    );
    expect(
      screen.getByRole("button", { name: /expand pages/i }),
    ).toBeInTheDocument();
  });
});
