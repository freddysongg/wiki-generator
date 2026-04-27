import type { BatchEvent } from "@/lib/types";

type Listener = (event: BatchEvent) => void;

export class EventBus {
  private listeners: Map<string, Set<Listener>> = new Map();
  private buffers: Map<string, BatchEvent[]> = new Map();

  publish(event: BatchEvent): void {
    const listeners = this.listeners.get(event.batchId);
    if (listeners && listeners.size > 0) {
      for (const l of listeners) {
        try {
          l(event);
        } catch (err) {
          console.error("[event-bus] listener threw:", err);
        }
      }
      return;
    }
    const buf = this.buffers.get(event.batchId) ?? [];
    buf.push(event);
    this.buffers.set(event.batchId, buf);
  }

  subscribe(batchId: string, listener: Listener): () => void {
    const existing = this.listeners.get(batchId) ?? new Set<Listener>();
    existing.add(listener);
    this.listeners.set(batchId, existing);

    const buffered = this.buffers.get(batchId);
    if (buffered) {
      for (const e of buffered) listener(e);
      this.buffers.delete(batchId);
    }

    return () => {
      const set = this.listeners.get(batchId);
      if (!set) return;
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(batchId);
    };
  }

  clear(batchId: string): void {
    this.listeners.delete(batchId);
    this.buffers.delete(batchId);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __wikiEventBus: EventBus | undefined;
}

export function getEventBus(): EventBus {
  if (!globalThis.__wikiEventBus) {
    globalThis.__wikiEventBus = new EventBus();
  }
  return globalThis.__wikiEventBus;
}
