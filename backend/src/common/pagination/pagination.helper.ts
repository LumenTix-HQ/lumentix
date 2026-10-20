import { BadRequestException } from '@nestjs/common';
import { SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import { PaginationDto } from './dto/pagination.dto';
import { PaginatedResult } from './interfaces/paginated-result.interface';

/**
 * Column identifiers are only ever used as TypeORM property paths (e.g.
 * `alias.createdAt`), so they must look like a plain JS identifier. This is a
 * belt-and-braces guard on top of the per-entity allowlist below: it rejects
 * anything containing quotes, whitespace, parentheses, slashes, dots, etc.
 */
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Resolve a client-supplied column name to a known-safe column reference.
 *
 * The value is rejected with a 400 unless it (a) looks like a plain identifier
 * and (b) is an actual column on the entity backing the query builder. The
 * allowlist is derived from TypeORM metadata, so it always reflects the real
 * column set and never needs to be maintained by hand.
 *
 * This means `sortBy`/`dateField`/`priceField`/`statusField` can no longer be
 * used to smuggle arbitrary SQL into the `ORDER BY`/`WHERE` fragments.
 */
function resolveColumn<Entity extends ObjectLiteral>(
  queryBuilder: SelectQueryBuilder<Entity>,
  field: string | undefined,
  fallback: string,
  label: string,
): string {
  const candidate = field ?? fallback;

  if (typeof candidate !== 'string' || !IDENTIFIER_PATTERN.test(candidate)) {
    throw new BadRequestException(
      `Invalid ${label}: column names must be plain identifiers`,
    );
  }

  const columns =
    queryBuilder.expressionMap.mainAlias?.metadata?.columns ?? [];
  const allowed = new Set(columns.map((column) => column.propertyName));

  // `allowed` is empty only when the query builder has no main alias metadata
  // (e.g. a bare mock); in that case fall back to the identifier check.
  if (allowed.size > 0 && !allowed.has(candidate)) {
    throw new BadRequestException(
      `Invalid ${label}: unknown column '${candidate}'`,
    );
  }

  return candidate;
}

/**
 * Generic paginate helper.
 *
 * @param queryBuilder - A TypeORM SelectQueryBuilder (already joined / where'd by the caller)
 * @param dto          - PaginationDto containing page, limit, sort, and optional filters
 * @param alias        - The root entity alias used in the query builder (default: first alias)
 *
 * @example
 *   const qb = this.eventsRepo.createQueryBuilder('event');
 *   return paginate(qb, paginationDto, 'event');
 */
export async function paginate<T extends ObjectLiteral>(
  queryBuilder: SelectQueryBuilder<T>,
  dto: PaginationDto,
  alias?: string,
): Promise<PaginatedResult<T>> {
  const {
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    order = 'DESC',
    // Date range
    dateFrom,
    dateTo,
    dateField = 'createdAt',
    // Price range
    priceMin,
    priceMax,
    priceField = 'price',
    // Status
    status,
    statusField = 'status',
  } = dto;

  // Resolve alias — fall back to the first alias on the query builder
  const rootAlias = alias ?? queryBuilder.alias;

  // ─── Apply Optional Filters ────────────────────────────────────────────────
  // Every column name is validated against the entity's real columns before it
  // is interpolated; the *values* remain parameterized bindings.

  if (dateFrom || dateTo) {
    const safeDateField = resolveColumn(
      queryBuilder,
      dateField,
      'createdAt',
      'dateField',
    );

    if (dateFrom) {
      queryBuilder.andWhere(`${rootAlias}.${safeDateField} >= :dateFrom`, {
        dateFrom: new Date(dateFrom),
      });
    }

    if (dateTo) {
      queryBuilder.andWhere(`${rootAlias}.${safeDateField} <= :dateTo`, {
        dateTo: new Date(dateTo),
      });
    }
  }

  if (priceMin !== undefined || priceMax !== undefined) {
    const safePriceField = resolveColumn(
      queryBuilder,
      priceField,
      'price',
      'priceField',
    );

    if (priceMin !== undefined) {
      queryBuilder.andWhere(`${rootAlias}.${safePriceField} >= :priceMin`, {
        priceMin,
      });
    }

    if (priceMax !== undefined) {
      queryBuilder.andWhere(`${rootAlias}.${safePriceField} <= :priceMax`, {
        priceMax,
      });
    }
  }

  if (status !== undefined) {
    const safeStatusField = resolveColumn(
      queryBuilder,
      statusField,
      'status',
      'statusField',
    );
    queryBuilder.andWhere(`${rootAlias}.${safeStatusField} = :status`, {
      status,
    });
  }

  // ─── Sorting ───────────────────────────────────────────────────────────────

  const safeSortBy = resolveColumn(queryBuilder, sortBy, 'createdAt', 'sortBy');
  const safeOrder = order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  queryBuilder.orderBy(`${rootAlias}.${safeSortBy}`, safeOrder);

  // ─── Count total BEFORE pagination ────────────────────────────────────────

  const total = await queryBuilder.getCount();

  // ─── Pagination ────────────────────────────────────────────────────────────

  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, limit);
  const skip = (safePage - 1) * safeLimit;

  queryBuilder.skip(skip).take(safeLimit);

  const data = await queryBuilder.getMany();

  const lastPage = Math.ceil(total / safeLimit) || 1;

  return {
    data,
    total,
    page: safePage,
    lastPage,
    hasNextPage: safePage < lastPage,
    hasPreviousPage: safePage > 1,
  };
}
