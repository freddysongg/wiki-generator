"use client";

import type { BatchEvent } from "@/lib/types";

export interface SubscribeArgs {
  batchId: string;
  onEvent: (event: BatchEvent) => void;
  onError?: (err: unknown) => void;
}

export function subscribeToBatch({
  batchId,
  onEvent,
  onError,
}: SubscribeArgs): () => void {
  const source = new EventSource(`/api/events/${encodeURIComponent(batchId)}`);
  source.onmessage = (raw) => {
    try {
      const parsed = JSON.parse(raw.data) as BatchEvent;
      onEvent(parsed);
      if (parsed.type === "complete") source.close();
    } catch (err) {
      onError?.(err);
    }
  };
  source.onerror = (err) => {
    onError?.(err);
    source.close();
  };
  return () => source.close();
}
