// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { JarvisIntegrationStatus } from "../JarvisIntegrationStatus";

vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn() }));

vi.mock("../../context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: "test-company-id" }),
}));

vi.mock("../../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }),
}));

describe("JarvisIntegrationStatus", () => {
  it("renders loading skeleton while data loads", () => {
    vi.mocked(useQuery).mockReturnValue({
      isLoading: true,
      data: undefined,
      error: null,
      dataUpdatedAt: 0,
    } as any);
    render(<JarvisIntegrationStatus />);
    // PageSkeleton renders skeletons with data-slot="skeleton"
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders healthy state with configured secret", () => {
    vi.mocked(useQuery).mockReturnValue({
      isLoading: false,
      data: {
        status: "ok",
        secretConfigured: true,
        timestamp: "2026-05-24T06:30:00.000Z",
      },
      error: null,
      dataUpdatedAt: Date.now(),
    } as any);
    render(<JarvisIntegrationStatus />);
    expect(screen.getByText("Online")).toBeDefined();
    expect(screen.getByText("Configured")).toBeDefined();
    expect(screen.getByText("Operational")).toBeDefined();
  });

  it("renders degraded state when health is not ok", () => {
    vi.mocked(useQuery).mockReturnValue({
      isLoading: false,
      data: {
        status: "error",
        secretConfigured: false,
        timestamp: "2026-05-24T06:30:00.000Z",
      },
      error: null,
      dataUpdatedAt: Date.now(),
    } as any);
    render(<JarvisIntegrationStatus />);
    expect(screen.getByText("Degraded")).toBeDefined();
    expect(screen.getByText("Not Configured")).toBeDefined();
    expect(screen.getByText("Needs Attention")).toBeDefined();
  });

  it("renders error state on fetch failure", () => {
    vi.mocked(useQuery).mockReturnValue({
      isLoading: false,
      data: undefined,
      error: new Error("Network error"),
      dataUpdatedAt: 0,
    } as any);
    render(<JarvisIntegrationStatus />);
    expect(screen.getByText("Network error")).toBeDefined();
  });

  it("shows API endpoint reference section", () => {
    vi.mocked(useQuery).mockReturnValue({
      isLoading: false,
      data: {
        status: "ok",
        secretConfigured: true,
        timestamp: "2026-05-24T06:30:00.000Z",
      },
      error: null,
      dataUpdatedAt: Date.now(),
    } as any);
    render(<JarvisIntegrationStatus />);
    expect(screen.getAllByText("/api/jarvis/health").length).toBeGreaterThan(0);
    expect(screen.getByText("/api/jarvis/webhook")).toBeDefined();
  });
});
