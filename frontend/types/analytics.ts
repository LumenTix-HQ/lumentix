export interface SalesDataPoint {
	timestamp: string;
	ticketsSold: number;
	revenue: number;
	cumulativeTickets: number;
	cumulativeRevenue: number;
}

export interface SalesVelocityMetrics {
	avgTicketsPerDay: number;
	avgRevenuePerDay: number;
	ticketsLast7Days: number;
	ticketsLast24Hours: number;
	peakSalesHour: number | null;
	peakSalesDayOfWeek: number | null;
	trend: 'increasing' | 'decreasing' | 'stable';
}

export interface SalesReport {
	salesData: SalesDataPoint[];
	metrics: SalesVelocityMetrics;
	totalTicketsSold: number;
	totalRevenue: number;
	avgTicketPrice: number;
	daysActive: number;
}

export interface AgeDistributionBucket {
	ageRange: string;
	count: number;
	percentage: number;
}

export interface DemographicBreakdown {
	verifiedAges: AgeDistributionBucket[];
	ageVerificationRate: number;
	averageAge: number | null;
	minAge: number | null;
	maxAge: number | null;
}

export interface CurrencyBreakdown {
	currency: string;
	ticketCount: number;
	totalAmount: number;
	percentage: number;
}

export interface DemographicsReport {
	demographics: DemographicBreakdown;
	currencyBreakdown: CurrencyBreakdown[];
	totalAttendees: number;
	totalRegistrations: number;
	repeatAttendeeCount: number;
	repeatAttendeePercentage: number;
}

export interface AttendanceDataPoint {
	timestamp: string;
	checkInCount: number;
	cumulativeCheckIns: number;
	hour: number;
}

export interface AttendanceMetrics {
	peakCheckInHour: number | null;
	peakCheckInCount: number;
	totalCheckIns: number;
	attendanceRate: number;
	avgCheckInInterval: number | null;
	peakCheckInRate: number | null;
	estimatedCapacityFilled: number | null;
}

export interface AttendancePattern {
	eventDurationHours: number;
	hourlyCheckIns: AttendanceDataPoint[];
	metrics: AttendanceMetrics;
	totalTicketsIssued: number;
	ticketsUsed: number;
	ticketsUnused: number;
	eventStartTime: string;
	lastCheckInTime: string | null;
}

export interface RefundMetrics {
	totalRefunds: number;
	totalRefundAmount: number;
	refundRate: number;
	avgRefundAmount: number;
	mostCommonReason: string | null;
	refundsLast7Days: number;
}

export interface QuickStats {
	ticketsSold: number;
	totalRevenue: number;
	attendanceCount: number;
	attendanceRate: number;
	avgTicketPrice: number;
	totalRefunds: number;
	refundRate: number;
	revenueTrend: 'up' | 'down' | 'stable';
	salesTrend: 'up' | 'down' | 'stable';
}

export interface AnalyticsDashboard {
	eventId: string;
	lastUpdated: string;
	quickStats: QuickStats;
	salesReport: SalesReport;
	 demographics: DemographicsReport;
	attendance: AttendancePattern | null;
	refunds: RefundMetrics;
}
