export enum EventStatus {
	DRAFT = "draft",
	PUBLISHED = "published",
	COMPLETED = "completed",
	CANCELLED = "cancelled",
}

export enum EventAgeRestriction {
	NONE = "none",
	EIGHTEEN_PLUS = "18+",
	TWENTY_ONE_PLUS = "21+",
}

export enum EventCategory {
	CONFERENCE = "Conference",
	WORKSHOP = "Workshop",
	MEETUP = "Meetup",
	CONCERT = "Concert",
	SPORTS = "Sports",
	FESTIVAL = "Festival",
	OTHER = "Other",
}

export enum VipTierName {
	BRONZE = "bronze",
	SILVER = "silver",
	GOLD = "gold",
	PLATINUM = "platinum",
}

export enum SeatCategoryName {
	GENERAL = "General",
	PREMIUM = "Premium",
	VIP = "VIP",
	BOX = "Box",
	BALCONY = "Balcony",
}

export enum AccessibilityType {
	WHEELCHAIR = "wheelchair",
	HEARING = "hearing",
	VISUAL = "visual",
	OTHER = "other",
}

export interface VipTier {
	id: string;
	eventId: string;
	name: VipTierName;
	price: number;
	maxSlots: number;
	filledSlots: number;
	benefits: string[];
	createdAt: string;
}

export interface VenueSection {
	id: string;
	eventId: string;
	name: string;
	category: SeatCategoryName;
	rows: number;
	seatsPerRow: number;
	createdAt: string;
}

export interface Seat {
	id: string;
	sectionId: string;
	seatIdentifier: string;
	row: number;
	number: number;
	status: "available" | "held" | "booked";
	heldBy: string | null;
}

export interface AccessibilityInventory {
	id: string;
	eventId: string;
	type: AccessibilityType;
	totalSlots: number;
	bookedSlots: number;
	description: string | null;
	createdAt: string;
}

export interface Event {
	id: string;
	title: string;
	description: string;
	location: string;
	startDate: string;
	endDate: string;
	ticketPrice: number;
	currency: string;
	organizerId: string;
	organizerName: string;
	status: EventStatus;
	category: EventCategory;
	ageRestriction: EventAgeRestriction;
	imageUrl: string;
	totalTickets: number;
	soldTickets: number;
	vipTiers?: VipTier[];
	venueSections?: VenueSection[];
	accessibilityInventory?: AccessibilityInventory[];
	createdAt: string;
	updatedAt: string;
}

export interface EventFilters {
	search: string;
	categories: EventCategory[];
	dateFrom: string;
	dateTo: string;
	priceMin: string;
	priceMax: string;
	status: EventStatus | "";
	currency?: string;
}

export interface PaginatedResponse<T> {
	data: T[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
	USD: "$",
	EUR: "€",
	NGN: "₦",
	XLM: "XLM",
	USDC: "USDC",
	GBP: "£",
	JPY: "¥",
};

export function formatPrice(amount: number, currency: string): string {
	const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] ?? currency + " ";
	if (currency.toUpperCase() === "XLM" || currency.toUpperCase() === "USDC") {
		return `${amount} ${symbol}`;
	}
	return `${symbol}${amount}`;
}
