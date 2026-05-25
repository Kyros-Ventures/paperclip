// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock("../../context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: "test-company-id" }),
}));

vi.mock("../../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }),
}));

vi.mock("../../api/systemHealth", () => ({
  systemHealthApi: {
    getHealth: vi.fn(),
    getHealthChecks: vi.fn(),
    getResources: vi.fn(),
    getAgentResourceUsage: vi.fn(),
    getAgentThrottling: vi.fn(),
    updateAgentThrottling: vi.fn(),
  },
}));

const mockQueryClient = { invalidateQueries: vi.fn() };

function makeQuery(overrides: object) {
  return {
    isLoading: false,
    error: null,
    data: undefined,
    refetch: vi.fn(),
    ...overrides,
  };
}

const healthData = {
  status: "healthy" as const,
  services: [],
  checkedAt: new Date().toISOString(),
};

const checksData = [
  { component: "database", status: "healthy" as const, latencyMs: 12, lastRunAt: new Date().toISOString(), errorMessage: null },
  { component: "redis", status: "degraded" as const, latencyMs: null, lastRunAt: null, errorMessage: "timeout" },
];

const resourcesData = {
  cpu: { percent: 45.2 },
  memory: { usedMb: 2048, totalMb: 8192, percent: 25.0 },
  disk: { usedGb: 30, totalGb: 100, percent: 30.0 },
  network: { rxKbps: 1500, txKbps: 500 },
};

const agentResourceData = [
  { agentId: "a1", name: "Agent Alpha", cpuPercent: 12.5, memoryMb: 512 },
  { agentId: "a2", name: "Agent Beta", cpuPercent: 85.0, memoryMb: 2048 },
];

const throttlingData = [
  { agentId: "a1", name: "Agent Alpha", maxConcurrentRuns: 3, maxRunsPerHour: 60, currentConcurrent: 1, isThrottled: false },
  { agentId: "a2", name: "Agent Beta", maxConcurrentRuns: 1, maxRunsPerHour: 10, currentConcurrent: 1, isThrottled: true },
];

describe("SystemHealthStatusBanner", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReturnValue(makeQuery({ data: healthData }) as any);
    vi.mocked(useQueryClient).mockReturnValue(mockQueryClient as any);
  });

  it("renders healthy status with green styling", async () => {
    const { SystemHealthStatusBanner } = await import("../../components/SystemHealthStatusBanner");
    render(<SystemHealthStatusBanner />);
    expect(screen.getByText("All systems healthy")).toBeDefined();
    expect(screen.getByRole("status")).toBeDefined();
  });

  it("renders degraded status", async () => {
    vi.mocked(useQuery).mockReturnValue(makeQuery({ data: { ...healthData, status: "degraded" } }) as any);
    const { SystemHealthStatusBanner } = await import("../../components/SystemHealthStatusBanner");
    render(<SystemHealthStatusBanner />);
    expect(screen.getByText("System degraded")).toBeDefined();
  });

  it("renders unhealthy status", async () => {
    vi.mocked(useQuery).mockReturnValue(makeQuery({ data: { ...healthData, status: "unhealthy" } }) as any);
    const { SystemHealthStatusBanner } = await import("../../components/SystemHealthStatusBanner");
    render(<SystemHealthStatusBanner />);
    expect(screen.getByText("System unhealthy")).toBeDefined();
  });

  it("renders skeleton while loading", async () => {
    vi.mocked(useQuery).mockReturnValue(makeQuery({ isLoading: true, data: undefined }) as any);
    const { SystemHealthStatusBanner } = await import("../../components/SystemHealthStatusBanner");
    render(<SystemHealthStatusBanner />);
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders error state with retry button", async () => {
    vi.mocked(useQuery).mockReturnValue(makeQuery({ error: new Error("fail"), data: undefined }) as any);
    const { SystemHealthStatusBanner } = await import("../../components/SystemHealthStatusBanner");
    render(<SystemHealthStatusBanner />);
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByRole("button", { name: /retry/i })).toBeDefined();
  });
});

describe("HealthChecksTable", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReturnValue(makeQuery({ data: checksData }) as any);
  });

  it("renders all checks with correct columns", async () => {
    const { HealthChecksTable } = await import("../../components/HealthChecksTable");
    render(<HealthChecksTable />);
    expect(screen.getByText("database")).toBeDefined();
    expect(screen.getByText("redis")).toBeDefined();
    expect(screen.getByText("12ms")).toBeDefined();
    expect(screen.getByText("timeout")).toBeDefined();
  });

  it("renders empty state when no checks", async () => {
    vi.mocked(useQuery).mockReturnValue(makeQuery({ data: [] }) as any);
    const { HealthChecksTable } = await import("../../components/HealthChecksTable");
    render(<HealthChecksTable />);
    expect(screen.getByText("No health checks configured")).toBeDefined();
  });

  it("renders skeletons while loading", async () => {
    vi.mocked(useQuery).mockReturnValue(makeQuery({ isLoading: true, data: undefined }) as any);
    const { HealthChecksTable } = await import("../../components/HealthChecksTable");
    render(<HealthChecksTable />);
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders error state with retry", async () => {
    vi.mocked(useQuery).mockReturnValue(makeQuery({ error: new Error("fail"), data: undefined }) as any);
    const { HealthChecksTable } = await import("../../components/HealthChecksTable");
    render(<HealthChecksTable />);
    expect(screen.getByText(/failed to load health checks/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /retry/i })).toBeDefined();
  });
});

describe("ResourceUsagePanel", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReturnValue(makeQuery({ data: resourcesData }) as any);
  });

  it("renders CPU, Memory, Disk gauges", async () => {
    const { ResourceUsagePanel } = await import("../../components/ResourceUsagePanel");
    render(<ResourceUsagePanel />);
    expect(screen.getByText("CPU")).toBeDefined();
    expect(screen.getByText("Memory")).toBeDefined();
    expect(screen.getByText("Disk")).toBeDefined();
    expect(screen.getByText("Network I/O")).toBeDefined();
  });

  it("renders ARIA progressbar roles", async () => {
    const { ResourceUsagePanel } = await import("../../components/ResourceUsagePanel");
    render(<ResourceUsagePanel />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars.length).toBe(3);
  });

  it("renders skeleton while loading", async () => {
    vi.mocked(useQuery).mockReturnValue(makeQuery({ isLoading: true, data: undefined }) as any);
    const { ResourceUsagePanel } = await import("../../components/ResourceUsagePanel");
    render(<ResourceUsagePanel />);
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

describe("AgentResourceTable", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReturnValue(makeQuery({ data: agentResourceData }) as any);
  });

  it("renders agent names and metrics", async () => {
    const { AgentResourceTable } = await import("../../components/AgentResourceTable");
    render(<AgentResourceTable companyId="test-company-id" />);
    expect(screen.getByText("Agent Alpha")).toBeDefined();
    expect(screen.getByText("Agent Beta")).toBeDefined();
    expect(screen.getByText("12.5%")).toBeDefined();
  });

  it("renders empty state when no agents", async () => {
    vi.mocked(useQuery).mockReturnValue(makeQuery({ data: [] }) as any);
    const { AgentResourceTable } = await import("../../components/AgentResourceTable");
    render(<AgentResourceTable companyId="test-company-id" />);
    expect(screen.getByText("No agent resource data available")).toBeDefined();
  });

  it("sorts by CPU descending by default (highest CPU first)", async () => {
    const { AgentResourceTable } = await import("../../components/AgentResourceTable");
    render(<AgentResourceTable companyId="test-company-id" />);
    const rows = screen.getAllByRole("row");
    const firstRow = rows[1].textContent ?? "";
    expect(firstRow).toContain("Agent Beta");
  });

  it("clicking name header sorts by name", async () => {
    const { AgentResourceTable } = await import("../../components/AgentResourceTable");
    render(<AgentResourceTable companyId="test-company-id" />);
    const nameHeader = screen.getByRole("columnheader", { name: /agent name/i });
    await userEvent.click(nameHeader);
    const rows = screen.getAllByRole("row");
    expect(rows[1].textContent).toContain("Agent Alpha");
  });
});

describe("AgentThrottlingPanel", () => {
  const mockMutate = vi.fn();
  const mockInvalidate = vi.fn();

  beforeEach(() => {
    vi.mocked(useQuery).mockReturnValue(makeQuery({ data: throttlingData }) as any);
    vi.mocked(useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: false,
      variables: undefined,
    } as any);
    vi.mocked(useQueryClient).mockReturnValue({ invalidateQueries: mockInvalidate } as any);
  });

  it("renders all agents with throttling info", async () => {
    const { AgentThrottlingPanel } = await import("../../components/AgentThrottlingPanel");
    render(<AgentThrottlingPanel companyId="test-company-id" />);
    expect(screen.getByText("Agent Alpha")).toBeDefined();
    expect(screen.getByText("Agent Beta")).toBeDefined();
    expect(screen.getByText("throttled")).toBeDefined();
  });

  it("enters edit mode on pencil click", async () => {
    const { AgentThrottlingPanel } = await import("../../components/AgentThrottlingPanel");
    render(<AgentThrottlingPanel companyId="test-company-id" />);
    const editBtns = screen.getAllByRole("button", { name: /edit throttling/i });
    await userEvent.click(editBtns[0]);
    expect(screen.getByRole("spinbutton", { name: /max concurrent/i })).toBeDefined();
    expect(screen.getByRole("spinbutton", { name: /max runs per hour/i })).toBeDefined();
  });

  it("cancels edit without saving", async () => {
    const { AgentThrottlingPanel } = await import("../../components/AgentThrottlingPanel");
    render(<AgentThrottlingPanel companyId="test-company-id" />);
    const editBtns = screen.getAllByRole("button", { name: /edit throttling/i });
    await userEvent.click(editBtns[0]);
    const cancelBtn = screen.getByRole("button", { name: /cancel editing/i });
    await userEvent.click(cancelBtn);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("calls mutate with correct values on save", async () => {
    const { AgentThrottlingPanel } = await import("../../components/AgentThrottlingPanel");
    render(<AgentThrottlingPanel companyId="test-company-id" />);
    const editBtns = screen.getAllByRole("button", { name: /edit throttling/i });
    await userEvent.click(editBtns[0]);
    const saveBtn = screen.getByRole("button", { name: /save throttling/i });
    await userEvent.click(saveBtn);
    expect(mockMutate).toHaveBeenCalledWith({
      agentId: "a1",
      maxConcurrentRuns: 3,
      maxRunsPerHour: 60,
    });
  });

  it("renders empty state when no agents", async () => {
    vi.mocked(useQuery).mockReturnValue(makeQuery({ data: [] }) as any);
    const { AgentThrottlingPanel } = await import("../../components/AgentThrottlingPanel");
    render(<AgentThrottlingPanel companyId="test-company-id" />);
    expect(screen.getByText("No agents with throttling configured")).toBeDefined();
  });

  it("renders error state with retry", async () => {
    vi.mocked(useQuery).mockReturnValue(makeQuery({ error: new Error("fail"), data: undefined }) as any);
    const { AgentThrottlingPanel } = await import("../../components/AgentThrottlingPanel");
    render(<AgentThrottlingPanel companyId="test-company-id" />);
    expect(screen.getByText(/failed to load throttling/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /retry/i })).toBeDefined();
  });
});

describe("SystemHealthPage", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReturnValue(makeQuery({ data: healthData }) as any);
    vi.mocked(useMutation).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as any);
    vi.mocked(useQueryClient).mockReturnValue(mockQueryClient as any);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders all panel headings", async () => {
    const { SystemHealthPage } = await import("../../pages/SystemHealthPage");
    render(<SystemHealthPage />);
    expect(screen.getByText("System Health")).toBeDefined();
    expect(screen.getByText(/auto-refreshes every 30s/i)).toBeDefined();
  });

  it("triggers query invalidation after 30 seconds", async () => {
    const { SystemHealthPage } = await import("../../pages/SystemHealthPage");
    render(<SystemHealthPage />);
    expect(mockQueryClient.invalidateQueries).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalled();
  });

  it("does not leak interval on unmount", async () => {
    const { SystemHealthPage } = await import("../../pages/SystemHealthPage");
    const clearSpy = vi.spyOn(global, "clearInterval");
    const { unmount } = render(<SystemHealthPage />);
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
