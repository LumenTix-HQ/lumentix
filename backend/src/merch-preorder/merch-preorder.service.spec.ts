import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MerchPreorderService } from './merch-preorder.service';
import { MerchVariant } from './entities/merch-variant.entity';
import { MerchPreorder } from './entities/merch-preorder.entity';
import { MerchService } from '../merch/merch.service';
import { TicketsService } from '../tickets/tickets.service';
import { EventsService } from '../events/events.service';

/**
 * A minimal stand-in for the `merch_variants` row targeted by
 * reserveVariantStock()'s query-builder UPDATE, used to prove the atomic
 * `WHERE stockReserved + :qty <= stockTotal` condition behaves correctly
 * under "concurrent" calls without needing a real Postgres instance.
 *
 * Because the mocked `execute()` reads and writes `row` with no `await` in
 * between, two overlapping calls can't interleave mid-check the way two
 * separate DB connections theoretically could without a real atomic
 * UPDATE — which is exactly the property being tested.
 */
function makeVariantQueryBuilderRepo(row: { stockTotal: number; stockReserved: number }) {
  let pendingQuantity = 0;

  const queryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn((_sql: string, params: { quantity: number }) => {
      pendingQuantity = params.quantity;
      return queryBuilder;
    }),
    execute: jest.fn(async () => {
      const fits = row.stockReserved + pendingQuantity <= row.stockTotal;
      if (fits) {
        row.stockReserved += pendingQuantity;
        return { affected: 1 };
      }
      return { affected: 0 };
    }),
  };

  return {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    findOne: jest.fn(async () => ({ id: 'variant-1', ...row })),
  };
}

describe('MerchPreorderService.reserveVariantStock', () => {
  async function buildService(row: { stockTotal: number; stockReserved: number }) {
    const variantRepository = makeVariantQueryBuilderRepo(row);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchPreorderService,
        { provide: getRepositoryToken(MerchVariant), useValue: variantRepository },
        { provide: getRepositoryToken(MerchPreorder), useValue: {} },
        { provide: MerchService, useValue: {} },
        { provide: TicketsService, useValue: {} },
        { provide: EventsService, useValue: {} },
      ],
    }).compile();

    return {
      service: module.get<MerchPreorderService>(MerchPreorderService),
      row,
    };
  }

  it('reserves stock when enough is available', async () => {
    const { service, row } = await buildService({ stockTotal: 50, stockReserved: 0 });

    await service.reserveVariantStock('variant-1', 20);

    expect(row.stockReserved).toBe(20);
  });

  it('rejects a reservation that would exceed stockTotal', async () => {
    const { service } = await buildService({ stockTotal: 50, stockReserved: 40 });

    await expect(service.reserveVariantStock('variant-1', 20)).rejects.toThrow(
      BadRequestException,
    );
  });

  // Regression test for #1136: two reservations that together exceed
  // stockTotal must not both succeed.
  it('does not oversell under two concurrent reservations that together exceed stockTotal', async () => {
    const { service, row } = await buildService({ stockTotal: 50, stockReserved: 0 });

    const results = await Promise.allSettled([
      service.reserveVariantStock('variant-1', 30),
      service.reserveVariantStock('variant-1', 30),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BadRequestException);
    expect(row.stockReserved).toBe(30); // only the first reservation was applied
  });

  it('allows two concurrent reservations that both fit within stockTotal', async () => {
    const { service, row } = await buildService({ stockTotal: 50, stockReserved: 0 });

    const results = await Promise.allSettled([
      service.reserveVariantStock('variant-1', 20),
      service.reserveVariantStock('variant-1', 20),
    ]);

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(row.stockReserved).toBe(40);
  });
});
