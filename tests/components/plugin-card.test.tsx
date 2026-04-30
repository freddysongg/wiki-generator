// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PluginCard, type PluginCardData } from "@/components/plugin-card";

const FIXTURE: PluginCardData = {
  name: "Dataview",
  href: "https://example.com/dataview",
  tagline: "Query the wiki like a database.",
  why: "Frontmatter is shaped so queries written today keep working tomorrow.",
  schemaFields: ["title", "tags"],
};

describe("PluginCard", () => {
  it("renders the link, tagline, why, and schema chips", () => {
    render(<PluginCard plugin={FIXTURE} />);
    const link = screen.getByRole("link", { name: /dataview/i });
    expect(link).toHaveAttribute("href", "https://example.com/dataview");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(screen.getByText(/like a database/i)).toBeInTheDocument();
    expect(screen.getByText(/keep working tomorrow/i)).toBeInTheDocument();
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("tags")).toBeInTheDocument();
  });

  it("hides the schema footer when no fields", () => {
    render(<PluginCard plugin={{ ...FIXTURE, schemaFields: [] }} />);
    expect(screen.queryByText(/Reads/i)).not.toBeInTheDocument();
  });
});
