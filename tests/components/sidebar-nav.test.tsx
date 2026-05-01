// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SidebarNav } from "@/components/sidebar-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

describe("SidebarNav", () => {
  it("renders the three nav items without 'soon' badges", () => {
    render(<SidebarNav />);
    expect(screen.getByRole("link", { name: /generate/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /graph/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /history/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /plugins/i })).toBeNull();
    expect(screen.queryByText(/soon/i)).not.toBeInTheDocument();
  });

  it("marks the active link", () => {
    render(<SidebarNav />);
    const generate = screen.getByRole("link", { name: /generate/i });
    expect(generate.getAttribute("aria-current")).toBe("page");
  });
});
