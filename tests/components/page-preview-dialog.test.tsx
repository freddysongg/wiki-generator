// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PagePreviewDialog } from "@/components/page-preview-dialog";

const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn(
    async () =>
      new Response("Body content here.", {
        status: 200,
        headers: { "content-type": "text/markdown" },
      }),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe("PagePreviewDialog", () => {
  it("renders fetched markdown when open", async () => {
    render(
      <PagePreviewDialog
        open={true}
        onOpenChange={() => {}}
        batchId="b1"
        filename="X.md"
        title="X"
        source="alpha.pdf"
        sourcePages="pp. 1-2"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Body content here/)).toBeInTheDocument();
    });
    expect(screen.getByText("X")).toBeInTheDocument();
    expect(screen.getByText(/alpha\.pdf/)).toBeInTheDocument();
  });

  it("shows an error message when fetch fails", async () => {
    global.fetch = vi.fn(
      async () => new Response("not found", { status: 404 }),
    ) as unknown as typeof fetch;

    render(
      <PagePreviewDialog
        open={true}
        onOpenChange={() => {}}
        batchId="b1"
        filename="X.md"
        title="X"
        source="alpha.pdf"
        sourcePages="pp. 1-2"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/could not load page/i)).toBeInTheDocument();
    });
  });
});
