"use client";

import { useCallback, useEffect, useState } from "react";
import AdminNav from "@/components/AdminNav";
import { apiGet } from "@/lib/api-client";

type HealthStatus = {
  status: "healthy" | "degraded" | "unhealthy";
  apiLatencyMs: number;
  errorRate: number;
  requestCount: number;
  requestsPerMinute: number;
  nodeStatus: "up" | "down";
  uptimeSeconds: number;
  nodes: Array<{
    nodeId: string;
    status: "up" | "down";
    lastSeenAt: string;
  }>;
  timestamp: string;
};

type TelemetryMetric = {
  id: string;
  metricType:
    | "API_LATENCY"
    | "API_LOAD"
    | "NODE_STATUS"
    | "RESPONSE_TIME"
    | "ERROR_RATE"
    | "DB_QUERY_TIME";
  service: string;
  value: number | string;
  unit: string | null;
  tags: Record<string, string> | null;
  createdAt: string;
};

const REFRESH_INTERVAL_MS = 15_000;

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`;
}

function statusStyle(status: string): string {
  if (status === "healthy" || status === "up") {
    return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  }
  if (status === "degraded") {
    return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  }
  return "bg-red-500/15 text-red-300 border-red-500/30";
}

export default function AdminTelemetryPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [metrics, setMetrics] = useState<TelemetryMetric[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    const [healthResult, metricsResult] = await Promise.allSettled([
      apiGet<HealthStatus>("/telemetry/health"),
      apiGet<TelemetryMetric[]>("/telemetry/status?hoursBack=1"),
    ]);

    const failures: string[] = [];
    if (healthResult.status === "fulfilled") {
      setHealth(healthResult.value);
    } else {
      failures.push("system health");
    }
    if (metricsResult.status === "fulfilled") {
      setMetrics(metricsResult.value);
    } else {
      failures.push("telemetry samples");
    }
    setError(
      failures.length
        ? `Unable to refresh ${failures.join(" and ")}. The last successful readings are still shown.`
        : null,
    );
    setUpdatedAt(new Date());
  }, []);

  useEffect(() => {
    void refresh();
    const intervalId = window.setInterval(
      () => void refresh(),
      REFRESH_INTERVAL_MS,
    );
    return () => window.clearInterval(intervalId);
  }, [refresh]);

  const latencySamples = (metrics ?? [])
    .filter((metric) => metric.metricType === "API_LATENCY")
    .slice(0, 30)
    .reverse();
  const maxLatency = Math.max(
    1,
    ...latencySamples.map((metric) => Number(metric.value)),
  );
  const requestCount = health?.requestCount ?? 0;
  const nodes = health?.nodes ?? [];

  return (
    <main className="min-h-screen bg-[#060609] px-4 pb-16 pt-24 text-white">
      <div className="mx-auto max-w-6xl">
        <AdminNav />
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-3xl font-extrabold text-transparent">
              Platform Health
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Live service status, API load, response latency, and process
              uptime.
            </p>
          </div>
          <p className="text-xs text-gray-500" aria-live="polite">
            {updatedAt
              ? `Last updated ${updatedAt.toLocaleTimeString()} · refreshes every 15 seconds`
              : "Loading telemetry…"}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-300"
          >
            {error}
          </div>
        )}

        {!health && !metrics ? (
          <div
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            aria-label="Loading telemetry"
          >
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/5"
              />
            ))}
          </div>
        ) : (
          <>
            <section
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              aria-label="Platform summary"
            >
              <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="text-xs uppercase tracking-wider text-gray-500">
                  Platform status
                </h2>
                <p className="mt-3">
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold capitalize ${statusStyle(health?.status ?? "unhealthy")}`}
                  >
                    {health?.status ?? "Unavailable"}
                  </span>
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="text-xs uppercase tracking-wider text-gray-500">
                  Response latency
                </h2>
                <p className="mt-3 text-2xl font-bold">
                  {health?.apiLatencyMs ?? "—"}
                  <span className="ml-1 text-sm font-normal text-gray-400">
                    ms avg · 5 min
                  </span>
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="text-xs uppercase tracking-wider text-gray-500">
                  API load
                </h2>
                <p className="mt-3 text-2xl font-bold">
                  {requestCount}
                  <span className="ml-1 text-sm font-normal text-gray-400">
                    requests · 5 min
                  </span>
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {health?.requestsPerMinute ?? 0} requests/min
                </p>
              </article>
              <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h2 className="text-xs uppercase tracking-wider text-gray-500">
                  Process uptime
                </h2>
                <p className="mt-3 text-2xl font-bold">
                  {health ? formatUptime(health.uptimeSeconds) : "—"}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Server error rate: {health?.errorRate ?? "—"}%
                </p>
              </article>
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-2">
              <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">API response latency</h2>
                    <p className="mt-1 text-xs text-gray-500">
                      Latest request samples · milliseconds
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">
                    {latencySamples.length} samples
                  </span>
                </div>
                {latencySamples.length ? (
                  <div
                    className="flex h-40 items-end gap-1"
                    role="img"
                    aria-label="Recent API latency samples in milliseconds"
                  >
                    {latencySamples.map((metric) => {
                      const latency = Number(metric.value);
                      const height = Math.max(4, (latency / maxLatency) * 100);
                      return (
                        <div
                          key={metric.id}
                          title={`${latency.toFixed(1)} ms · ${new Date(metric.createdAt).toLocaleTimeString()}`}
                          className="min-w-1 flex-1 rounded-t bg-gradient-to-t from-blue-600 to-cyan-300"
                          style={{ height: `${height}%` }}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="py-12 text-center text-sm text-gray-500">
                    No API latency samples in the selected hour.
                  </p>
                )}
              </article>

              <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">Node status</h2>
                    <p className="mt-1 text-xs text-gray-500">
                      Heartbeat received at least once per minute
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase ${statusStyle(health?.nodeStatus ?? "down")}`}
                  >
                    {health?.nodeStatus ?? "unknown"}
                  </span>
                </div>
                {nodes.length ? (
                  <ul className="space-y-3">
                    {nodes.map((node) => (
                      <li
                        key={node.nodeId}
                        className="flex items-center justify-between gap-3 border-t border-white/10 pt-3"
                      >
                        <span className="truncate font-mono text-sm text-gray-300">
                          {node.nodeId}
                        </span>
                        <span className="shrink-0 text-right">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium uppercase ${statusStyle(node.status)}`}
                          >
                            {node.status}
                          </span>
                          <span className="mt-1 block text-xs text-gray-500">
                            Seen{" "}
                            {new Date(node.lastSeenAt).toLocaleTimeString()}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-8 text-center text-sm text-gray-500">
                    No recent node heartbeat detected.
                  </p>
                )}
              </article>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
