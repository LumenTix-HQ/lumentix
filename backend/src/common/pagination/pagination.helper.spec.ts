import { BadRequestException } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { paginate } from './pagination.helper';
import { PaginationDto } from './dto/pagination.dto';

/** Build a fake query builder exposing the given column property names. */
function createQueryBuilder(
  columns: string[],
): SelectQueryBuilder<Record<string, unknown>> {
  const qb = {
    alias: 'entity',
    expressionMap: {
      mainAlias: {
        metadata: {
          columns: columns.map((propertyName) => ({ propertyName })),
        },
      },
    },
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(0),
    getMany: jest.fn().mockResolvedValue([]),
  };
  return qb as unknown as SelectQueryBuilder<Record<string, unknown>>;
}

const COLUMNS = ['id', 'createdAt', 'updatedAt', 'status', 'price', 'amount'];

describe('paginate() column allowlist', () => {
  it('orders by a real column when sortBy is valid', async () => {
    const qb = createQueryBuilder(COLUMNS);

    await paginate(qb, { sortBy: 'createdAt', order: 'ASC' } as PaginationDto, 'entity');

    expect(qb.orderBy).toHaveBeenCalledWith('entity.createdAt', 'ASC');
    expect(qb.getCount).toHaveBeenCalled();
    expect(qb.getMany).toHaveBeenCalled();
  });

  it.each([
    'createdAt; DROP TABLE payments--',
    'createdAt) OR 1=1--',
    'createdAt, (SELECT 1)',
    'createdAt"',
    'created_at)',
    'createdAt--',
    '  createdAt',
  ])('rejects the sortBy SQL-injection payload %j with a 400', async (payload) => {
    const qb = createQueryBuilder(COLUMNS);

    await expect(
      paginate(qb, { sortBy: payload } as PaginationDto, 'entity'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(qb.orderBy).not.toHaveBeenCalled();
    expect(qb.getCount).not.toHaveBeenCalled();
    expect(qb.getMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown-but-well-formed sortBy column', async () => {
    const qb = createQueryBuilder(COLUMNS);

    await expect(
      paginate(qb, { sortBy: 'passwordHash' } as PaginationDto, 'entity'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(qb.orderBy).not.toHaveBeenCalled();
  });

  it('rejects an injection payload in dateField when a date range is supplied', async () => {
    const qb = createQueryBuilder(COLUMNS);

    await expect(
      paginate(
        qb,
        {
          dateFrom: '2024-01-01',
          dateField: 'createdAt) OR (1=1',
        } as PaginationDto,
        'entity',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(qb.andWhere).not.toHaveBeenCalled();
  });

  it('rejects an injection payload in priceField when a price range is supplied', async () => {
    const qb = createQueryBuilder(COLUMNS);

    await expect(
      paginate(
        qb,
        { priceMin: 1, priceField: 'price; DROP TABLE users' } as PaginationDto,
        'entity',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(qb.andWhere).not.toHaveBeenCalled();
  });

  it('rejects an injection payload in statusField when a status is supplied', async () => {
    const qb = createQueryBuilder(COLUMNS);

    await expect(
      paginate(
        qb,
        { status: 'active', statusField: "status' OR '1'='1" } as PaginationDto,
        'entity',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(qb.andWhere).not.toHaveBeenCalled();
  });

  it('applies real date/price/status columns as parameterized bindings', async () => {
    const qb = createQueryBuilder(COLUMNS);

    await paginate(
      qb,
      {
        dateFrom: '2024-01-01',
        dateField: 'createdAt',
        priceMin: 5,
        priceField: 'amount',
        status: 'active',
        statusField: 'status',
      } as PaginationDto,
      'entity',
    );

    expect(qb.andWhere).toHaveBeenCalledWith(
      'entity.createdAt >= :dateFrom',
      { dateFrom: expect.any(Date) },
    );
    expect(qb.andWhere).toHaveBeenCalledWith('entity.amount >= :priceMin', {
      priceMin: 5,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('entity.status = :status', {
      status: 'active',
    });
  });

  it('does not validate the default priceField when no price filter is supplied', async () => {
    // An entity with no `price` column must still paginate fine as long as the
    // caller never asks for a price filter (the default value is unused).
    const qb = createQueryBuilder(['id', 'createdAt']);

    await expect(
      paginate(qb, {} as PaginationDto, 'entity'),
    ).resolves.toMatchObject({ page: 1 });
  });
});
