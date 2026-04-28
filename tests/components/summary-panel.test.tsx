// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SummaryPanel } from "@/components/summary-panel";

describe("SummaryPanel", () => {
  it("renders totals and triggers onImport", () => {
    const onImport = vi.fn();
    render(
      <SummaryPanel
        totals={{ pages: 42, links: 88, failed: 1 }}
        importing={false}
        importResult={null}
        onImport={onImport}
      />,
    );
    expect(screen.getByText("Pages")).toBeInTheDocument();
    expect(screen.getByText("Links")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /import to wiki/i }));
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it("shows import result message when available", () => {
    render(
      <SummaryPanel
        totals={{ pages: 1, links: 0, failed: 0 }}
        importing={false}
        importResult={{ imported: 1, conflicts: 0 }}
        onImport={() => {}}
      />,
    );
    expect(screen.getByText(/imported 1/i)).toBeInTheDocument();
  });
});
