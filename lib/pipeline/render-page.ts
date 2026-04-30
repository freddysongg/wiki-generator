import { createCanvas } from "canvas";
import { getPdfjs } from "@/lib/pipeline/pdfjs-runtime";

export interface RenderOptions {
  maxWidth?: number;
}

const DEFAULT_MAX_WIDTH = 2048;
const FALLBACK_SCALE = 2;

export async function renderPdfPageToPng(
  data: Uint8Array,
  pageNumber: number,
  opts: RenderOptions = {},
): Promise<Uint8Array> {
  const maxWidth = opts.maxWidth ?? DEFAULT_MAX_WIDTH;
  const pdfjsLib = getPdfjs();
  const loadingTask = pdfjsLib.getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale =
      baseViewport.width >= maxWidth
        ? maxWidth / baseViewport.width
        : FALLBACK_SCALE;
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(viewport.width, viewport.height);
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      viewport,
    }).promise;
    page.cleanup();
    return canvas.toBuffer("image/png");
  } finally {
    await doc.destroy();
  }
}
