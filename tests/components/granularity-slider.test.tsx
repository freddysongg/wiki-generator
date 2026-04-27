// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GranularitySlider } from "@/components/granularity-slider";

describe("GranularitySlider", () => {
  it("renders three buttons and highlights the value", () => {
    render(<GranularitySlider value="medium" onChange={() => {}} />);
    const medium = screen.getByRole("button", { name: /medium/i });
    expect(medium.getAttribute("data-active")).toBe("true");
  });

  it("calls onChange when a button is clicked", () => {
    const onChange = vi.fn();
    render(<GranularitySlider value="medium" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /coarse/i }));
    expect(onChange).toHaveBeenCalledWith("coarse");
  });
});
