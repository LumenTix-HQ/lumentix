export enum EventStatus {
	DRAFT = "draft",
	PUBLISHED = "published",
	COMPLETED = "completed",
	CANCELLED = "cancelled",
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
	imageUrl: string;
	totalTickets: number;
	soldTickets: number;
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
}

export interface PaginatedResponse<T> {
	data: T[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}
