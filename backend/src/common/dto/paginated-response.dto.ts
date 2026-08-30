export interface PaginatedResponseDto<T> {
  data: T[];
  total: number;
  skip: number;
  take: number;
}
