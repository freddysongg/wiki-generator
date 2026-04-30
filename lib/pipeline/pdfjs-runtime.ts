import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

let isConfigured = false;

export function getPdfjs(): typeof pdfjsLib {
  if (!isConfigured) {
    const require = createRequire(path.join(process.cwd(), "package.json"));
    const workerPath =
      require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
    isConfigured = true;
  }
  return pdfjsLib;
}
