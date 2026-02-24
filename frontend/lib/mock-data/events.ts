import {
	Event,
	EventStatus,
	EventCategory,
	EventFilters,
	PaginatedResponse,
} from "@/types/event";

const MOCK_EVENTS: Event[] = [
	{
		id: "e1a2b3c4-d5e6-7890-abcd-ef1234567890",
		title: "Stellar Horizons Conference 2026",
		description:
			"The largest annual gathering of Stellar developers, founders, and enthusiasts. Three days of talks, workshops, and networking that will shape the future of decentralized finance.",
		location: "San Francisco, CA",
		startDate: "2026-04-15T09:00:00Z",
		endDate: "2026-04-17T18:00:00Z",
		ticketPrice: 299,
		currency: "USD",
		organizerId: "org-001",
		organizerName: "Stellar Foundation",
		status: EventStatus.PUBLISHED,
		category: EventCategory.CONFERENCE,
		imageUrl: "",
		totalTickets: 2000,
		soldTickets: 1456,
		createdAt: "2026-01-10T12:00:00Z",
		updatedAt: "2026-02-20T08:00:00Z",
	},
	{
		id: "f2b3c4d5-e6f7-8901-bcde-f12345678901",
		title: "Smart Contracts Bootcamp",
		description:
			"Intensive 2-day hands-on workshop covering Soroban smart contract development from the ground up. Perfect for developers looking to build on Stellar.",
		location: "Austin, TX",
		startDate: "2026-03-22T10:00:00Z",
		endDate: "2026-03-23T17:00:00Z",
		ticketPrice: 149,
		currency: "USD",
		organizerId: "org-002",
		organizerName: "BlockDev Academy",
		status: EventStatus.PUBLISHED,
		category: EventCategory.WORKSHOP,
		imageUrl: "",
		totalTickets: 100,
		soldTickets: 78,
		createdAt: "2026-01-15T09:00:00Z",
		updatedAt: "2026-02-18T14:00:00Z",
	},
	{
		id: "a3c4d5e6-f7a8-9012-cdef-123456789012",
		title: "Web3 Builders Meetup — Lagos",
		description:
			"Monthly gathering for blockchain and Web3 builders in Lagos. Lightning talks, demos, and community networking over drinks and pizza.",
		location: "Lagos, Nigeria",
		startDate: "2026-03-10T18:00:00Z",
		endDate: "2026-03-10T21:00:00Z",
		ticketPrice: 0,
		currency: "USD",
		organizerId: "org-003",
		organizerName: "Web3 Lagos",
		status: EventStatus.PUBLISHED,
		category: EventCategory.MEETUP,
		imageUrl: "",
		totalTickets: 200,
		soldTickets: 145,
		createdAt: "2026-02-01T10:00:00Z",
		updatedAt: "2026-02-15T12:00:00Z",
	},
	{
		id: "b4d5e6f7-a8b9-0123-defa-234567890123",
		title: "Lumens Live — Electronic Music Festival",
		description:
			"A two-night electronic music festival powered by Stellar. All tickets are NFT-based and transferable on-chain. Featuring top DJs and immersive light shows.",
		location: "Berlin, Germany",
		startDate: "2026-06-20T20:00:00Z",
		endDate: "2026-06-22T04:00:00Z",
		ticketPrice: 89,
		currency: "USD",
		organizerId: "org-004",
		organizerName: "Lumen Events GmbH",
		status: EventStatus.PUBLISHED,
		category: EventCategory.CONCERT,
		imageUrl: "",
		totalTickets: 5000,
		soldTickets: 3200,
		createdAt: "2026-01-20T08:00:00Z",
		updatedAt: "2026-02-22T10:00:00Z",
	},
	{
		id: "c5e6f7a8-b9c0-1234-efab-345678901234",
		title: "Stellar Charity Run 5K",
		description:
			"Run for a cause! Participate in our charity 5K run with proceeds going to STEM education. Registration and donations handled entirely on Stellar.",
		location: "London, UK",
		startDate: "2026-05-03T08:00:00Z",
		endDate: "2026-05-03T12:00:00Z",
		ticketPrice: 25,
		currency: "USD",
		organizerId: "org-005",
		organizerName: "Run for Blocks",
		status: EventStatus.PUBLISHED,
		category: EventCategory.SPORTS,
		imageUrl: "",
		totalTickets: 500,
		soldTickets: 312,
		createdAt: "2026-02-05T07:00:00Z",
		updatedAt: "2026-02-19T09:00:00Z",
	},
	{
		id: "d6f7a8b9-c0d1-2345-fabc-456789012345",
		title: "DeFi Summer Festival",
		description:
			"Three days of panels, hackathons, and live music celebrating decentralized finance. Learn, build, and party at the intersection of finance and technology.",
		location: "Miami, FL",
		startDate: "2026-07-10T12:00:00Z",
		endDate: "2026-07-12T23:00:00Z",
		ticketPrice: 199,
		currency: "USD",
		organizerId: "org-006",
		organizerName: "DeFi Alliance",
		status: EventStatus.PUBLISHED,
		category: EventCategory.FESTIVAL,
		imageUrl: "",
		totalTickets: 3000,
		soldTickets: 890,
		createdAt: "2026-02-10T11:00:00Z",
		updatedAt: "2026-02-21T16:00:00Z",
	},
	{
		id: "e7a8b9c0-d1e2-3456-abcd-567890123456",
		title: "Intro to Stellar for Business",
		description:
			"A free online workshop designed for business leaders interested in integrating Stellar blockchain into their payment and remittance workflows.",
		location: "Online",
		startDate: "2026-03-28T14:00:00Z",
		endDate: "2026-03-28T16:00:00Z",
		ticketPrice: 0,
		currency: "USD",
		organizerId: "org-007",
		organizerName: "Stellar Foundation",
		status: EventStatus.PUBLISHED,
		category: EventCategory.WORKSHOP,
		imageUrl: "",
		totalTickets: 500,
		soldTickets: 234,
		createdAt: "2026-02-08T13:00:00Z",
		updatedAt: "2026-02-20T10:00:00Z",
	},
	{
		id: "f8b9c0d1-e2f3-4567-bcde-678901234567",
		title: "NFT Art Exhibition Launch",
		description:
			"Experience the intersection of art and blockchain at this exclusive gallery opening. All artworks are tokenized as Stellar NFTs with on-chain provenance.",
		location: "New York, NY",
		startDate: "2026-04-05T19:00:00Z",
		endDate: "2026-04-05T23:00:00Z",
		ticketPrice: 50,
		currency: "USD",
		organizerId: "org-008",
		organizerName: "CryptoCanvas Gallery",
		status: EventStatus.PUBLISHED,
		category: EventCategory.OTHER,
		imageUrl: "",
		totalTickets: 150,
		soldTickets: 142,
		createdAt: "2026-01-25T15:00:00Z",
		updatedAt: "2026-02-22T12:00:00Z",
	},
	{
		id: "a9c0d1e2-f3a4-5678-cdef-789012345678",
		title: "Blockchain Gaming Tournament",
		description:
			"Compete in the ultimate blockchain gaming tournament! Play-to-earn games on Stellar with real Lumen prizes. Streamed live for global audiences.",
		location: "Tokyo, Japan",
		startDate: "2026-05-18T10:00:00Z",
		endDate: "2026-05-19T20:00:00Z",
		ticketPrice: 35,
		currency: "USD",
		organizerId: "org-009",
		organizerName: "GameFi Tokyo",
		status: EventStatus.PUBLISHED,
		category: EventCategory.SPORTS,
		imageUrl: "",
		totalTickets: 300,
		soldTickets: 210,
		createdAt: "2026-02-12T06:00:00Z",
		updatedAt: "2026-02-20T08:00:00Z",
	},
	{
		id: "b0d1e2f3-a4b5-6789-defa-890123456789",
		title: "Women in Web3 Summit",
		description:
			"Celebrating women builders, founders, and leaders in the Web3 space. Inspiring talks, mentorship sessions, and community building.",
		location: "Toronto, Canada",
		startDate: "2026-04-22T09:00:00Z",
		endDate: "2026-04-22T18:00:00Z",
		ticketPrice: 75,
		currency: "USD",
		organizerId: "org-010",
		organizerName: "W3Women Collective",
		status: EventStatus.PUBLISHED,
		category: EventCategory.CONFERENCE,
		imageUrl: "",
		totalTickets: 400,
		soldTickets: 356,
		createdAt: "2026-01-30T11:00:00Z",
		updatedAt: "2026-02-18T15:00:00Z",
	},
	{
		id: "c1e2f3a4-b5c6-7890-efab-901234567890",
		title: "Stellar Developer Happy Hour",
		description:
			"Casual evening meetup for Stellar developers. Grab a drink, share what you're building, and connect with fellow devs in a relaxed setting.",
		location: "Amsterdam, Netherlands",
		startDate: "2026-03-14T17:30:00Z",
		endDate: "2026-03-14T21:00:00Z",
		ticketPrice: 0,
		currency: "USD",
		organizerId: "org-011",
		organizerName: "Stellar Amsterdam",
		status: EventStatus.PUBLISHED,
		category: EventCategory.MEETUP,
		imageUrl: "",
		totalTickets: 80,
		soldTickets: 62,
		createdAt: "2026-02-15T14:00:00Z",
		updatedAt: "2026-02-21T09:00:00Z",
	},
	{
		id: "d2f3a4b5-c6d7-8901-fabc-012345678901",
		title: "Cross-Border Payments Hackathon",
		description:
			"48-hour hackathon focused on building innovative cross-border payment solutions using Stellar. $50,000 in prizes across multiple categories.",
		location: "Singapore",
		startDate: "2026-06-06T09:00:00Z",
		endDate: "2026-06-08T17:00:00Z",
		ticketPrice: 0,
		currency: "USD",
		organizerId: "org-012",
		organizerName: "PayTech Asia",
		status: EventStatus.PUBLISHED,
		category: EventCategory.WORKSHOP,
		imageUrl: "",
		totalTickets: 200,
		soldTickets: 167,
		createdAt: "2026-02-01T05:00:00Z",
		updatedAt: "2026-02-22T07:00:00Z",
	},
	{
		id: "e3a4b5c6-d7e8-9012-abcd-123456789abc",
		title: "Soroban Deep Dive: Advanced Patterns",
		description:
			"Advanced workshop for experienced Soroban developers. Covers complex contract patterns, gas optimization, and real-world deployment strategies.",
		location: "Denver, CO",
		startDate: "2026-05-10T10:00:00Z",
		endDate: "2026-05-10T18:00:00Z",
		ticketPrice: 199,
		currency: "USD",
		organizerId: "org-002",
		organizerName: "BlockDev Academy",
		status: EventStatus.PUBLISHED,
		category: EventCategory.WORKSHOP,
		imageUrl: "",
		totalTickets: 60,
		soldTickets: 45,
		createdAt: "2026-02-14T10:00:00Z",
		updatedAt: "2026-02-20T14:00:00Z",
	},
	{
		id: "f4b5c6d7-e8f9-0123-bcde-234567890bcd",
		title: "Crypto Jazz Night",
		description:
			"Smooth jazz meets blockchain at this intimate evening event. Enjoy world-class jazz musicians while mingling with the crypto community.",
		location: "New Orleans, LA",
		startDate: "2026-04-30T20:00:00Z",
		endDate: "2026-05-01T01:00:00Z",
		ticketPrice: 65,
		currency: "USD",
		organizerId: "org-013",
		organizerName: "JazzChain Collective",
		status: EventStatus.PUBLISHED,
		category: EventCategory.CONCERT,
		imageUrl: "",
		totalTickets: 250,
		soldTickets: 198,
		createdAt: "2026-02-08T16:00:00Z",
		updatedAt: "2026-02-21T11:00:00Z",
	},
	{
		id: "a5c6d7e8-f9a0-1234-cdef-345678901cde",
		title: "Decentralized Identity Workshop",
		description:
			"Learn to build self-sovereign identity solutions on Stellar. Covers DIDs, verifiable credentials, and practical implementation with hands-on exercises.",
		location: "Online",
		startDate: "2026-03-18T15:00:00Z",
		endDate: "2026-03-18T18:00:00Z",
		ticketPrice: 0,
		currency: "USD",
		organizerId: "org-014",
		organizerName: "Identity Labs",
		status: EventStatus.PUBLISHED,
		category: EventCategory.WORKSHOP,
		imageUrl: "",
		totalTickets: 1000,
		soldTickets: 423,
		createdAt: "2026-02-10T12:00:00Z",
		updatedAt: "2026-02-19T16:00:00Z",
	},
	{
		id: "b6d7e8f9-a0b1-2345-defa-456789012def",
		title: "Stellar Ecosystem Showcase",
		description:
			"Annual showcase of the best projects built on Stellar. Demo day format with audience voting and investor networking. A great place to discover the next big thing.",
		location: "Lisbon, Portugal",
		startDate: "2026-06-15T10:00:00Z",
		endDate: "2026-06-15T20:00:00Z",
		ticketPrice: 45,
		currency: "USD",
		organizerId: "org-001",
		organizerName: "Stellar Foundation",
		status: EventStatus.PUBLISHED,
		category: EventCategory.CONFERENCE,
		imageUrl: "",
		totalTickets: 600,
		soldTickets: 280,
		createdAt: "2026-02-05T09:00:00Z",
		updatedAt: "2026-02-22T08:00:00Z",
	},
	{
		id: "c7e8f9a0-b1c2-3456-efab-567890123efa",
		title: "Tokenomics Masterclass",
		description:
			"A comprehensive one-day masterclass on designing token economies. Covers incentive design, governance tokens, and sustainable tokenomics frameworks.",
		location: "Dubai, UAE",
		startDate: "2026-05-25T09:00:00Z",
		endDate: "2026-05-25T17:00:00Z",
		ticketPrice: 350,
		currency: "USD",
		organizerId: "org-015",
		organizerName: "TokenEcon Institute",
		status: EventStatus.DRAFT,
		category: EventCategory.WORKSHOP,
		imageUrl: "",
		totalTickets: 80,
		soldTickets: 0,
		createdAt: "2026-02-18T14:00:00Z",
		updatedAt: "2026-02-22T14:00:00Z",
	},
	{
		id: "d8f9a0b1-c2d3-4567-fabc-678901234fab",
		title: "Stellar Community Day — Nairobi",
		description:
			"A full day of learning, building, and connecting with the Stellar community in East Africa. Beginner-friendly with sessions in English and Swahili.",
		location: "Nairobi, Kenya",
		startDate: "2026-04-12T09:00:00Z",
		endDate: "2026-04-12T18:00:00Z",
		ticketPrice: 10,
		currency: "USD",
		organizerId: "org-016",
		organizerName: "Stellar East Africa",
		status: EventStatus.PUBLISHED,
		category: EventCategory.MEETUP,
		imageUrl: "",
		totalTickets: 300,
		soldTickets: 178,
		createdAt: "2026-02-12T08:00:00Z",
		updatedAt: "2026-02-21T13:00:00Z",
	},
];

/**
 * Simulates fetching events from the backend API with filtering and pagination.
 * Introduces an artificial delay to simulate network latency.
 */
export async function fetchEvents(
	filters: EventFilters,
	page: number = 1,
	limit: number = 9,
): Promise<PaginatedResponse<Event>> {
	// Simulate network delay
	await new Promise((resolve) => setTimeout(resolve, 800));

	let filtered = [...MOCK_EVENTS];

	// Search filter (title + description)
	if (filters.search.trim()) {
		const q = filters.search.toLowerCase();
		filtered = filtered.filter(
			(e) =>
				e.title.toLowerCase().includes(q) ||
				e.description.toLowerCase().includes(q) ||
				e.location.toLowerCase().includes(q),
		);
	}

	// Category filter
	if (filters.categories.length > 0) {
		filtered = filtered.filter((e) =>
			filters.categories.includes(e.category),
		);
	}

	// Date range filter
	if (filters.dateFrom) {
		const from = new Date(filters.dateFrom);
		filtered = filtered.filter((e) => new Date(e.startDate) >= from);
	}
	if (filters.dateTo) {
		const to = new Date(filters.dateTo);
		filtered = filtered.filter((e) => new Date(e.startDate) <= to);
	}

	// Price range filter
	if (filters.priceMin) {
		const min = parseFloat(filters.priceMin);
		if (!isNaN(min)) {
			filtered = filtered.filter((e) => e.ticketPrice >= min);
		}
	}
	if (filters.priceMax) {
		const max = parseFloat(filters.priceMax);
		if (!isNaN(max)) {
			filtered = filtered.filter((e) => e.ticketPrice <= max);
		}
	}

	// Status filter
	if (filters.status) {
		filtered = filtered.filter((e) => e.status === filters.status);
	}

	// Sort by start date (nearest first)
	filtered.sort(
		(a, b) =>
			new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
	);

	// Pagination
	const total = filtered.length;
	const totalPages = Math.max(1, Math.ceil(total / limit));
	const safePage = Math.min(page, totalPages);
	const start = (safePage - 1) * limit;
	const data = filtered.slice(start, start + limit);

	return {
		data,
		total,
		page: safePage,
		limit,
		totalPages,
	};
}
