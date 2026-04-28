"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type JSX,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { PdfStatus } from "@/lib/types";

export type BatchStage = "idle" | "queued" | "processing" | "complete";

export interface BatchTotals {
  pages: number;
  links: number;
  failed: number;
}

export interface BatchSnapshot {
  stage: BatchStage;
  fileCount: number;
  statuses: PdfStatus[];
  totals: BatchTotals | null;
}

interface BatchContextValue {
  snapshot: BatchSnapshot;
  setSnapshot: Dispatch<SetStateAction<BatchSnapshot>>;
}

const INITIAL: BatchSnapshot = {
  stage: "idle",
  fileCount: 0,
  statuses: [],
  totals: null,
};

const BatchContext = createContext<BatchContextValue | null>(null);

export function BatchProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [snapshot, setSnapshot] = useState<BatchSnapshot>(INITIAL);
  const value = useMemo<BatchContextValue>(
    () => ({ snapshot, setSnapshot }),
    [snapshot],
  );
  return (
    <BatchContext.Provider value={value}>{children}</BatchContext.Provider>
  );
}

export function useBatch(): BatchContextValue {
  const ctx = useContext(BatchContext);
  if (!ctx) {
    throw new Error("useBatch must be used inside <BatchProvider>");
  }
  return ctx;
}
