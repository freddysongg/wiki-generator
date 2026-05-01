// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SearchDialog } from "@/components/search-dialog";

const ORIGINAL_FETCH = global.fetch;

const RECORDS = [
  {
    id: "a::Alpha.md",
    batchId: "a",
    filename: "Alpha.md",
    title: "Alpha Concept",
    aliases: ["First"],
    source: "alpha.pdf",
    sourcePages: "p. 1",
    createdAt: "2026-04-25T00:00:00.000Z",
  },
  {
    id: "a::Beta.md",
    batchId: "a",
    filename: "Beta.md",
    title: "Beta Topic",
    aliases: [],
    source: "alpha.pdf",
    sourcePages: "p. 2",
    createdAt: "2026-04-25T00:00:00.000Z",
  },
  {
    id: "b::Gamma.md",
    batchId: "b",
    filename: "Gamma.md",
    title: "Gamma",
    aliases: ["Third"],
    source: "beta.pdf",
    sourcePages: "pp. 3-4",
    createdAt: "2026-04-27T00:00:00.000Z",
  },
];

function mockFetchOnce(): void {
  global.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ records: RECORDS }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  mockFetchOnce();
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("SearchDialog", () => {
  it("loads the index on open and shows recent records when query is empty", async () => {
    render(
      <SearchDialog open={true} onOpenChange={() => {}} onSelect={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getByText("Alpha Concept")).toBeInTheDocument();
    });
    expect(screen.getByText("Beta Topic")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });

  it("filters results by title prefix", async () => {
    render(
      <SearchDialog open={true} onOpenChange={() => {}} onSelect={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getByText("Alpha Concept")).toBeInTheDocument();
    });
    const input = screen.getByLabelText("search query");
    fireEvent.change(input, { target: { value: "gam" } });
    await waitFor(() => {
      expect(screen.getByText("Gamma")).toBeInTheDocument();
    });
    expect(screen.queryByText("Alpha Concept")).not.toBeInTheDocument();
  });

  it("calls onSelect and closes when Enter is pressed", async () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <SearchDialog
        open={true}
        onOpenChange={onOpenChange}
        onSelect={onSelect}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Gamma")).toBeInTheDocument();
    });
    const input = screen.getByLabelText("search query");
    fireEvent.change(input, { target: { value: "gamma" } });
    await waitFor(() => {
      expect(screen.getByText("Gamma")).toBeInTheDocument();
    });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({
      id: "b::Gamma.md",
      batchId: "b",
      filename: "Gamma.md",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an empty-state hint when query yields no matches", async () => {
    render(
      <SearchDialog open={true} onOpenChange={() => {}} onSelect={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getByText("Alpha Concept")).toBeInTheDocument();
    });
    const input = screen.getByLabelText("search query");
    fireEvent.change(input, { target: { value: "zzznotamatch" } });
    await waitFor(() => {
      expect(
        screen.getByText(/no results match this query/i),
      ).toBeInTheDocument();
    });
  });
});
