import { getEventBus } from "@/lib/events/bus";
import type { BatchEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ batchId: string }> },
): Promise<Response> {
  const { batchId } = await ctx.params;
  const bus = getEventBus();
  const encoder = new TextEncoder();

  let isClosed = false;
  let cleanup: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let unsub: (() => void) | undefined;
      const send = (event: BatchEvent): void => {
        if (isClosed) return;
        try {
          const payload = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          isClosed = true;
          unsub?.();
          return;
        }
        if (event.type === "complete") {
          isClosed = true;
          controller.close();
          unsub?.();
        }
      };
      unsub = bus.subscribe(batchId, send);
      if (isClosed) unsub();
      cleanup = (): void => {
        isClosed = true;
        unsub?.();
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
