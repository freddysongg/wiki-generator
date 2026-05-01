// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BatchRow } from "@/components/batch-row";
import type { BatchSummary } from "@/lib/types";

const FIXTURE: BatchSummary = {
  batchId: "b-2026-04-27",
  createdAt: "2026-04-27T10:00:00.000Z",
  granularity: "medium",
  pageCount: 12,
  linkCount: 38,
  sources: ["a.pdf", "b.pdf"],
};

const NOOP = (): void => {};

describe("BatchRow", () => {
  it("renders metadata, sources, and actions", () => {
    render(
      <BatchRow
        batch={FIXTURE}
        isImporting={false}
        isDeleting={false}
        onImport={NOOP}
        onDelete={NOOP}
      />,
    );
    expect(screen.getByText(/12 pages · 38 links/)).toBeInTheDocument();
    expect(screen.getByText("a.pdf")).toBeInTheDocument();
    expect(screen.getByText("b.pdf")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /graph/i })).toHaveAttribute(
      "href",
      "/graph?batch=b-2026-04-27",
    );
    expect(screen.getByRole("button", { name: /import/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /delete batch/i }),
    ).toBeInTheDocument();
  });

  it("calls onImport with the batchId", () => {
    const onImport = vi.fn();
    render(
      <BatchRow
        batch={FIXTURE}
        isImporting={false}
        isDeleting={false}
        onImport={onImport}
        onDelete={NOOP}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /import/i }));
    expect(onImport).toHaveBeenCalledWith("b-2026-04-27");
  });

  it("calls onDelete with the batchId", () => {
    const onDelete = vi.fn();
    render(
      <BatchRow
        batch={FIXTURE}
        isImporting={false}
        isDeleting={false}
        onImport={NOOP}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /delete batch/i }));
    expect(onDelete).toHaveBeenCalledWith("b-2026-04-27");
  });

  it("disables the import button while importing", () => {
    render(
      <BatchRow
        batch={FIXTURE}
        isImporting={true}
        isDeleting={false}
        onImport={NOOP}
        onDelete={NOOP}
      />,
    );
    const button = screen.getByRole("button", { name: /importing/i });
    expect(button).toBeDisabled();
  });

  it("disables the delete button while deleting", () => {
    render(
      <BatchRow
        batch={FIXTURE}
        isImporting={false}
        isDeleting={true}
        onImport={NOOP}
        onDelete={NOOP}
      />,
    );
    const button = screen.getByRole("button", { name: /delete batch/i });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(/deleting/i);
  });

  it("collapses extra sources beyond the visible cap", () => {
    const many: BatchSummary = {
      ...FIXTURE,
      sources: ["1.pdf", "2.pdf", "3.pdf", "4.pdf", "5.pdf"],
    };
    render(
      <BatchRow
        batch={many}
        isImporting={false}
        isDeleting={false}
        onImport={NOOP}
        onDelete={NOOP}
      />,
    );
    expect(screen.getByText(/\+2 more/)).toBeInTheDocument();
  });
});
