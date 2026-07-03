
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { EventsService } from '../../events/events.service';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class OrganizerGuard implements CanActivate {
  constructor(
    @Inject(EventsService) private readonly eventsService: EventsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as User;
    const eventId = request.params.eventId;

    if (!user || !eventId) {
      return false;
    }

    const event = await this.eventsService.getEventById(eventId);
    if (event.organizerId !== user.id) {
      throw new ForbiddenException(
        'You are not authorized to perform this action.',
      );
    }

    return true;
  }
}