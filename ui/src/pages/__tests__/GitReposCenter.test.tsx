// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { GitReposCenter } from "../GitReposCenter";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

vi.mock("../../context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: "test-company-id" }),
}));

vi.mock("../../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }),
}));

vi.mock("../../context/ToastContext", () => ({
  useToastActions: () => ({ addToast: vi.fn() }),
}));

describe("GitReposCenter", () => {
  it("renders loading skeleton while data loads", () => {
    vi.mocked(useQuery).mockReturnValue({ isLoading: true, data: undefined, error: null } as never);
    render(<GitReposCenter />);
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders empty state when no repos", () => {
    vi.mocked(useQuery).mockReturnValue({ isLoading: false, data: [], error: null } as never);
    render(<GitReposCenter />);
    expect(screen.getByText(/no repositories found/i)).toBeDefined();
  });

  it("renders repo cards when data exists", () => {
    vi.mocked(useQuery).mockReturnValue({
      isLoading: false,
      data: [
        {
          id: "test-1",
          name: "paperclip",
          path: "/Users/parth/Documents/Github/paperclip",
          branch: "main",
          branches: ["main", "feat/test"],
          lastCommit: {
            hash: "abc123def456",
            message: "feat: add git repos page",
            author: "Parth",
            date: "2026-05-25T10:00:00Z",
          },
          status: {
            clean: true,
            ahead: 0,
            behind: 0,
            modified: [],
            untracked: [],
            staged: [],
          },
          isDirty: false,
        },
      ],
      error: null,
    } as never);
    render(<GitReposCenter />);
    expect(screen.getByText("paperclip")).toBeDefined();
    expect(screen.getByText("main")).toBeDefined();
  });

  it("renders dirty status badge for unclean repos", () => {
    vi.mocked(useQuery).mockReturnValue({
      isLoading: false,
      data: [
        {
          id: "test-2",
          name: "dirty-repo",
          path: "/tmp/test",
          branch: "main",
          branches: ["main"],
          lastCommit: null,
          status: {
            clean: false,
            ahead: 1,
            behind: 2,
            modified: ["src/index.ts"],
            untracked: ["new-file.txt"],
            staged: [],
          },
          isDirty: true,
        },
      ],
      error: null,
    } as never);
    render(<GitReposCenter />);
    expect(screen.getByText("Dirty")).toBeDefined();
    expect(screen.getByText("dirty-repo")).toBeDefined();
  });

  it("shows error state on fetch failure", () => {
    vi.mocked(useQuery).mockReturnValue({
      isLoading: false,
      data: undefined,
      error: new Error("Network error"),
    } as never);
    render(<GitReposCenter />);
    expect(screen.getByText("Network error")).toBeDefined();
  });
});
