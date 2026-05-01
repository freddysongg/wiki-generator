// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { PagePreviewDialog } from "@/components/page-preview-dialog";

const ORIGINAL_FETCH = global.fetch;

interface ManifestEntry {
  title: string;
  filename: string;
}

function makeFetchMock(args: {
  body: string;
  manifestPages?: ManifestEntry[];
  bodiesByFilename?: Record<string, string>;
}): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/manifest/")) {
      const pages = args.manifestPages ?? [];
      return new Response(
        JSON.stringify({
          batchId: "b1",
          total: pages.length,
          offset: 0,
          limit: 500,
          pages,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/api/batches/")) {
      const filename = decodeURIComponent(url.split("/pages/")[1] ?? "");
      const override = args.bodiesByFilename?.[filename];
      return new Response(override ?? args.body, {
        status: 200,
        headers: { "content-type": "text/markdown" },
      });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  global.fetch = makeFetchMock({ body: "Body content here." });
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
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/manifest/")) {
        return new Response(
          JSON.stringify({
            batchId: "b1",
            total: 0,
            offset: 0,
            limit: 500,
            pages: [],
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

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

  it("renders GFM tables as <table> elements", async () => {
    const tableMarkdown = [
      "| Name | Score |",
      "| ---- | ----- |",
      "| Ada  | 99    |",
      "| Bob  | 42    |",
    ].join("\n");
    global.fetch = makeFetchMock({ body: tableMarkdown });

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

    const table = await waitFor(() => {
      const found = document.querySelector("table");
      expect(found).not.toBeNull();
      return found as HTMLTableElement;
    });
    expect(table.querySelectorAll("th")).toHaveLength(2);
    expect(table.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("99")).toBeInTheDocument();
  });

  it("renders resolved wikilinks as clickable anchors and navigates on click", async () => {
    const initialBody = "See also [[Backpropagation]] for details.";
    const linkedBody = "Backpropagation is the algorithm that...";
    global.fetch = makeFetchMock({
      body: initialBody,
      manifestPages: [
        { title: "X", filename: "X.md" },
        { title: "Backpropagation", filename: "Backpropagation.md" },
      ],
      bodiesByFilename: {
        "X.md": initialBody,
        "Backpropagation.md": linkedBody,
      },
    });

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

    const link = await waitFor(() => {
      const found = document.querySelector(
        'a[data-wikilink="resolved"]',
      ) as HTMLAnchorElement | null;
      expect(found).not.toBeNull();
      return found as HTMLAnchorElement;
    });
    expect(link.textContent).toBe("Backpropagation");
    expect(link.getAttribute("href")).toBe("#wiki/Backpropagation");

    fireEvent.click(link);

    await waitFor(() => {
      expect(
        screen.getByText(/Backpropagation is the algorithm/),
      ).toBeInTheDocument();
    });

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const requestedUrls = fetchMock.mock.calls.map((call) =>
      typeof call[0] === "string" ? call[0] : String(call[0]),
    );
    expect(
      requestedUrls.some((url) => url.endsWith("/pages/Backpropagation.md")),
    ).toBe(true);
  });

  it("renders unresolved wikilinks as muted strikethrough text without an anchor", async () => {
    const body = "Reference to [[Nonexistent Page]] here.";
    global.fetch = makeFetchMock({
      body,
      manifestPages: [{ title: "X", filename: "X.md" }],
    });

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

    const broken = await waitFor(() => {
      const found = document.querySelector(
        '[data-wikilink="broken"]',
      ) as HTMLElement | null;
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(broken.tagName.toLowerCase()).toBe("span");
    expect(broken.textContent).toBe("Nonexistent Page");
    expect(broken.className).toMatch(/line-through/);
    expect(
      document.querySelector('a[data-wikilink="resolved"][href*="Nonexistent"]'),
    ).toBeNull();
  });
});
