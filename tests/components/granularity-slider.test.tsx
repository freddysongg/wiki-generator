// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GranularitySlider } from "@/components/granularity-slider";

describe("GranularitySlider", () => {
  it("renders four radios and marks the active value", () => {
    render(<GranularitySlider value="medium" onChange={() => {}} />);
    const medium = screen.getByRole("radio", { name: /medium/i });
    expect(medium.getAttribute("data-active")).toBe("true");
    expect(medium.getAttribute("aria-checked")).toBe("true");
    expect(
      screen
        .getByRole("radio", { name: /coarse/i })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(screen.getByRole("radio", { name: /auto/i })).toBeInTheDocument();
  });

  it("calls onChange when a radio is clicked", () => {
    const onChange = vi.fn();
    render(<GranularitySlider value="medium" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /coarse/i }));
    expect(onChange).toHaveBeenCalledWith("coarse");
  });

  it("can select auto", () => {
    const onChange = vi.fn();
    render(<GranularitySlider value="medium" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /auto/i }));
    expect(onChange).toHaveBeenCalledWith("auto");
  });

  it("shows the auto hint when auto is selected", () => {
    render(<GranularitySlider value="auto" onChange={() => {}} />);
    expect(screen.getByText(/model decides/i)).toBeInTheDocument();
  });
});
