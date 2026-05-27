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
  ticket: any;
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
