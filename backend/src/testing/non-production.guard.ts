import {
  CanActivate,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Keeps the event-readiness testing endpoints out of production.
 *
 * Decision (#1126): these routes are registered in every environment so they
 * are documented and exercised by e2e tests, but they refuse to run when
 * NODE_ENV=production. The lifecycle suite mutates the target event's status,
 * and the load/edge-case suites write and delete tickets, payments and events
 * against the live database, so they are only safe on staging/dev data.
 *
 * Responds 404 rather than 403 so production does not advertise the routes.
 */
@Injectable()
export class NonProductionGuard implements CanActivate {
  private readonly logger = new Logger(NonProductionGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      this.logger.warn('Blocked event-testing request in production');
      throw new NotFoundException();
    }
    return true;
  }
}
