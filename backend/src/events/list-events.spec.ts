import { EventStatus } from './entities/event.entity';
import { buildListEventsOptions } from './build-list-events-options';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListEventsDto } from './dto/list-events.dto';

describe('buildListEventsOptions', () => {
  it('uses the documented pagination and sorting defaults', async () => {
    expect(buildListEventsOptions({})).toEqual({
      where: {},
      order: { startDate: 'ASC' },
      skip: 0,
      take: 20,
    });
  });

  it('paginates with page and limit', async () => {
    expect(buildListEventsOptions({ page: 3, limit: 15 })).toEqual(
      expect.objectContaining({ skip: 30, take: 15 }),
    );
  });

  it('filters by status', async () => {
    expect(buildListEventsOptions({ status: EventStatus.PUBLISHED })).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({ status: EventStatus.PUBLISHED }),
      }),
    );
  });

  it('filters events starting after a date', async () => {
    const options = buildListEventsOptions({
      startAfter: '2026-01-01T00:00:00.000Z',
    });
    const startDate = (options.where as any).startDate;
    expect(startDate._type).toBe('moreThanOrEqual');
    expect(startDate._value).toEqual(
      new Date('2026-01-01T00:00:00.000Z'),
    );
  });

  it('filters events starting before a date', async () => {
    const options = buildListEventsOptions({
      startBefore: '2026-12-31T23:59:59.000Z',
    });
    expect((options.where as any).startDate._type).toBe('lessThanOrEqual');
  });

  it('combines start-after and start-before into a bounded range', async () => {
    const options = buildListEventsOptions({
      startAfter: '2026-01-01T00:00:00.000Z',
      startBefore: '2026-12-31T23:59:59.000Z',
    });
    expect((options.where as any).startDate._type).toBe('and');
    expect((options.where as any).startDate._value).toHaveLength(2);
  });

  it.each([
    ['startDate', 'asc', { startDate: 'ASC' }],
    ['startDate', 'desc', { startDate: 'DESC' }],
    ['endDate', 'asc', { endDate: 'ASC' }],
    ['createdAt', 'desc', { createdAt: 'DESC' }],
    ['title', 'asc', { title: 'ASC' }],
  ] as const)('sorts by %s %s', async (sortBy, sortOrder, expected) => {
    expect(buildListEventsOptions({ sortBy, sortOrder })).toEqual(
      expect.objectContaining({ order: expected }),
    );
  });
});

describe('ListEventsDto validation', () => {
  it.each([
    ['page', '0'],
    ['limit', '101'],
    ['status', 'unknown'],
    ['startAfter', 'not-a-date'],
    ['startBefore', 'tomorrow-ish'],
    ['sortBy', 'ticketPrice'],
    ['sortOrder', 'sideways'],
  ])('rejects an invalid %s query value', async (key, value) => {
    const dto = plainToInstance(ListEventsDto, { [key]: value });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('accepts and transforms a complete valid query', async () => {
    const dto = plainToInstance(ListEventsDto, {
      page: '2',
      limit: '50',
      status: EventStatus.PUBLISHED,
      startAfter: '2026-01-01T00:00:00.000Z',
      startBefore: '2026-12-31T23:59:59.000Z',
      sortBy: 'title',
      sortOrder: 'DESC',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({
      page: 2,
      limit: 50,
      sortOrder: 'desc',
    });
  });
});
