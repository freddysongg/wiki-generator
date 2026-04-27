// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UploadZone } from "@/components/upload-zone";

describe("UploadZone", () => {
  it("calls onFiles when input changes with PDFs", () => {
    const onFiles = vi.fn();
    render(<UploadZone onFiles={onFiles} disabled={false} />);
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText(/drop pdfs here/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0]).toHaveLength(1);
  });

  it("ignores non-pdf files", () => {
    const onFiles = vi.fn();
    render(<UploadZone onFiles={onFiles} disabled={false} />);
    const file = new File(["x"], "image.png", { type: "image/png" });
    const input = screen.getByLabelText(/drop pdfs here/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([]);
  });
});
