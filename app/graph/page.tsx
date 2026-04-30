"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHero } from "@/components/page-hero";
import { SectionMarker } from "@/components/section-marker";
import { BatchPicker } from "@/components/batch-picker";
import { GraphPreview } from "@/components/graph-preview";
import type { BatchSummary } from "@/lib/types";

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; batches: BatchSummary[] }
  | { kind: "error"; message: string };

const GRAPH_PAGE_HEIGHT_PX = 620;

export default function GraphPage(): JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="border border-rule px-5 py-6 t-body text-fg-mute">
          Loading…
        </div>
      }
    >
      <GraphPageContent />
    </Suspense>
  );
}

function GraphPageContent(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryBatchId: string | null = searchParams.get("batch");

  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(
    queryBatchId,
  );

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

  useEffect(() => {
    if (state.kind !== "loaded") return;
    if (selectedBatchId) return;
    if (state.batches.length === 0) return;
    setSelectedBatchId(state.batches[0].batchId);
  }, [state, selectedBatchId]);

  useEffect(() => {
    if (!selectedBatchId) return;
    if (queryBatchId === selectedBatchId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("batch", selectedBatchId);
    router.replace(`/graph?${params.toString()}`, { scroll: false });
  }, [selectedBatchId, queryBatchId, router, searchParams]);

  const handleSelect = useCallback((batchId: string): void => {
    setSelectedBatchId(batchId);
  }, []);

  const batches = state.kind === "loaded" ? state.batches : [];
  const totalBatches = batches.length;
  const totalPages = useMemo(
    () => batches.reduce((sum, batch) => sum + batch.pageCount, 0),
    [batches],
  );

  return (
    <>
      <PageHero
        eyebrow="View 02"
        headline="Graph."
        description="Force-directed view of every concept and its cross-references. Pick a batch to inspect its link structure."
        spec={[
          { text: `${totalBatches} batch${totalBatches === 1 ? "" : "es"}` },
          { text: `${totalPages} pages total` },
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
        <>
          <section className="flex flex-col gap-3">
            <SectionMarker
              index="001"
              label="Batch"
              tail={`${batches.length} available`}
            />
            <BatchPicker
              batches={batches}
              selectedBatchId={selectedBatchId}
              onSelect={handleSelect}
            />
          </section>

          {selectedBatchId ? (
            <section className="flex flex-col gap-3">
              <SectionMarker index="002" label="Graph" tail="Force-directed" />
              <GraphPreview
                batchId={selectedBatchId}
                height={GRAPH_PAGE_HEIGHT_PX}
              />
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}
