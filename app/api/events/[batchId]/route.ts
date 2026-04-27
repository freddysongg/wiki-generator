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

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: BatchEvent): void => {
        const payload = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(payload));
        if (event.type === "complete") {
          unsub();
          controller.close();
        }
      };
      const unsub = bus.subscribe(batchId, send);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
