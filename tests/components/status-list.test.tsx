// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusList } from "@/components/status-list";
import type { PdfStatus } from "@/lib/types";

describe("StatusList", () => {
  it("renders each pdf row with stage label", () => {
    const items: PdfStatus[] = [
      {
        pdfId: "a",
        filename: "alpha.pdf",
        stage: "extracting",
        pagesGenerated: 0,
      },
      { pdfId: "b", filename: "beta.pdf", stage: "done", pagesGenerated: 12 },
    ];
    render(<StatusList items={items} />);
    expect(screen.getByText("alpha.pdf")).toBeInTheDocument();
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
    render(<StatusList items={items} />);
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });
});
