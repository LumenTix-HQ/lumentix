import type { Ticket } from '@/components/TicketCard';

export interface ListTicketForResaleDto {
  price: number;
  currency: string;
}

export interface BuyResaleTicketDto {
  transactionHash: string;
}

export interface ResaleListingResult {
  isListed: boolean;
  listingPrice: number;
  maxAllowedPrice: number;
}

export interface ResalePurchaseResult {
  ticket: Ticket;
  salePrice: number;
  organizerFee: number;
  sellerPayout: number;
}

export interface ResaleTransaction {
  id: string;
  ticketId: string;
  eventId: string;
  sellerId: string;
  buyerId: string;
  salePrice: number;
  currency: string;
  originalPrice: number;
  organizerFee: number;
  sellerPayout: number;
  status: string;
  transactionHash: string | null;
  createdAt: string;
}

export interface OrganizerEarnings {
  totalEarnings: number;
  transactions: number;
}

export interface ResaleMarketplaceListing {
  ticketId: string;
  eventId: string;
  eventTitle: string;
  eventDate: string | null;
  askPrice: number;
  currency: string;
  sellerDisplayName: string;
  listedAt: string;
}

export interface ResaleMarketplaceResponse {
  data: ResaleMarketplaceListing[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
