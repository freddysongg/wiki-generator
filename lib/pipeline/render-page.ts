import { createCanvas, type Canvas } from "canvas";
import { getPdfjs } from "@/lib/pipeline/pdfjs-runtime";

export interface RenderOptions {
  maxWidth?: number;
}

const DEFAULT_MAX_WIDTH = 2048;
const FALLBACK_SCALE = 2;

interface CanvasAndContext {
  canvas: Canvas | null;
  context: ReturnType<Canvas["getContext"]> | null;
}

class NodeCanvasFactory {
  create(width: number, height: number): CanvasAndContext {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(target: CanvasAndContext, width: number, height: number): void {
    if (!target.canvas) return;
    target.canvas.width = width;
    target.canvas.height = height;
  }
  destroy(target: CanvasAndContext): void {
    if (target.canvas) {
      target.canvas.width = 0;
      target.canvas.height = 0;
    }
    target.canvas = null;
    target.context = null;
  }
}

export async function renderPdfPageToPng(
  data: Uint8Array,
  pageNumber: number,
  opts: RenderOptions = {},
): Promise<Uint8Array> {
  const maxWidth = opts.maxWidth ?? DEFAULT_MAX_WIDTH;
  const pdfjsLib = getPdfjs();
  const canvasFactory = new NodeCanvasFactory();
  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    ...({ canvasFactory } as Record<string, unknown>),
  });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale =
      baseViewport.width >= maxWidth
        ? maxWidth / baseViewport.width
        : FALLBACK_SCALE;
    const viewport = page.getViewport({ scale });
    const target = canvasFactory.create(viewport.width, viewport.height);
    try {
      await page.render({
        viewport,
        ...({ canvasContext: target.context } as Record<string, unknown>),
      } as Parameters<typeof page.render>[0]).promise;
      page.cleanup();
      const pngBuffer = target.canvas!.toBuffer("image/png");
      return new Uint8Array(pngBuffer);
    } finally {
      canvasFactory.destroy(target);
    }
  } finally {
    await doc.destroy();
  }
}
