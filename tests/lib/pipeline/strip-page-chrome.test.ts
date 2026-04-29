import { describe, it, expect } from "vitest";
import { stripPageChrome } from "@/lib/pipeline/strip-page-chrome";

describe("stripPageChrome", () => {
  it("strips frontmatter, leading title heading, and trailing source line", () => {
    const raw = [
      "---",
      'title: "Backpropagation"',
      'source: "alpha.pdf"',
      "---",
      "",
      "# Backpropagation",
      "",
      "Body line one.",
      "",
      "## Subhead",
      "",
      "Body line two.",
      "",
      "---",
      "*Source: alpha.pdf, pp. 14-22*",
      "",
    ].join("\n");

    expect(stripPageChrome(raw)).toBe(
      ["Body line one.", "", "## Subhead", "", "Body line two."].join("\n"),
    );
  });

  it("handles missing trailing source line", () => {
    const raw = ["---", 'title: "X"', "---", "", "# X", "", "Body.", ""].join(
      "\n",
    );
    expect(stripPageChrome(raw)).toBe("Body.");
  });

  it("handles missing leading heading", () => {
    const raw = [
      "---",
      'title: "X"',
      "---",
      "",
      "Just a body, no heading.",
      "",
    ].join("\n");
    expect(stripPageChrome(raw)).toBe("Just a body, no heading.");
  });

  it("handles input with no frontmatter at all", () => {
    const raw = "# X\n\nBody only.\n";
    expect(stripPageChrome(raw)).toBe("Body only.");
  });

  it("preserves internal --- horizontal rules in body", () => {
    const raw = [
      "---",
      'title: "X"',
      "---",
      "",
      "# X",
      "",
      "Before rule.",
      "",
      "---",
      "",
      "After rule.",
      "",
    ].join("\n");
    expect(stripPageChrome(raw)).toBe(
      ["Before rule.", "", "---", "", "After rule."].join("\n"),
    );
  });
});
