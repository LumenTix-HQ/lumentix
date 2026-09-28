"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  apiClient,
  GateThroughputStats,
  ScanMetricData,
  StaffingRecommendation,
} from "@/lib/api-client";

interface ScanVelocityDashboardProps {
  eventId: string;
  token?: string;
}

export function ScanVelocityDashboard({ eventId, token }: ScanVelocityDashboardProps) {
  const [selectedGate, setSelectedGate] = useState<string>("all");
  const [velocity, setVelocity] = useState<number>(0);
  const [throughput, setThroughput] = useState<GateThroughputStats | null>(null);
  const [realtimeMetrics, setRealtimeMetrics] = useState<ScanMetricData[]>([]);
  const [recommendation, setRecommendation] = useState<StaffingRecommendation | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<number>(5000);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const gateArg = selectedGate === "all" ? undefined : selectedGate;

      const [velocityData, throughputData, speedData, staffingData] = await Promise.allSettled([
        apiClient.calculate_scan_velocity(eventId, gateArg, token),
        apiClient.track_gate_throughput(eventId, gateArg, token),
        apiClient.fetch_realtime_scan_speed(eventId, gateArg, 15, token),
        apiClient.get_staffing_recommendation(eventId, gateArg, token),
      ]);

      if (velocityData.status === "fulfilled") {
        setVelocity(velocityData.value.scansPerMinute);
      }
      if (throughputData.status === "fulfilled") {
        setThroughput(throughputData.value);
      }
      if (speedData.status === "fulfilled") {
        setRealtimeMetrics(speedData.value);
      }
      if (staffingData.status === "fulfilled") {
        setRecommendation(staffingData.value);
      }

      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scan velocity statistics");
    } finally {
      setIsLoading(false);
    }
  }, [eventId, selectedGate, token]);

  useEffect(() => {
    void loadData();
    if (isPaused) return;

    const timer = setInterval(() => {
      void loadData();
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [loadData, refreshInterval, isPaused]);

  const gates = Array.from(
    new Set(
      realtimeMetrics
        .map((m) => m.gateId)
        .filter((g): g is string => Boolean(g)),
    ),
  );

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "critical":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      case "congested":
        return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "optimal":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      default:
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 backdrop-blur p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>⚡ Check-In Queue Velocity & Scan Rates</span>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          </h2>
          <p className="text-xs text-slate-400">
            Realtime entry telemetry for gate managers & staffing optimization. Last updated:{" "}
            {lastUpdated.toLocaleTimeString()}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedGate}
            onChange={(e) => setSelectedGate(e.target.value)}
            className="bg-slate-800 text-white text-xs border border-slate-700 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="all">All Gates (Aggregate)</option>
            {gates.map((g) => (
              <option key={g} value={g}>
                Gate: {g}
              </option>
            ))}
          </select>

          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="bg-slate-800 text-white text-xs border border-slate-700 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value={3000}>Refresh: 3s</option>
            <option value={5000}>Refresh: 5s</option>
            <option value={15000}>Refresh: 15s</option>
          </select>

          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              isPaused
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30"
                : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
            }`}
          >
            {isPaused ? "▶ Resume" : "⏸ Pause"}
          </button>

          <button
            onClick={() => void loadData()}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white transition-colors"
          >
            🔄 Refresh Now
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-800 text-red-200 text-sm rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-xl">
          <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
            <span>Entry Velocity</span>
            <span className="font-mono text-purple-400">calculate_scan_velocity</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{velocity}</span>
            <span className="text-sm font-medium text-slate-400">scans / min</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Rolling 60s throughput across {selectedGate === "all" ? "all active gates" : `Gate ${selectedGate}`}
          </p>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-xl">
          <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
            <span>Scanner Latency</span>
            <span className="font-mono text-cyan-400">avg_scan_time</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">
              {throughput ? throughput.avgScanTimeMs : 0}
            </span>
            <span className="text-sm font-medium text-slate-400">ms</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Average time per ticket validation (target &lt; 500ms)
          </p>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-xl">
          <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
            <span>Scan Accuracy</span>
            <span className="font-mono text-emerald-400">track_gate_throughput</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">
              {throughput ? `${(100 - throughput.errorRate).toFixed(1)}%` : "100%"}
            </span>
            <span className="text-xs text-slate-400">
              ({throughput ? throughput.failedScans : 0} failed / {throughput ? throughput.totalScans : 0} total)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Rejection rate: {throughput ? throughput.errorRate : 0}% in 5m window
          </p>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-xl">
          <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
            <span>Staffing Guidance</span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getStatusColor(
                recommendation?.queueStatus,
              )}`}
            >
              {recommendation?.queueStatus ?? "Optimal"}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">
              {recommendation ? recommendation.recommendedGates : 1}
            </span>
            <span className="text-sm font-medium text-slate-400">gates / lanes</span>
          </div>
          <p className="text-xs text-slate-300 mt-2 line-clamp-2">
            {recommendation?.recommendationText ?? "Operating normally."}
          </p>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h3 className="font-semibold text-white text-sm">
            📈 Realtime Gate Speed Metrics (fetch_realtime_scan_speed)
          </h3>
          <span className="text-xs text-slate-400">Recent 15-minute telemetry windows</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/50 text-slate-400 uppercase font-mono text-[11px] border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Gate</th>
                <th className="px-4 py-3">Velocity (Scans/Min)</th>
                <th className="px-4 py-3">Avg Latency</th>
                <th className="px-4 py-3">Batch Window</th>
                <th className="px-4 py-3">Error Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {realtimeMetrics.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    {isLoading ? "Loading telemetry..." : "No scan metrics recorded yet for this window."}
                  </td>
                </tr>
              ) : (
                realtimeMetrics.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-slate-400">
                      {new Date(m.recordedAt).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-white">
                      {m.gateId ?? "Default"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5 font-bold text-purple-300">
                        ⚡ {m.scansPerMinute}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-300">{Number(m.avgScanTimeMs).toFixed(0)} ms</td>
                    <td className="px-4 py-2.5 text-slate-400">
                      {m.totalScansInWindow - m.failedScans} ok / {m.failedScans} err
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          m.errorRate > 10
                            ? "bg-red-500/20 text-red-300"
                            : m.errorRate > 0
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-emerald-500/20 text-emerald-300"
                        }`}
                      >
                        {Number(m.errorRate).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <Link
          href={`/organizer/events/${eventId}/kiosk`}
          className="inline-flex items-center gap-2 text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors"
        >
          <span>📱 Open Gate Staff Kiosk Scanner</span>
          <span>→</span>
        </Link>
        <Link
          href={`/events/${eventId}/analytics`}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <span>📊 View Full Event Analytics Dashboard</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
