import { describe, it, expect } from "vitest";
import { validateWikilinks } from "@/lib/pipeline/wikilink-validator";

describe("validateWikilinks", () => {
  const known = new Set(["Backpropagation", "Gradient Descent"]);

  it("keeps known links intact", () => {
    const md = "See [[Backpropagation]] and [[Gradient Descent]].";
    expect(validateWikilinks(md, known)).toBe("See [[Backpropagation]] and [[Gradient Descent]].");
  });

  it("strips brackets from unknown links", () => {
    const md = "See [[Quantum Foo]].";
    expect(validateWikilinks(md, known)).toBe("See Quantum Foo.");
  });

  it("supports alias syntax [[Target|Display]] and resolves on Target", () => {
    const md = "See [[Backpropagation|backprop]] for details.";
    expect(validateWikilinks(md, known)).toBe("See [[Backpropagation|backprop]] for details.");
  });

  it("strips alias links if Target is unknown, keeps display text", () => {
    const md = "See [[Unknown|something]].";
    expect(validateWikilinks(md, known)).toBe("See something.");
  });

  it("handles multiple links in one line", () => {
    const md = "[[Backpropagation]] vs [[Unknown]] vs [[Gradient Descent]].";
    expect(validateWikilinks(md, known)).toBe(
      "[[Backpropagation]] vs Unknown vs [[Gradient Descent]].",
    );
  });
});
