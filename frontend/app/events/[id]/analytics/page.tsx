"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { AnalyticsDashboard } from "@/types/analytics";
import { formatPrice } from "@/types/event";

function formatPercent(value: number): string {
	return `${value.toFixed(1)}%`;
}

function numberOrDash(value: number | null | undefined) {
	return value !== null && value !== undefined ? value : "—";
}

export default function EventAnalyticsPage({ params }: { params: { id: string } }) {
	const { id } = params;
	const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const loadDashboard = async (token: string) => {
		try {
			setError(null);
			const data = await apiClient.getEventAnalyticsDashboard(id, token);
			setDashboard(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unable to fetch analytics data");
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		const token = window.localStorage.getItem("lumentix_access_token");
		if (!token) {
			setError("Organizer access token not found. Please paste your bearer token in the event creation page.");
			setIsLoading(false);
			return;
		}

		void loadDashboard(token);
		const intervalId = window.setInterval(() => void loadDashboard(token), 15000);
		return () => window.clearInterval(intervalId);
	}, [id]);

	const summaryItems = useMemo(() => {
		if (!dashboard) return [];
		return [
			{ label: "Tickets sold", value: dashboard.quickStats.ticketsSold },
			{ label: "Revenue", value: formatPrice(dashboard.quickStats.totalRevenue, "USD") },
			{ label: "Attendance rate", value: formatPercent(dashboard.quickStats.attendanceRate) },
			{ label: "Refund rate", value: formatPercent(dashboard.quickStats.refundRate) },
			{ label: "Avg ticket price", value: formatPrice(dashboard.quickStats.avgTicketPrice, "USD") },
		];
	}, [dashboard]);

	return (
		<div className="max-w-7xl mx-auto px-4 py-8">
			<div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-3xl font-bold text-white">Organizer Analytics</h1>
					<p className="mt-2 text-gray-400 max-w-2xl">
						Live event analytics for organizers, updated automatically every 15 seconds.
					</p>
				</div>
				<Link
					href={`/events/${id}`}
					className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-200 transition hover:bg-blue-500/20"
				>
					Back to event
				</Link>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 mb-8">
				{dashboard ? (
					summaryItems.map((item) => (
						<div key={item.label} className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-lg shadow-black/10">
							<p className="text-sm uppercase tracking-[0.2em] text-slate-400">{item.label}</p>
							<p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
						</div>
					))
				) : (
					<div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-lg shadow-black/10 sm:col-span-2 xl:col-span-3">
						<p className="text-sm text-slate-400">Loading analytics summary...</p>
					</div>
				)}
			</div>

			{error ? (
				<div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 text-red-100">
					<p className="font-semibold">Unable to load analytics</p>
					<p className="mt-2 text-sm text-red-100/80">{error}</p>
				</div>
			) : null}

			{isLoading ? (
				<div className="rounded-3xl border border-white/10 bg-slate-950/70 p-8 text-gray-400">
					<p>Fetching analytics data...</p>
				</div>
			) : null}

			{dashboard && (
				<div className="space-y-8">
					<section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6">
						<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
							<div>
								<h2 className="text-xl font-semibold text-white">Sales Velocity</h2>
								<p className="mt-2 text-sm text-slate-400">Revenue and ticket momentum with hourly breakouts.</p>
							</div>
							<p className="text-sm text-slate-500">Updated {new Date(dashboard.lastUpdated).toLocaleString()}</p>
						</div>

						<div className="mt-6 grid gap-4 lg:grid-cols-3">
							{[
								{ label: "Avg tickets/day", value: dashboard.salesReport.metrics.avgTicketsPerDay.toFixed(1) },
								{ label: "Avg revenue/day", value: formatPrice(dashboard.salesReport.metrics.avgRevenuePerDay, "USD") },
								{ label: "Peak hour", value: dashboard.salesReport.metrics.peakSalesHour !== null ? `${dashboard.salesReport.metrics.peakSalesHour}:00` : "N/A" },
							].map((item) => (
								<div key={item.label} className="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
									<p className="text-sm text-slate-400">{item.label}</p>
									<p className="mt-3 text-lg font-semibold text-white">{item.value}</p>
								</div>
							))}
						</div>

						<div className="mt-6 overflow-x-auto">
							<table className="min-w-full divide-y divide-white/10 text-left text-sm">
								<thead>
									<tr>
										<th className="pb-3 text-slate-400">Time</th>
										<th className="pb-3 text-slate-400">Tickets</th>
										<th className="pb-3 text-slate-400">Revenue</th>
										<th className="pb-3 text-slate-400">Cumulative</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-white/10 text-slate-300">
									{dashboard.salesReport.salesData.map((data) => (
										<tr key={data.timestamp}>
											<td className="py-3">{new Date(data.timestamp).toLocaleString()}</td>
											<td className="py-3">{data.ticketsSold}</td>
											<td className="py-3">{formatPrice(data.revenue, "USD")}</td>
											<td className="py-3">{formatPrice(data.cumulativeRevenue, "USD")}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>

					<section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6">
						<h2 className="text-xl font-semibold text-white">Demographics</h2>
						<p className="mt-2 text-sm text-slate-400">Age distribution, currency mix, and repeat attendee trends.</p>

						<div className="mt-6 grid gap-4 lg:grid-cols-2">
							<div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
								<p className="text-sm text-slate-400">Verified age distribution</p>
								<ul className="mt-3 space-y-2 text-slate-300">
									{dashboard.demographics.demographics.verifiedAges.map((age) => (
										<li key={age.ageRange} className="flex justify-between gap-4">
											<span>{age.ageRange}</span>
											<span>{age.count} ({age.percentage.toFixed(1)}%)</span>
										</li>
									))}
								</ul>
							</div>

							<div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
								<p className="text-sm text-slate-400">Currency breakdown</p>
								<ul className="mt-3 space-y-2 text-slate-300">
									{dashboard.demographics.currencyBreakdown.map((currency) => (
										<li key={currency.currency} className="flex justify-between gap-4">
											<span>{currency.currency}</span>
											<span>{currency.ticketCount} tickets</span>
										</li>
									))}
								</ul>
							</div>
						</div>
					</section>

					<section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6">
						<h2 className="text-xl font-semibold text-white">Attendance Patterns</h2>
						<p className="mt-2 text-sm text-slate-400">Check-in velocity and ticket utilization across the event.</p>

						{dashboard.attendance ? (
							<div className="mt-6 space-y-4">
								<div className="grid gap-4 md:grid-cols-3">
									{[
										{ label: "Tickets used", value: dashboard.attendance.ticketsUsed },
										{ label: "Tickets unused", value: dashboard.attendance.ticketsUnused },
										{ label: "Event hours", value: dashboard.attendance.eventDurationHours },
									].map((item) => (
										<div key={item.label} className="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
											<p className="text-sm text-slate-400">{item.label}</p>
											<p className="mt-3 text-lg font-semibold text-white">{item.value}</p>
										</div>
									))}
								</div>

								<div className="overflow-x-auto rounded-3xl border border-white/10 bg-slate-900/70 p-4">
									<table className="min-w-full divide-y divide-white/10 text-left text-sm text-slate-300">
										<thead>
											<tr>
												<th className="pb-3">Hour</th>
												<th className="pb-3">Check-ins</th>
												<th className="pb-3">Cumulative</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-white/10">
											{dashboard.attendance.hourlyCheckIns.map((point) => (
												<tr key={`${point.hour}-${point.timestamp}`}>
													<td className="py-3">{point.hour}:00</td>
													<td className="py-3">{point.checkInCount}</td>
													<td className="py-3">{point.cumulativeCheckIns}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
								<div className="grid gap-4 md:grid-cols-3">
									<div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
										<p className="text-sm text-slate-400">Peak hour</p>
										<p className="mt-3 text-lg font-semibold text-white">{dashboard.attendance.metrics.peakCheckInHour ?? "N/A"}</p>
									</div>
									<div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
										<p className="text-sm text-slate-400">Avg check-in interval</p>
										<p className="mt-3 text-lg font-semibold text-white">{numberOrDash(dashboard.attendance.metrics.avgCheckInInterval)} min</p>
									</div>
									<div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
										<p className="text-sm text-slate-400">Check-ins per min</p>
										<p className="mt-3 text-lg font-semibold text-white">{numberOrDash(dashboard.attendance.metrics.peakCheckInRate)}</p>
									</div>
								</div>
							</div>
						) : (
							<div className="mt-6 rounded-3xl border border-white/10 bg-slate-900/70 p-6 text-slate-300">
								<p>No attendance check-ins have been recorded yet.</p>
							</div>
						)}
					</section>

					<section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6">
						<h2 className="text-xl font-semibold text-white">Refund Health</h2>
						<p className="mt-2 text-sm text-slate-400">Refund counts, average refund size, and recent refund activity.</p>

						<div className="mt-6 grid gap-4 md:grid-cols-4">
							{[
								{ label: "Refunds total", value: dashboard.refunds.totalRefunds },
								{ label: "Refund amount", value: formatPrice(dashboard.refunds.totalRefundAmount, "USD") },
								{ label: "Avg refund", value: formatPrice(dashboard.refunds.avgRefundAmount, "USD") },
								{ label: "Recent refunds", value: dashboard.refunds.refundsLast7Days },
							].map((item) => (
								<div key={item.label} className="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
									<p className="text-sm text-slate-400">{item.label}</p>
									<p className="mt-3 text-lg font-semibold text-white">{item.value}</p>
								</div>
							))}
						</div>
					</section>
				</div>
			)}
		</div>
	);
}
