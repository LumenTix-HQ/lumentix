import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { apiGet } from "@/lib/api-client";
import AdminTelemetryPage from "@/app/admin/telemetry/page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/telemetry",
}));

vi.mock("@/lib/api-client", () => ({
  apiGet: vi.fn(),
}));

describe("AdminTelemetryPage", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockImplementation(async (path) => {
      if (path === "/telemetry/health") {
        return {
          status: "healthy",
          apiLatencyMs: 125,
          errorRate: 1.5,
          requestCount: 45,
          requestsPerMinute: 9,
          nodeStatus: "up",
          uptimeSeconds: 3661,
          nodes: [
            {
              nodeId: "api-node-1",
              status: "up",
              lastSeenAt: new Date().toISOString(),
            },
          ],
          timestamp: new Date().toISOString(),
        } as never;
      }

      return [
        {
          id: "metric-1",
          metricType: "API_LATENCY",
          service: "api",
          value: 125,
          unit: "ms",
          tags: null,
          createdAt: new Date().toISOString(),
        },
      ] as never;
    });
  });

  it("displays live latency, API load, uptime, and node status", async () => {
    render(<AdminTelemetryPage />);

    expect(await screen.findByText("Platform status")).toBeInTheDocument();
    expect(screen.getByText("healthy")).toBeInTheDocument();
    expect(screen.getByText("125")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText("1h 1m")).toBeInTheDocument();
    expect(screen.getByText("api-node-1")).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/telemetry/status?hoursBack=1");
  });
});
