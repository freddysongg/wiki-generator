"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PageHero } from "@/components/page-hero";
import { SectionMarker } from "@/components/section-marker";
import { BatchRow } from "@/components/batch-row";
import type { BatchSummary, ImportResult } from "@/lib/types";

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; batches: BatchSummary[] }
  | { kind: "error"; message: string };

export default function HistoryPage(): JSX.Element {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [importingId, setImportingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/batches")
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return (await res.json()) as BatchSummary[];
      })
      .then((batches) => {
        if (cancelled) return;
        setState({ kind: "loaded", batches });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleImport = useCallback(async (batchId: string): Promise<void> => {
    setImportingId(batchId);
    try {
      const response = await fetch(
        `/api/import/${encodeURIComponent(batchId)}`,
        { method: "POST" },
      );
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(`Import failed: ${errorBody.error ?? response.status}`);
        return;
      }
      const result = (await response.json()) as ImportResult;
      const conflictNote =
        result.conflicts > 0 ? `, ${result.conflicts} renamed` : "";
      toast.success(`Imported ${result.imported} pages${conflictNote}.`);
    } finally {
      setImportingId(null);
    }
  }, []);

  const handleDelete = useCallback(async (batchId: string): Promise<void> => {
    const confirmed = window.confirm(
      `Delete batch ${batchId}? Generated pages will be removed from staging. Imported notes in your vault are unaffected.`,
    );
    if (!confirmed) return;
    setDeletingId(batchId);
    try {
      const response = await fetch(
        `/api/batches/${encodeURIComponent(batchId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(`Delete failed: ${errorBody.error ?? response.status}`);
        return;
      }
      setState((prev) => {
        if (prev.kind !== "loaded") return prev;
        return {
          kind: "loaded",
          batches: prev.batches.filter((b) => b.batchId !== batchId),
        };
      });
      toast.success("Batch deleted.");
    } finally {
      setDeletingId(null);
    }
  }, []);

  const batches = state.kind === "loaded" ? state.batches : [];
  const totalPages = useMemo(
    () => batches.reduce((sum, batch) => sum + batch.pageCount, 0),
    [batches],
  );

  return (
    <>
      <PageHero
        eyebrow="View 04"
        headline="History."
        description="Past batches and their wikis. Re-open the graph or re-import any batch."
        spec={[
          {
            text: `${batches.length} batch${batches.length === 1 ? "" : "es"}`,
          },
          { text: `${totalPages} pages` },
        ]}
      />

      {state.kind === "loading" ? (
        <div className="border border-rule px-5 py-6 t-body text-fg-mute">
          Loading batches…
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="border border-rule px-5 py-6 t-body text-fg-mute">
          Failed to load batches: {state.message}
        </div>
      ) : null}

      {state.kind === "loaded" && batches.length === 0 ? (
        <div className="border border-rule px-5 py-6 flex flex-col gap-2">
          <span className="t-body text-fg">No batches yet.</span>
          <Link
            href="/"
            className="t-body text-[var(--accent)] hover:underline"
          >
            → Generate one
          </Link>
        </div>
      ) : null}

      {state.kind === "loaded" && batches.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionMarker
            index="001"
            label="Batches"
            tail={`${batches.length} total`}
          />
          <ul className="border border-rule list-none m-0 p-0">
            {batches.map((batch) => (
              <BatchRow
                key={batch.batchId}
                batch={batch}
                isImporting={importingId === batch.batchId}
                isDeleting={deletingId === batch.batchId}
                onImport={handleImport}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
