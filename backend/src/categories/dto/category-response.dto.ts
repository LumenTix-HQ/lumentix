export class CategoryResponseDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
  eventCount?: number;
}
