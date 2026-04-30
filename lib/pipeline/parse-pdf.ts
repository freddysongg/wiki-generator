import { getPdfjs } from "@/lib/pipeline/pdfjs-runtime";

export interface ParsedPage {
  pageNumber: number;
  text: string;
  kind: "text" | "image";
}

export interface ParseOptions {
  textThreshold?: number;
}

const DEFAULT_TEXT_THRESHOLD = 100;

export async function parsePdf(
  data: Uint8Array,
  opts: ParseOptions = {},
): Promise<ParsedPage[]> {
  const threshold = opts.textThreshold ?? DEFAULT_TEXT_THRESHOLD;
  const pdfjsLib = getPdfjs();

  const loadingTask = pdfjsLib.getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;

  const out: ParsedPage[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item: unknown) =>
          typeof item === "object" && item !== null && "str" in item
            ? String((item as { str: unknown }).str)
            : "",
        )
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      out.push({
        pageNumber: i,
        text,
        kind: text.length >= threshold ? "text" : "image",
      });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return out;
}
