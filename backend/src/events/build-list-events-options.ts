import {
  And,
  FindManyOptions,
  FindOptionsOrder,
  FindOptionsWhere,
  ILike,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Raw,
} from 'typeorm';
import { ListEventsDto } from './dto/list-events.dto';
import { Event } from './entities/event.entity';

export function buildListEventsOptions(
  filterDto: ListEventsDto,
): FindManyOptions<Event> {
  const {
    status,
    organizerId,
    search,
    category,
    startAfter,
    startBefore,
    page = 1,
    limit = 20,
    sortBy = 'startDate',
    sortOrder = 'asc',
  } = filterDto;
  const where: FindOptionsWhere<Event> = {};
  if (status) where.status = status;
  if (organizerId) where.organizerId = organizerId;
  if (category) where.category = category;
  if (search) where.title = ILike(`%${search}%`);
  const categoryIds = filterDto.categoryIds?.split(',').filter(Boolean);
  if (categoryIds?.length) {
    where.categories = { id: In(categoryIds) };
  }
  if (filterDto.showAvailableOnly) {
    where.maxAttendees = Raw(
      (alias) => {
        const eventIdAlias = alias.replace(/"maxAttendees"$/, '"id"');
        return (
          `(${alias} IS NULL OR ${alias} > (` +
          `SELECT COUNT(*) FROM tickets ticket ` +
          `WHERE ticket."eventId" = ${eventIdAlias} AND ticket.status = 'valid'))`
        );
      },
    );
  }
  if (startAfter && startBefore) {
    where.startDate = And(
      MoreThanOrEqual(new Date(startAfter)),
      LessThanOrEqual(new Date(startBefore)),
    );
  } else if (startAfter) {
    where.startDate = MoreThanOrEqual(new Date(startAfter));
  } else if (startBefore) {
    where.startDate = LessThanOrEqual(new Date(startBefore));
  }

  return {
    where,
    order: {
      [sortBy]: sortOrder.toUpperCase(),
    } as FindOptionsOrder<Event>,
    skip: (page - 1) * limit,
    take: limit,
    ...(categoryIds?.length ? { relations: { categories: true } } : {}),
  };
}
