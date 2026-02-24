import { BadRequestException, Injectable } from '@nestjs/common';
import { EventStatus } from '../entities/event.entity';

const VALID_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  [EventStatus.DRAFT]: [EventStatus.PUBLISHED],
  [EventStatus.PUBLISHED]: [EventStatus.COMPLETED, EventStatus.CANCELLED],
  [EventStatus.COMPLETED]: [],
  [EventStatus.CANCELLED]: [],
};

@Injectable()
export class EventStateService {
  validateTransition(current: EventStatus, next: EventStatus): void {
    const allowed = VALID_TRANSITIONS[current];

    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Invalid status transition: "${current}" → "${next}". ` +
          (allowed.length
            ? `Allowed transitions from "${current}": ${allowed.join(', ')}.`
            : `"${current}" is a terminal state and cannot be transitioned.`),
      );
    }
  }
}
