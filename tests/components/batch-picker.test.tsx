// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BatchPicker } from "@/components/batch-picker";
import type { BatchSummary } from "@/lib/types";

const FIXTURES: BatchSummary[] = [
  {
    batchId: "b1",
    createdAt: "2026-04-27T10:00:00.000Z",
    granularity: "medium",
    pageCount: 12,
    linkCount: 30,
    sources: ["a.pdf"],
  },
  {
    batchId: "b2",
    createdAt: "2026-04-26T10:00:00.000Z",
    granularity: "fine",
    pageCount: 5,
    linkCount: 8,
    sources: ["b.pdf"],
  },
];

describe("BatchPicker", () => {
  it("renders one radio per batch and marks the selected one", () => {
    render(
      <BatchPicker
        batches={FIXTURES}
        selectedBatchId="b1"
        onSelect={() => {}}
      />,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
    expect(radios[1].getAttribute("aria-checked")).toBe("false");
  });

  it("calls onSelect with the batchId on click", () => {
    const onSelect = vi.fn();
    render(
      <BatchPicker
        batches={FIXTURES}
        selectedBatchId="b1"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getAllByRole("radio")[1]);
    expect(onSelect).toHaveBeenCalledWith("b2");
  });
});
