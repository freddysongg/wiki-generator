import { describe, it, expect } from "vitest";
import { titleToFilename } from "@/lib/slugify";

describe("titleToFilename", () => {
  it("preserves case and most punctuation", () => {
    expect(titleToFilename("Stochastic Gradient Descent")).toBe("Stochastic Gradient Descent.md");
  });

  it("replaces filesystem-unsafe characters", () => {
    expect(titleToFilename("Either/Or")).toBe("Either-Or.md");
    expect(titleToFilename("A:B")).toBe("A-B.md");
    expect(titleToFilename("foo*bar")).toBe("foo-bar.md");
    expect(titleToFilename("a?b")).toBe("a-b.md");
    expect(titleToFilename("a|b")).toBe("a-b.md");
    expect(titleToFilename("a\\b")).toBe("a-b.md");
    expect(titleToFilename("a<b>")).toBe("a-b.md");
    expect(titleToFilename("a\"b")).toBe("a-b.md");
  });

  it("trims leading/trailing whitespace and dots", () => {
    expect(titleToFilename("  Hello  ")).toBe("Hello.md");
    expect(titleToFilename(".dotted.")).toBe("dotted.md");
  });

  it("handles non-Latin scripts unchanged", () => {
    expect(titleToFilename("注意机制")).toBe("注意机制.md");
    expect(titleToFilename("Différences finies")).toBe("Différences finies.md");
  });

  it("collapses runs of dashes", () => {
    expect(titleToFilename("a // b")).toBe("a - b.md");
  });

  it("falls back to 'Untitled' on empty input", () => {
    expect(titleToFilename("")).toBe("Untitled.md");
    expect(titleToFilename("???")).toBe("Untitled.md");
  });
});
